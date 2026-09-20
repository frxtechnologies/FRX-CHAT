import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar } from '@/components/ui/Avatar'
import { Button, Field, Modal, TextArea } from '@/components/ui/Primitives'
import { AvatarPicker } from '@/components/profile/AvatarPicker'
import { IconCheck } from '@/components/ui/Icons'
import { useAuth } from '@/context/AuthContext'
import { useChatList } from '@/context/ChatListContext'
import { useToast } from '@/context/ToastContext'
import { cn, debounce, friendlyError } from '@/lib/utils'
import { createGroup } from '@/services/conversations'
import { searchProfiles } from '@/services/profiles'
import { uploadAvatar } from '@/services/uploads'
import type { Profile } from '@/types'

export function CreateGroupModal({ onClose }: { onClose: () => void }) {
  const { user } = useAuth()
  const { refresh } = useChatList()
  const toast = useToast()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [avatar, setAvatar] = useState<File | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Profile[]>([])
  const [selected, setSelected] = useState<Map<string, Profile>>(new Map())
  const [busy, setBusy] = useState(false)

  const search = useMemo(
    () =>
      debounce((text: string) => {
        searchProfiles(text, user!.id)
          .then(setResults)
          .catch(() => setResults([]))
      }, 300),
    [user],
  )
  useEffect(() => {
    if (query.trim().length < 2) setResults([])
    else search(query)
    return () => search.cancel()
  }, [query, search])

  function toggle(p: Profile) {
    setSelected((m) => {
      const next = new Map(m)
      if (!next.delete(p.id)) next.set(p.id, p)
      return next
    })
  }

  async function create() {
    setBusy(true)
    try {
      const avatarUrl = avatar ? await uploadAvatar(user!.id, avatar) : null
      const id = await createGroup({ name, description, avatarUrl, memberIds: [...selected.keys()] })
      await refresh()
      onClose()
      navigate(`/chats/${id}`)
    } catch (e) {
      toast(friendlyError(e, "Couldn't create the group. Please try again."), 'error')
      setBusy(false)
    }
  }

  return (
    <Modal title="New group" onClose={onClose}>
      <div className="space-y-4">
        <AvatarPicker name={name} file={avatar} onChange={setAvatar} onError={(m) => toast(m, 'error')} group />
        <Field label="Group name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        <TextArea label="Description (optional)" value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} />
        <div>
          <label htmlFor="add-people" className="mb-1.5 block text-xs font-medium text-muted">
            Add people
          </label>
          {selected.size > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {[...selected.values()].map((p) => (
                <button
                  key={p.id}
                  onClick={() => toggle(p)}
                  className="rounded-full bg-accent/15 px-2.5 py-1 text-xs text-accent hover:bg-accent/25"
                  aria-label={`Remove ${p.full_name}`}
                >
                  {p.full_name} ✕
                </button>
              ))}
            </div>
          )}
          <input
            id="add-people"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or username"
            className="h-11 w-full rounded-lg border border-line bg-bg px-3 text-sm focus:border-accent focus:outline-none"
          />
          <ul className="mt-1 max-h-48 overflow-y-auto">
            {results.map((p) => {
              const on = selected.has(p.id)
              return (
                <li key={p.id}>
                  <button
                    onClick={() => toggle(p)}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-raised"
                  >
                    <Avatar name={p.full_name} src={p.avatar_url} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{p.full_name}</span>
                      <span className="block truncate text-xs text-muted">@{p.username}</span>
                    </span>
                    <span
                      className={cn(
                        'flex h-5 w-5 items-center justify-center rounded-full border',
                        on ? 'border-accent bg-accent text-accent-fg' : 'border-line',
                      )}
                    >
                      {on && <IconCheck width={14} height={14} />}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
        <Button className="w-full" loading={busy} disabled={!name.trim() || selected.size === 0} onClick={create}>
          Create group{selected.size > 0 ? ` (${selected.size + 1} members)` : ''}
        </Button>
      </div>
    </Modal>
  )
}
