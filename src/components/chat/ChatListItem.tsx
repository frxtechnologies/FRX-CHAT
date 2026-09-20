import { memo } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { callLabel } from '@/lib/calls'
import { cn, formatListTime } from '@/lib/utils'
import type { ChatListItem as Item } from '@/types'

export function chatTitle(c: Item) {
  return c.type === 'group' ? (c.name ?? 'Group') : (c.other_full_name ?? 'Unknown user')
}

function previewText(c: Item, me: string) {
  if (!c.last_message_id) return 'No messages yet'
  if (c.last_message_deleted) return 'This message was deleted'
  if (c.last_message_type === 'call') return callLabel(c.last_message_content ?? '', c.last_message_sender_id === me)
  const body =
    c.last_message_type === 'image' && !c.last_message_content
      ? 'Photo'
      : c.last_message_type === 'file' && !c.last_message_content
        ? 'File'
        : (c.last_message_content ?? '')
  if (c.last_message_sender_id === me) return `You: ${body}`
  if (c.type === 'group' && c.last_message_sender_name) return `${c.last_message_sender_name.split(' ')[0]}: ${body}`
  return body
}

interface Props {
  chat: Item
  me: string
  active: boolean
  online: boolean
  onOpen: (id: string) => void
}

export const ChatListItem = memo(function ChatListItem({ chat, me, active, online, onOpen }: Props) {
  const title = chatTitle(chat)
  const unread = chat.unread_count
  return (
    <li>
      <button
        onClick={() => onOpen(chat.id)}
        aria-current={active ? 'true' : undefined}
        className={cn(
          'flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors',
          active ? 'bg-accent/15' : 'hover:bg-raised/70',
        )}
      >
        <Avatar
          name={title}
          src={chat.type === 'group' ? chat.avatar_url : chat.other_avatar_url}
          group={chat.type === 'group'}
          online={chat.type === 'direct' && online}
          size={48}
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className={cn('truncate text-[15px]', unread ? 'font-semibold' : 'font-medium')}>{title}</span>
            <time
              className={cn('shrink-0 text-xs', unread ? 'font-medium text-accent' : 'text-muted')}
              dateTime={chat.last_message_created_at ?? chat.last_message_at}
            >
              {formatListTime(chat.last_message_created_at ?? chat.last_message_at)}
            </time>
          </span>
          <span className="mt-0.5 flex items-center justify-between gap-2">
            <span className={cn('truncate text-sm', unread ? 'text-fg' : 'text-muted', chat.last_message_deleted && 'italic')}>
              {previewText(chat, me)}
            </span>
            {unread > 0 && (
              <span
                aria-label={`${unread} unread`}
                className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-accent-fg"
              >
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </span>
        </span>
      </button>
    </li>
  )
})
