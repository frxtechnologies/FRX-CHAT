import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useMatch, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { fetchChatList } from '@/services/conversations'
import { getProfiles } from '@/services/profiles'
import { playMessageSound, showBrowserNotification } from '@/lib/notify'
import { brand } from '@/config/brand'
import { debounce, friendlyError } from '@/lib/utils'
import type { ChatListItem } from '@/types'
import { useAuth } from './AuthContext'
import { useSettings } from './SettingsContext'
import { useToast } from './ToastContext'

interface ChatListState {
  chats: ChatListItem[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  totalUnread: number
  /** Bumps whenever any membership row changes, so member lists can refetch. */
  memberVersion: number
  realtimeOk: boolean
  clearUnread: (conversationId: string) => void
}

const Ctx = createContext<ChatListState | null>(null)

/**
 * Owns the chat list and ONE realtime channel for list-level events
 * (new messages anywhere, read receipts of mine, membership/group changes).
 */
export function ChatListProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const settings = useSettings()
  const toast = useToast()
  const navigate = useNavigate()
  const match = useMatch('/chats/:conversationId')
  const activeId = match?.params.conversationId

  const [chats, setChats] = useState<ChatListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [memberVersion, setMemberVersion] = useState(0)
  const [realtimeOk, setRealtimeOk] = useState(true)

  const chatsRef = useRef(chats)
  chatsRef.current = chats
  const activeRef = useRef(activeId)
  activeRef.current = activeId
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const nameCache = useRef(new Map<string, string>())

  const refresh = useCallback(async () => {
    try {
      const list = await fetchChatList()
      setChats(list)
      setError(null)
    } catch (e) {
      setError(friendlyError(e, "Couldn't load your chats."))
    } finally {
      setLoading(false)
    }
  }, [])

  const userId = user?.id
  useEffect(() => {
    if (!userId) return
    void refresh()

    const debounced = debounce(() => void refresh(), 250)

    const notify = async (row: { id: string; conversation_id: string; sender_id: string; content: string; message_type: string }) => {
      const s = settingsRef.current
      const visibleHere = document.visibilityState === 'visible' && activeRef.current === row.conversation_id
      if (visibleHere) return
      if (s.sound) playMessageSound()
      if (!s.notifications) return
      let sender = nameCache.current.get(row.sender_id)
      if (!sender) {
        try {
          const [p] = await getProfiles([row.sender_id])
          sender = p?.full_name
          if (sender) nameCache.current.set(row.sender_id, sender)
        } catch {
          /* fall through to generic title */
        }
      }
      const chat = chatsRef.current.find((c) => c.id === row.conversation_id)
      const title = chat?.type === 'group' && chat.name ? `${chat.name}` : (sender ?? brand.name)
      const text = row.message_type === 'text' ? row.content : 'Sent an attachment'
      const body = chat?.type === 'group' && sender ? `${sender}: ${text}` : text
      if (document.visibilityState === 'hidden' || !document.hasFocus()) {
        showBrowserNotification(title, body, row.conversation_id, () => navigate(`/chats/${row.conversation_id}`))
      }
    }

    const channel = supabase
      .channel(`chatlist:${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (p) => {
        const row = p.new as { id: string; conversation_id: string; sender_id: string; content: string; message_type: string }
        if (row.sender_id !== userId) void notify(row)
        debounced()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, () => debounced())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_reads', filter: `user_id=eq.${userId}` }, () => debounced())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_members' }, () => {
        setMemberVersion((v) => v + 1)
        debounced()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations' }, () => debounced())
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setRealtimeOk((was) => {
            if (!was) void refresh() // catch up on anything missed while disconnected
            return true
          })
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setRealtimeOk(false)
        }
      })

    return () => {
      debounced.cancel()
      void supabase.removeChannel(channel)
    }
  }, [userId, refresh, navigate])

  useEffect(() => {
    if (!realtimeOk) toast('Live updates disconnected. Reconnecting…', 'info')
  }, [realtimeOk, toast])

  const totalUnread = useMemo(() => chats.reduce((n, c) => n + c.unread_count, 0), [chats])

  useEffect(() => {
    document.title = totalUnread > 0 ? `(${totalUnread}) ${brand.name}` : brand.name
  }, [totalUnread])

  const clearUnread = useCallback((id: string) => {
    setChats((list) => list.map((c) => (c.id === id && c.unread_count > 0 ? { ...c, unread_count: 0 } : c)))
  }, [])

  const value = useMemo<ChatListState>(
    () => ({ chats, loading, error, refresh, totalUnread, memberVersion, realtimeOk, clearUnread }),
    [chats, loading, error, refresh, totalUnread, memberVersion, realtimeOk, clearUnread],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useChatList() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useChatList must be used inside ChatListProvider')
  return v
}
