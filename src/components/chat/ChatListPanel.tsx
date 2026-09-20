import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { brand } from '@/config/brand'
import { useAuth } from '@/context/AuthContext'
import { useChatList } from '@/context/ChatListContext'
import { usePresence } from '@/context/PresenceContext'
import { useSettings } from '@/context/SettingsContext'
import { IconPlus, IconSearch, IconUsers, IconClose } from '@/components/ui/Icons'
import { Button, EmptyState, ErrorNotice, IconButton, Skeleton } from '@/components/ui/Primitives'
import { notificationPermission, requestNotificationPermission } from '@/lib/notify'
import { debounce, formatListTime } from '@/lib/utils'
import { searchMessages } from '@/services/conversations'
import type { SearchMessageHit } from '@/types'
import { ChatListItem, chatTitle } from './ChatListItem'
import { NewChatModal } from './NewChatModal'
import { CreateGroupModal } from '../groups/CreateGroupModal'

const NOTIF_DISMISSED = 'frx.notifPromptDismissed'

function ListSkeleton() {
  return (
    <div className="space-y-1 px-3 py-2" aria-hidden="true">
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-2">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function ChatListPanel() {
  const { user } = useAuth()
  const { chats, loading, error, refresh } = useChatList()
  const { isOnline } = usePresence()
  const settings = useSettings()
  const navigate = useNavigate()
  const { conversationId } = useParams()

  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchMessageHit[]>([])
  const [searching, setSearching] = useState(false)
  const [modal, setModal] = useState<'chat' | 'group' | null>(null)
  const [promptDismissed, setPromptDismissed] = useState(() => {
    try {
      return localStorage.getItem(NOTIF_DISMISSED) === '1'
    } catch {
      return false
    }
  })

  const me = user!.id
  const open = useCallback((id: string) => navigate(`/chats/${id}`), [navigate])

  const q = query.trim().toLowerCase()
  const filtered = useMemo(() => (q ? chats.filter((c) => chatTitle(c).toLowerCase().includes(q)) : chats), [chats, q])

  // Debounced message search across the conversations I belong to (RLS-limited server-side).
  const runSearch = useMemo(
    () =>
      debounce((text: string) => {
        if (text.trim().length < 2) {
          setHits([])
          setSearching(false)
          return
        }
        searchMessages(text)
          .then(setHits)
          .catch(() => setHits([]))
          .finally(() => setSearching(false))
      }, 300),
    [],
  )
  useEffect(() => {
    if (query.trim().length >= 2) setSearching(true)
    else setHits([])
    runSearch(query)
    return () => runSearch.cancel()
  }, [query, runSearch])

  const showPrompt =
    !promptDismissed && settings.notifications && notificationPermission() === 'default' && chats.some((c) => c.last_message_id)

  const chatById = useMemo(() => new Map(chats.map((c) => [c.id, c])), [chats])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center justify-between px-4 pb-2 pt-4">
        <h1 className="text-xl font-semibold tracking-tight">Chats</h1>
        <div className="flex items-center gap-1">
          <IconButton label="New group" onClick={() => setModal('group')}>
            <IconUsers />
          </IconButton>
          <IconButton label="New chat" onClick={() => setModal('chat')} className="bg-accent text-accent-fg hover:bg-accent hover:brightness-110 hover:text-accent-fg">
            <IconPlus />
          </IconButton>
        </div>
      </header>

      <div className="px-3 pb-2">
        <div className="relative">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" width={18} height={18} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats and messages"
            aria-label="Search chats and messages"
            className="h-10 w-full rounded-lg border border-transparent bg-raised pl-10 pr-9 text-sm placeholder:text-muted focus:border-accent focus:outline-none"
          />
          {query && (
            <button
              aria-label="Clear search"
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted hover:text-fg"
            >
              <IconClose width={16} height={16} />
            </button>
          )}
        </div>
      </div>

      {showPrompt && (
        <div className="mx-3 mb-2 flex items-center gap-3 rounded-lg border border-line bg-raised/60 px-3 py-2.5 text-sm">
          <span className="flex-1 text-muted">Get notified when friends message you?</span>
          <Button
            size="sm"
            onClick={async () => {
              await requestNotificationPermission()
              setPromptDismissed(true)
            }}
          >
            Enable
          </Button>
          <button
            className="text-muted hover:text-fg"
            onClick={() => {
              setPromptDismissed(true)
              try {
                localStorage.setItem(NOTIF_DISMISSED, '1')
              } catch {
                /* ignore */
              }
            }}
          >
            Not now
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {error && !loading && <ErrorNotice message={error} onRetry={refresh} />}
        {loading ? (
          <ListSkeleton />
        ) : chats.length === 0 && !error ? (
          <EmptyState icon={<IconUsers width={26} height={26} />} title="No conversations yet">
            Find a friend and start chatting.
            <span className="mt-4 block">
              <Button onClick={() => setModal('chat')}>Start a chat</Button>
            </span>
          </EmptyState>
        ) : (
          <>
            {filtered.length > 0 && (
              <ul>
                {filtered.map((c) => (
                  <ChatListItem
                    key={c.id}
                    chat={c}
                    me={me}
                    active={c.id === conversationId}
                    online={isOnline(c.other_user_id)}
                    onOpen={open}
                  />
                ))}
              </ul>
            )}
            {q.length >= 2 && (hits.length > 0 || searching) && (
              <section aria-label="Message results">
                <h2 className="px-4 pb-1 pt-4 text-xs font-medium uppercase tracking-wide text-muted">Messages</h2>
                {searching && hits.length === 0 && <Skeleton className="mx-4 my-2 h-10" />}
                <ul>
                  {hits.map((h) => {
                    const chat = chatById.get(h.conversation_id)
                    return (
                      <li key={h.id}>
                        <button
                          onClick={() => navigate(`/chats/${h.conversation_id}?m=${h.id}`)}
                          className="block w-full px-4 py-2.5 text-left hover:bg-raised/70"
                        >
                          <span className="flex items-baseline justify-between gap-2 text-sm">
                            <span className="truncate font-medium">{chat ? chatTitle(chat) : 'Conversation'}</span>
                            <time className="shrink-0 text-xs text-muted">{formatListTime(h.created_at)}</time>
                          </span>
                          <span className="mt-0.5 block truncate text-sm text-muted">
                            {h.sender_id === me ? 'You' : h.sender_name.split(' ')[0]}: {h.content}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}
            {q && filtered.length === 0 && hits.length === 0 && !searching && (
              <EmptyState icon={<IconSearch width={26} height={26} />} title="No results found">
                Try a different name or word.
              </EmptyState>
            )}
          </>
        )}
      </div>
      <p className="sr-only">{brand.name}</p>

      {modal === 'chat' && <NewChatModal onClose={() => setModal(null)} onOpenGroup={() => setModal('group')} />}
      {modal === 'group' && <CreateGroupModal onClose={() => setModal(null)} />}
    </div>
  )
}
