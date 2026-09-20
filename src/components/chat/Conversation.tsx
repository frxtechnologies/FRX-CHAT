import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ConversationInfoModal } from '@/components/groups/ConversationInfoModal'
import { IconChat } from '@/components/ui/Icons'
import { EmptyState, Skeleton } from '@/components/ui/Primitives'
import { Composer } from '@/components/messages/Composer'
import { Lightbox } from '@/components/messages/AttachmentView'
import { MessageList } from '@/components/messages/MessageList'
import { MessageMenu } from '@/components/messages/MessageMenu'
import { useAuth } from '@/context/AuthContext'
import { useChatList } from '@/context/ChatListContext'
import { usePresence } from '@/context/PresenceContext'
import { useToast } from '@/context/ToastContext'
import { useMembers } from '@/hooks/useMembers'
import { useMessages } from '@/hooks/useMessages'
import { useOnlineStatus, usePageActive } from '@/hooks/useMisc'
import { useTyping } from '@/hooks/useTyping'
import { friendlyError } from '@/lib/utils'
import { markConversationRead } from '@/services/messages'
import { getProfiles } from '@/services/profiles'
import type { Message, Profile } from '@/types'
import { ChatHeader } from './ChatHeader'

export function Conversation({ conversationId }: { conversationId: string }) {
  const { user, profile } = useAuth()
  const me = user!.id
  const toast = useToast()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { chats, loading: chatsLoading, clearUnread, realtimeOk } = useChatList()
  const { onlineIds } = usePresence()
  const online = useOnlineStatus()
  const pageActive = usePageActive()

  const chat = chats.find((c) => c.id === conversationId)
  const { members, reload: reloadMembers } = useMembers(conversationId)
  const msgs = useMessages(conversationId, me)
  const { typingNames, notifyTyping, stopTyping } = useTyping(conversationId, me, profile?.full_name ?? 'Someone')

  const [menuFor, setMenuFor] = useState<Message | null>(null)
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [editing, setEditing] = useState<Message | null>(null)
  const [lightbox, setLightbox] = useState<{ url: string; name: string; path: string } | null>(null)
  const [infoOpen, setInfoOpen] = useState(false)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const highlightTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  // ── profiles for names/avatars: members first, then anyone who has since left ──
  const [extra, setExtra] = useState<Record<string, Profile>>({})
  const profiles = useMemo(() => {
    const map: Record<string, Profile> = { ...extra }
    for (const m of members) map[m.user_id] = m.profile
    return map
  }, [members, extra])

  useEffect(() => {
    const missing = new Set<string>()
    for (const m of msgs.messages) {
      if (!profiles[m.sender_id]) missing.add(m.sender_id)
      if (m.reply && !profiles[m.reply.sender_id]) missing.add(m.reply.sender_id)
    }
    if (missing.size === 0 || members.length === 0) return
    let cancelled = false
    getProfiles([...missing])
      .then((list) => !cancelled && setExtra((e) => ({ ...e, ...Object.fromEntries(list.map((p) => [p.id, p])) })))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [msgs.messages, profiles, members.length])

  // ── read receipts: mark as read while this chat is open and visible ──
  const unreadLocal = useMemo(
    () => msgs.messages.filter((m) => m.sender_id !== me && !m.deleted_at && !m.status && !m.reads.includes(me)).length,
    [msgs.messages, me],
  )
  const serverUnread = chat?.unread_count ?? 0
  useEffect(() => {
    if (!pageActive || msgs.loading || (unreadLocal === 0 && serverUnread === 0)) return
    const t = setTimeout(() => {
      markConversationRead(conversationId)
        .then(() => clearUnread(conversationId))
        .catch(() => {})
    }, 350)
    return () => clearTimeout(t)
  }, [pageActive, msgs.loading, unreadLocal, serverUnread, conversationId, clearUnread])

  // ── jumping to a message (reply preview click / search result) ──
  const { ensureLoaded } = msgs
  const jumpTo = useCallback(
    async (id: string) => {
      const found = await ensureLoaded(id)
      if (!found) return toast('That message is no longer available.', 'info')
      requestAnimationFrame(() => {
        document.getElementById(`msg-${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
        setHighlightId(id)
        clearTimeout(highlightTimer.current)
        highlightTimer.current = setTimeout(() => setHighlightId(null), 1600)
      })
    },
    [ensureLoaded, toast],
  )
  useEffect(() => () => clearTimeout(highlightTimer.current), [])

  const targetMessage = params.get('m')
  useEffect(() => {
    if (!targetMessage || msgs.loading) return
    void jumpTo(targetMessage)
    setParams({}, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetMessage, msgs.loading])

  // ── actions ──
  const openMenu = useCallback((m: Message) => setMenuFor(m), [])
  const openImage = useCallback((url: string, name: string, path: string) => setLightbox({ url, name, path }), [])
  const { toggleReaction, retry, discard } = msgs

  if (chatsLoading) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex h-16 items-center gap-3 border-b border-line px-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
    )
  }
  if (!chat) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState icon={<IconChat width={26} height={26} />} title="Conversation not available">
          It may have been removed, or you're no longer a member.
          <button onClick={() => navigate('/chats')} className="mt-3 block w-full font-medium text-accent hover:underline">
            Back to chats
          </button>
        </EmptyState>
      </div>
    )
  }

  const isGroup = chat.type === 'group'
  const menuMine = menuFor?.sender_id === me
  const myReactions = new Set(menuFor?.reactions.filter((r) => r.user_id === me).map((r) => r.reaction))
  const replyName = replyTo ? (replyTo.sender_id === me ? 'yourself' : (profiles[replyTo.sender_id]?.full_name ?? null)) : null

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <ChatHeader chat={chat} me={me} members={members} typingNames={typingNames} onBack={() => navigate('/chats')} onInfo={() => setInfoOpen(true)} />

      {(!online || !realtimeOk || !msgs.live) && (
        <div role="status" className="bg-danger/15 px-4 py-1.5 text-center text-xs">
          {!online ? "You're offline. Messages can't be sent until you reconnect." : 'Reconnecting to live updates…'}
        </div>
      )}

      <MessageList
        messages={msgs.messages}
        me={me}
        isGroup={isGroup}
        members={members}
        profiles={profiles}
        onlineIds={onlineIds}
        loading={msgs.loading}
        loadingOlder={msgs.loadingOlder}
        hasMore={msgs.hasMore}
        error={msgs.error}
        highlightId={highlightId}
        onLoadOlder={msgs.loadOlder}
        onMenu={openMenu}
        onReact={toggleReaction}
        onJump={jumpTo}
        onRetry={retry}
        onDiscard={discard}
        onOpenImage={openImage}
      />

      <div aria-live="polite" className="h-5 shrink-0 bg-bg px-6 text-xs text-muted">
        {typingNames.length > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="flex gap-0.5" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <span key={i} className="typing-dot h-1 w-1 rounded-full bg-muted" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </span>
            {typingNames.length === 1 ? `${typingNames[0].split(' ')[0]} is typing...` : 'Several people are typing...'}
          </span>
        )}
      </div>

      <Composer
        replyTo={replyTo}
        replyToName={replyName}
        editing={editing}
        onError={(m) => toast(m, 'error')}
        onTyping={notifyTyping}
        onStopTyping={stopTyping}
        onCancelContext={() => {
          setReplyTo(null)
          setEditing(null)
        }}
        onSend={(content, files) => {
          msgs.send({ content, files, replyTo })
          setReplyTo(null)
        }}
        onSaveEdit={(content) => {
          if (editing) void msgs.edit(editing.id, content)
          setEditing(null)
        }}
      />

      {menuFor && (
        <MessageMenu
          message={menuFor}
          mine={menuMine}
          myReactions={myReactions}
          onClose={() => setMenuFor(null)}
          onReact={(e) => {
            void toggleReaction(menuFor.id, e)
            setMenuFor(null)
          }}
          onReply={() => {
            setEditing(null)
            setReplyTo(menuFor)
            setMenuFor(null)
          }}
          onCopy={() => {
            navigator.clipboard
              .writeText(menuFor.content)
              .then(() => toast('Copied to clipboard.', 'success'))
              .catch((e) => toast(friendlyError(e, "Couldn't copy the text."), 'error'))
            setMenuFor(null)
          }}
          onEdit={() => {
            setReplyTo(null)
            setEditing(menuFor)
            setMenuFor(null)
          }}
          onDelete={() => {
            void msgs.remove(menuFor.id)
            if (editing?.id === menuFor.id) setEditing(null)
            if (replyTo?.id === menuFor.id) setReplyTo(null)
            setMenuFor(null)
          }}
        />
      )}
      {lightbox && <Lightbox {...lightbox} onClose={() => setLightbox(null)} />}
      {infoOpen && <ConversationInfoModal chat={chat} members={members} onClose={() => setInfoOpen(false)} onChanged={reloadMembers} />}
    </div>
  )
}

