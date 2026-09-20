import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { isImageType } from '@/lib/files'
import { friendlyError, newId } from '@/lib/utils'
import {
  addReaction,
  deleteMessage,
  editMessage,
  fetchMessage,
  fetchMessages,
  removeReaction,
  sendMessage,
  PAGE_SIZE,
} from '@/services/messages'
import { uploadAttachments } from '@/services/uploads'
import { useToast } from '@/context/ToastContext'
import type { Message, Reaction } from '@/types'

interface Pending {
  content: string
  files: File[]
  replyTo: string | null
}

export interface SendInput {
  content: string
  files: File[]
  replyTo: Message | null
}

function insertSorted(list: Message[], m: Message): Message[] {
  let i = list.length
  while (i > 0 && list[i - 1].created_at > m.created_at) i--
  return [...list.slice(0, i), m, ...list.slice(i)]
}

function upsert(list: Message[], m: Message): Message[] {
  const idx = list.findIndex((x) => x.id === m.id)
  if (idx < 0) return insertSorted(list, m)
  const next = list.slice()
  next[idx] = m
  return next.sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0))
}

function patch(list: Message[], id: string, fn: (m: Message) => Message): Message[] {
  const idx = list.findIndex((m) => m.id === id)
  if (idx < 0) return list
  const next = list.slice()
  next[idx] = fn(list[idx])
  return next
}

