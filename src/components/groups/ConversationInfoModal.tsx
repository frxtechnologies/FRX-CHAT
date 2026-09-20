import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar } from '@/components/ui/Avatar'
import { Button, Field, Modal, TextArea } from '@/components/ui/Primitives'
import { AvatarPicker } from '@/components/profile/AvatarPicker'
import { chatTitle } from '@/components/chat/ChatListItem'
import { useAuth } from '@/context/AuthContext'
import { useChatList } from '@/context/ChatListContext'
import { usePresence } from '@/context/PresenceContext'
import { useToast } from '@/context/ToastContext'
import { addMembers, removeMember, setMemberRole, updateGroup } from '@/services/conversations'
import { searchProfiles } from '@/services/profiles'
import { uploadAvatar } from '@/services/uploads'
import { debounce, formatDate, friendlyError } from '@/lib/utils'
import type { ChatListItem, Member, Profile } from '@/types'

interface Props {
  chat: ChatListItem
  members: Member[]
  onClose: () => void
  onChanged: () => void
}

export function ConversationInfoModal({ chat, members, onClose, onChanged }: Props) {
  if (chat.type === 'direct') return <DirectInfo chat={chat} members={members} onClose={onClose} />
  return <GroupInfo chat={chat} members={members} onClose={onClose} onChanged={onChanged} />
}

function DirectInfo({ chat, members, onClose }: Omit<Props, 'onChanged'>) {
  const { isOnline } = usePresence()
  const other = members.find((m) => m.user_id === chat.other_user_id)?.profile
  return (
    <Modal title="Contact info" onClose={onClose}>
      <div className="flex flex-col items-center text-center">
        <Avatar name={chatTitle(chat)} src={chat.other_avatar_url} size={96} online={isOnline(chat.other_user_id)} />
        <h3 className="mt-3 text-lg font-semibold">{chatTitle(chat)}</h3>
        <p className="text-sm text-muted">@{chat.other_username}</p>
        {other && (
          <>
            <p className="mt-4 max-w-xs whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{other.about}</p>
            <p className="mt-4 text-xs text-muted">Joined {formatDate(other.created_at)}</p>
          </>
        )}
      </div>
    </Modal>
  )
}

