import { Avatar } from '@/components/ui/Avatar'
import { IconBack, IconPhone, IconVideo } from '@/components/ui/Icons'
import { IconButton } from '@/components/ui/Primitives'
import { usePresence } from '@/context/PresenceContext'
import { useLastSeen } from '@/hooks/useMisc'
import { cn, formatLastSeen } from '@/lib/utils'
import type { ChatListItem, Member } from '@/types'
import { chatTitle } from './ChatListItem'

interface Props {
  chat: ChatListItem
  me: string
  members: Member[]
  typingNames: string[]
  onBack: () => void
  onInfo: () => void
  onCall?: (video: boolean) => void
}

export function ChatHeader({ chat, me, members, typingNames, onBack, onInfo, onCall }: Props) {
  const { isOnline } = usePresence()
  const title = chatTitle(chat)
  const isGroup = chat.type === 'group'
  const otherId = chat.other_user_id
  const online = !isGroup && isOnline(otherId)
  const lastSeen = useLastSeen(isGroup ? null : otherId, online)

  let status: string
  let live = false
  if (typingNames.length > 0) {
    live = true
    status = isGroup
      ? typingNames.length === 1
        ? `${typingNames[0].split(' ')[0]} is typing…`
        : 'Several people are typing…'
      : 'typing…'
  } else if (isGroup) {
    const onlineCount = members.filter((m) => m.user_id !== me && isOnline(m.user_id)).length
    status = `${members.length || '…'} members${onlineCount ? ` · ${onlineCount} online` : ''}`
  } else if (online) {
    live = true
    status = 'Online'
  } else {
    status = lastSeen ? formatLastSeen(lastSeen) : 'Offline'
  }

  return (
    <header className="flex h-16 shrink-0 items-center gap-1 border-b border-line bg-surface px-2 md:px-4">
      <IconButton label="Back to chats" onClick={onBack} className="md:hidden">
        <IconBack />
      </IconButton>
      <button onClick={onInfo} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg py-1.5 pr-2 text-left hover:bg-raised/60 md:pl-1">
        <Avatar
          name={title}
          src={isGroup ? chat.avatar_url : chat.other_avatar_url}
          group={isGroup}
          online={online}
          size={42}
        />
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-semibold leading-tight">{title}</span>
          <span className={cn('block truncate text-xs', live ? 'text-ok' : 'text-muted')} aria-live="polite">
            {status}
          </span>
        </span>
      </button>
      {!isGroup && onCall && (
        <div className="flex shrink-0 items-center">
          <IconButton label="Voice call" onClick={() => onCall(false)}>
            <IconPhone />
          </IconButton>
          <IconButton label="Video call" onClick={() => onCall(true)}>
            <IconVideo />
          </IconButton>
        </div>
      )}
    </header>
  )
}