/** Messages for one conversation: paging, optimistic sends, realtime sync. */
export function useMessages(conversationId: string, userId: string) {
  const toast = useToast()
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [live, setLive] = useState(true)

  const messagesRef = useRef(messages)
  messagesRef.current = messages
  const hasMoreRef = useRef(hasMore)
  hasMoreRef.current = hasMore
  const busyOlder = useRef(false)
  const pending = useRef(new Map<string, Pending>())

  // Initial page
  useEffect(() => {
    let cancelled = false
    setMessages([])
    setLoading(true)
    setError(null)
    setHasMore(false)
    fetchMessages(conversationId)
      .then((page) => {
        if (cancelled) return
        setMessages(page)
        setHasMore(page.length === PAGE_SIZE)
      })
      .catch((e) => !cancelled && setError(friendlyError(e, "Couldn't load messages.")))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [conversationId])

  // Realtime: one channel per open conversation, removed on unmount / conversation switch.
  useEffect(() => {
    let everSubscribed = false
    const withFilter = { schema: 'public', filter: `conversation_id=eq.${conversationId}` } as const

    const refetch = async (id: string) => {
      try {
        const full = await fetchMessage(id)
        if (full) setMessages((l) => upsert(l, full))
      } catch {
        /* the next reconnect/gap-fill will pick it up */
      }
    }

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on('postgres_changes', { event: 'INSERT', table: 'messages', ...withFilter }, (p) => {
        const id = (p.new as { id: string }).id
        if (messagesRef.current.some((m) => m.id === id && !m.status)) return
        void refetch(id)
      })
      .on('postgres_changes', { event: 'UPDATE', table: 'messages', ...withFilter }, (p) => {
        const row = p.new as Pick<Message, 'id' | 'content' | 'edited_at' | 'deleted_at'>
        setMessages((l) =>
          l.map((m) => {
            if (m.id === row.id) {
              return {
                ...m,
                content: row.content,
                edited_at: row.edited_at,
                deleted_at: row.deleted_at,
                attachments: row.deleted_at ? [] : m.attachments,
                reply: m.reply,
              }
            }
            if (m.reply?.id === row.id) {
              return { ...m, reply: { ...m.reply, content: row.content, deleted_at: row.deleted_at } }
            }
            return m
          }),
        )
      })
      .on('postgres_changes', { event: 'INSERT', table: 'attachments', ...withFilter }, (p) => {
        void refetch((p.new as { message_id: string }).message_id)
      })
      .on('postgres_changes', { event: 'INSERT', table: 'message_reactions', ...withFilter }, (p) => {
        const r = p.new as Reaction
        setMessages((l) =>
          patch(l, r.message_id, (m) => {
            const rest = m.reactions.filter(
              (x) => !(x.user_id === r.user_id && x.reaction === r.reaction),
            )
            return { ...m, reactions: [...rest, r] }
          }),
        )
      })
      // DELETE payloads carry only the primary key (RLS can't filter them), so match by id.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'message_reactions' }, (p) => {
        const id = (p.old as { id?: string }).id
        if (!id) return
        setMessages((l) =>
          l.some((m) => m.reactions.some((r) => r.id === id))
            ? l.map((m) =>
                m.reactions.some((r) => r.id === id) ? { ...m, reactions: m.reactions.filter((r) => r.id !== id) } : m,
              )
            : l,
        )
      })
      .on('postgres_changes', { event: 'INSERT', table: 'message_reads', ...withFilter }, (p) => {
        const r = p.new as { message_id: string; user_id: string }
        setMessages((l) =>
          patch(l, r.message_id, (m) => (m.reads.includes(r.user_id) ? m : { ...m, reads: [...m.reads, r.user_id] })),
        )
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setLive(true)
          if (everSubscribed) {
            // Reconnected: pull the newest page to fill any gap.
            fetchMessages(conversationId)
              .then((page) => setMessages((l) => page.reduce(upsert, l)))
              .catch(() => {})
          }
          everSubscribed = true
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setLive(false)
        }
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [conversationId])

  const loadOlder = useCallback(async () => {
    if (busyOlder.current || !hasMoreRef.current) return false
    const oldest = messagesRef.current.find((m) => !m.status)
    if (!oldest) return false
    busyOlder.current = true
    setLoadingOlder(true)
    try {
      const page = await fetchMessages(conversationId, oldest.created_at)
      setMessages((l) => page.reduce(upsert, l))
      setHasMore(page.length === PAGE_SIZE)
      return page.length > 0
    } catch (e) {
      toast(friendlyError(e, "Couldn't load older messages."), 'error')
      return false
    } finally {
      busyOlder.current = false
      setLoadingOlder(false)
    }
  }, [conversationId, toast])

  /** Make sure a message is loaded (paging backwards if needed). */
  const ensureLoaded = useCallback(
    async (id: string) => {
      for (let i = 0; i < 25; i++) {
        if (messagesRef.current.some((m) => m.id === id)) return true
        if (!hasMoreRef.current) return false
        if (!(await loadOlder())) return false
      }
      return messagesRef.current.some((m) => m.id === id)
    },
    [loadOlder],
  )

  const runSend = useCallback(
    async (id: string) => {
      const job = pending.current.get(id)
      if (!job) return
      try {
        const uploaded = await uploadAttachments(conversationId, job.files)
        await sendMessage({
          id,
          conversationId,
          content: job.content,
          type: job.files.length === 0 ? 'text' : job.files.every((f) => isImageType(f.type)) ? 'image' : 'file',
          replyTo: job.replyTo,
          attachments: uploaded,
        })
        pending.current.delete(id)
        const full = await fetchMessage(id)
        if (full) setMessages((l) => upsert(l, full))
        else setMessages((l) => patch(l, id, (m) => ({ ...m, status: undefined })))
      } catch (e) {
        setMessages((l) => patch(l, id, (m) => ({ ...m, status: 'failed' })))
        toast(
          e instanceof Error && /larger than|can't be sent|is empty/.test(e.message)
            ? e.message
            : friendlyError(e, "Message couldn't be sent. Please try again."),
          'error',
        )
      }
    },
    [conversationId, toast],
  )

  const send = useCallback(
    ({ content, files, replyTo }: SendInput) => {
      const id = newId()
      pending.current.set(id, { content, files, replyTo: replyTo?.id ?? null })
      const optimistic: Message = {
        id,
        conversation_id: conversationId,
        sender_id: userId,
        content,
        message_type: files.length === 0 ? 'text' : files.every((f) => isImageType(f.type)) ? 'image' : 'file',
        reply_to: replyTo?.id ?? null,
        edited_at: null,
        deleted_at: null,
        created_at: new Date().toISOString(),
        attachments: files.map((f, i) => ({
          id: `${id}:${i}`,
          message_id: id,
          storage_path: '',
          file_name: f.name,
          file_type: f.type,
          file_size: f.size,
          localUrl: isImageType(f.type) ? URL.createObjectURL(f) : undefined,
        })),
        reactions: [],
        reads: [],
        reply: replyTo
          ? {
              id: replyTo.id,
              content: replyTo.content,
              sender_id: replyTo.sender_id,
              deleted_at: replyTo.deleted_at,
              message_type: replyTo.message_type,
            }
          : null,
        status: 'sending',
      }
      setMessages((l) => upsert(l, optimistic))
      void runSend(id)
      return id
    },
    [conversationId, userId, runSend],
  )

  const retry = useCallback(
    (id: string) => {
      setMessages((l) => patch(l, id, (m) => ({ ...m, status: 'sending' })))
      void runSend(id)
    },
    [runSend],
  )

  const discard = useCallback((id: string) => {
    pending.current.delete(id)
    setMessages((l) => l.filter((m) => m.id !== id))
  }, [])

  const edit = useCallback(
    async (id: string, content: string) => {
      const before = messagesRef.current.find((m) => m.id === id)
      if (!before) return
      setMessages((l) => patch(l, id, (m) => ({ ...m, content, edited_at: new Date().toISOString() })))
      try {
        await editMessage(id, content)
      } catch (e) {
        setMessages((l) => patch(l, id, () => before))
        toast(friendlyError(e, "Couldn't edit that message."), 'error')
      }
    },
    [toast],
  )

  const remove = useCallback(
    async (id: string) => {
      const before = messagesRef.current.find((m) => m.id === id)
      if (!before) return
      setMessages((l) => patch(l, id, (m) => ({ ...m, content: '', deleted_at: new Date().toISOString(), attachments: [] })))
      try {
        await deleteMessage(id)
      } catch (e) {
        setMessages((l) => patch(l, id, () => before))
        toast(friendlyError(e, "Couldn't delete that message."), 'error')
      }
    },
    [toast],
  )

  const toggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      const msg = messagesRef.current.find((m) => m.id === messageId)
      if (!msg || msg.deleted_at || msg.status) return
      const mine = msg.reactions.find((r) => r.user_id === userId && r.reaction === emoji)
      if (mine) {
        setMessages((l) => patch(l, messageId, (m) => ({ ...m, reactions: m.reactions.filter((r) => r.id !== mine.id) })))
        try {
          await removeReaction(messageId, userId, emoji)
        } catch (e) {
          setMessages((l) => patch(l, messageId, (m) => ({ ...m, reactions: [...m.reactions, mine] })))
          toast(friendlyError(e, "Couldn't remove your reaction."), 'error')
        }
      } else {
        const temp: Reaction = { id: `tmp:${newId()}`, message_id: messageId, user_id: userId, reaction: emoji }
        setMessages((l) => patch(l, messageId, (m) => ({ ...m, reactions: [...m.reactions, temp] })))
        try {
          await addReaction(messageId, userId, emoji)
        } catch (e) {
          setMessages((l) => patch(l, messageId, (m) => ({ ...m, reactions: m.reactions.filter((r) => r.id !== temp.id) })))
          toast(friendlyError(e, "Couldn't add your reaction."), 'error')
        }
      }
    },
    [userId, toast],
  )

  return {
    messages,
    loading,
    loadingOlder,
    hasMore,
    error,
    live,
    loadOlder,
    ensureLoaded,
    send,
    retry,
    discard,
    edit,
    remove,
    toggleReaction,
  }
}