function GroupInfo({ chat, members, onClose, onChanged }: Props) {
  const { user } = useAuth()
  const { refresh } = useChatList()
  const { isOnline } = usePresence()
  const toast = useToast()
  const navigate = useNavigate()
  const me = user!.id
  const isAdmin = chat.my_role === 'admin'

  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(chat.name ?? '')
  const [description, setDescription] = useState(chat.description ?? '')
  const [avatar, setAvatar] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Profile[]>([])
  const [confirmLeave, setConfirmLeave] = useState(false)

  const memberIds = useMemo(() => new Set(members.map((m) => m.user_id)), [members])

  const search = useMemo(
    () =>
      debounce((text: string) => {
        searchProfiles(text, me)
          .then(setResults)
          .catch(() => setResults([]))
      }, 300),
    [me],
  )
  useEffect(() => {
    if (query.trim().length < 2) setResults([])
    else search(query)
    return () => search.cancel()
  }, [query, search])

  async function run(action: () => Promise<void>, failure: string) {
    setBusy(true)
    try {
      await action()
      onChanged()
      await refresh()
    } catch (e) {
      toast(friendlyError(e, failure), 'error')
    } finally {
      setBusy(false)
    }
  }

  const save = () =>
    run(async () => {
      const url = avatar ? await uploadAvatar(me, avatar) : undefined
      await updateGroup(chat.id, {
        name: name.trim(),
        description: description.trim() || null,
        ...(url ? { avatar_url: url } : {}),
      })
      setAvatar(null)
      setEditing(false)
    }, "Couldn't save the group changes.")

  const leave = async () => {
    setBusy(true)
    try {
      await removeMember(chat.id, me)
      await refresh()
      onClose()
      navigate('/chats', { replace: true })
    } catch (e) {
      toast(friendlyError(e, "Couldn't leave the group."), 'error')
      setBusy(false)
    }
  }

  return (
    <Modal title="Group info" onClose={onClose}>
      {editing ? (
        <div className="space-y-4">
          <AvatarPicker name={name} currentUrl={chat.avatar_url} file={avatar} onChange={setAvatar} onError={(m) => toast(m, 'error')} group />
          <Field label="Group name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          <TextArea label="Description" value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} />
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button className="flex-1" loading={busy} disabled={!name.trim()} onClick={save}>
              Save
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center text-center">
          <Avatar name={chat.name ?? 'Group'} src={chat.avatar_url} group size={96} />
          <h3 className="mt-3 text-lg font-semibold [overflow-wrap:anywhere]">{chat.name}</h3>
          <p className="text-xs text-muted">Created {formatDate(chat.created_at)}</p>
          {chat.description && <p className="mt-3 max-w-xs whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{chat.description}</p>}
          {isAdmin && (
            <Button variant="secondary" size="sm" className="mt-3" onClick={() => setEditing(true)}>
              Edit group
            </Button>
          )}
        </div>
      )}

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-xs font-medium uppercase tracking-wide text-muted">{members.length} members</h4>
          {isAdmin && (
            <button onClick={() => setAdding((a) => !a)} className="text-sm font-medium text-accent hover:underline">
              {adding ? 'Done' : 'Add people'}
            </button>
          )}
        </div>

        {adding && (
          <div className="mb-3">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or username"
              aria-label="Search people to add"
              className="h-10 w-full rounded-lg border border-line bg-bg px-3 text-sm focus:border-accent focus:outline-none"
            />
            <ul className="mt-1">
              {results
                .filter((p) => !memberIds.has(p.id))
                .map((p) => (
                  <li key={p.id} className="flex items-center gap-3 py-1.5">
                    <Avatar name={p.full_name} src={p.avatar_url} size={34} />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {p.full_name} <span className="text-muted">@{p.username}</span>
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => run(() => addMembers(chat.id, [p.id]), "Couldn't add that person.")}
                    >
                      Add
                    </Button>
                  </li>
                ))}
            </ul>
          </div>
        )}

        <ul>
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-1.5">
              <Avatar name={m.profile.full_name} src={m.profile.avatar_url} size={40} online={isOnline(m.user_id)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {m.profile.full_name}
                  {m.user_id === me && <span className="text-muted"> (you)</span>}
                </span>
                <span className="block truncate text-xs text-muted">@{m.profile.username}</span>
              </span>
              {m.role === 'admin' && <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-medium text-accent">Admin</span>}
              {isAdmin && m.user_id !== me && (
                <div className="flex gap-1">
                  {m.role === 'member' && (
                    <button
                      disabled={busy}
                      onClick={() => run(() => setMemberRole(chat.id, m.user_id, 'admin'), "Couldn't change that role.")}
                      className="rounded px-1.5 py-1 text-xs text-muted hover:text-fg"
                    >
                      Make admin
                    </button>
                  )}
                  <button
                    disabled={busy}
                    onClick={() => run(() => removeMember(chat.id, m.user_id), "Couldn't remove that member.")}
                    className="rounded px-1.5 py-1 text-xs text-danger hover:underline"
                  >
                    Remove
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-6 border-t border-line pt-4">
        {confirmLeave ? (
          <div className="flex items-center gap-2">
            <p className="flex-1 text-sm">Leave this group?</p>
            <Button variant="secondary" size="sm" onClick={() => setConfirmLeave(false)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" loading={busy} onClick={leave}>
              Leave
            </Button>
          </div>
        ) : (
          <button onClick={() => setConfirmLeave(true)} className="text-sm font-medium text-danger hover:underline">
            Leave group
          </button>
        )}
      </div>
    </Modal>
  )
}
