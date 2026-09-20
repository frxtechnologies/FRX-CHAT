import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconCopy, IconEdit, IconReply, IconTrash } from '@/components/ui/Icons'
import { cn } from '@/lib/utils'
import { REACTIONS, type Message } from '@/types'

interface Props {
  message: Message
  mine: boolean
  myReactions: ReadonlySet<string>
  onClose: () => void
  onReact: (emoji: string) => void
  onReply: () => void
  onCopy: () => void
  onEdit: () => void
  onDelete: () => void
}

function Item({ icon, children, onClick, danger }: { icon: ReactNode; children: ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-raised',
        danger && 'text-danger',
      )}
    >
      {icon}
      {children}
    </button>
  )
}

/** Bottom sheet on phones, centred card on desktop. */
export function MessageMenu({ message, mine, myReactions, onClose, onReact, onReply, onCopy, onEdit, onDelete }: Props) {
  const [confirming, setConfirming] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const canEdit = mine && message.message_type === 'text' && !message.deleted_at
  const canCopy = Boolean(message.content)

  return createPortal(
    <div className="fixed inset-0 z-50 flex animate-fade items-end justify-center bg-black/50 sm:items-center" onMouseDown={onClose}>
      <div
        role="menu"
        aria-label="Message actions"
        onMouseDown={(e) => e.stopPropagation()}
        className="safe-b w-full max-w-sm animate-sheet rounded-t-2xl border border-line bg-surface p-3 shadow-2xl sm:rounded-2xl"
      >
        {confirming ? (
          <div className="p-2">
            <p className="text-sm font-medium">Delete this message?</p>
            <p className="mt-1 text-sm text-muted">It will show as deleted for everyone in the chat.</p>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setConfirming(false)} className="h-10 flex-1 rounded-lg bg-raised text-sm font-medium hover:bg-line/70">
                Cancel
              </button>
              <button onClick={onDelete} className="h-10 flex-1 rounded-lg bg-danger text-sm font-medium text-white hover:brightness-110">
                Delete
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-2 flex justify-between rounded-full bg-raised px-2 py-1.5">
              {REACTIONS.map((e) => (
                <button
                  key={e}
                  onClick={() => onReact(e)}
                  aria-label={`React ${e}`}
                  aria-pressed={myReactions.has(e)}
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-full text-xl transition-transform hover:scale-110',
                    myReactions.has(e) && 'bg-accent/25',
                  )}
                >
                  {e}
                </button>
              ))}
            </div>
            <Item icon={<IconReply />} onClick={onReply}>
              Reply
            </Item>
            {canCopy && (
              <Item icon={<IconCopy />} onClick={onCopy}>
                Copy text
              </Item>
            )}
            {canEdit && (
              <Item icon={<IconEdit />} onClick={onEdit}>
                Edit
              </Item>
            )}
            {mine && (
              <Item icon={<IconTrash />} onClick={() => setConfirming(true)} danger>
                Delete
              </Item>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
