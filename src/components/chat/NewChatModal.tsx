import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar } from '@/components/ui/Avatar'
import { EmptyState, Modal, Spinner } from '@/components/ui/Primitives'
import { IconSearch, IconUsers } from '@/components/ui/Icons'
import { useAuth } from '@/context/AuthContext'
import { useChatList } from '@/context/ChatListContext'
import { useToast } from '@/context/ToastContext'
import { debounce, friendlyError } from '@/lib/utils'
import { createDirectConversation } from '@/services/conversations'
import { searchProfiles } from '@/services/profiles'
import type { Profile } from '@/types'

export function NewChatModal({ onClose, onOpenGroup }: { onClose: () => void; onOpenGroup: () => void }) {
  const { user } = useAuth()
  const { refresh } = useChatList()
  const toast = useToast()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Profile[]>([])
  const [loading, setLoading] = useState(false)
  const [opening, setOpening] = useState<string | null>(null)

  const search = useMemo(
    () =>
      debounce((text: string) => {
        if (text.trim().length < 2) {
          setResults([])
          setLoading(false)
          return
        }
        searchProfiles(text, user!.id)
          .then(setResults)
          .catch((e) => {
            setResults([])
            toast(friendlyError(e, "Couldn't search for people."), 'error')
          })
          .finally(() => setLoading(false))
      }, 300),
    [user, toast],
  )

  useEffect(() => {
    setLoading(query.trim().length >= 2)
    search(query)
    return () => search.cancel()
  }, [query, search])

  async function open(p: Profile) {
    setOpening(p.id)
    try {
      const id = await createDirectConversation(p.id)
      await refresh()
      onClose()
      navigate(`/chats/${id}`)
    } catch (e) {
      toast(friendlyError(e, "Couldn't start that chat. Please try again."), 'error')
      setOpening(null)
    }
  }

  return (
    <Modal title="New chat" onClose={onClose}>
      <button
        onClick={onOpenGroup}
        className="mb-4 flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-raised"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent/15 text-accent">
          <IconUsers />
        </span>
        <span className="text-sm font-medium">New group</span>
      </button>
      <div className="relative mb-3">
        <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" width={18} height={18} />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or username"
          aria-label="Search people"
          className="h-11 w-full rounded-lg border border-line bg-bg pl-10 pr-3 text-sm focus:border-accent focus:outline-none"
        />
      </div>
      <div className="min-h-40">
        {loading ? (
          <div className="flex justify-center py-8 text-muted">
            <Spinner />
          </div>
        ) : query.trim().length < 2 ? (
          <p className="py-8 text-center text-sm text-muted">Type at least 2 characters to find a friend.</p>
        ) : results.length === 0 ? (
          <EmptyState title="No results found">Check the spelling, or ask your friend for their username.</EmptyState>
        ) : (
          <ul>
            {results.map((p) => (
              <li key={p.id}>
                <button
                  disabled={opening !== null}
                  onClick={() => open(p)}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-raised disabled:opacity-60"
                >
                  <Avatar name={p.full_name} src={p.avatar_url} size={44} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.full_name}</span>
                    <span className="block truncate text-xs text-muted">@{p.username}</span>
                  </span>
                  {opening === p.id && <Spinner size={16} />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}
