import { NavLink, Outlet, useMatch } from 'react-router-dom'
import { Avatar } from '@/components/ui/Avatar'
import { IconChat, IconSettings, IconUser, Logo } from '@/components/ui/Icons'
import { useAuth } from '@/context/AuthContext'
import { CallOverlay } from '@/components/calls/CallOverlay'
import { CallProvider } from '@/context/CallContext'
import { ChatListProvider, useChatList } from '@/context/ChatListContext'
import { PresenceProvider } from '@/context/PresenceContext'
import { cn } from '@/lib/utils'

function NavItems({ vertical }: { vertical: boolean }) {
  const { totalUnread } = useChatList()
  const items = [
    { to: '/chats', label: 'Chats', icon: <IconChat />, badge: totalUnread },
    { to: '/profile', label: 'Profile', icon: <IconUser />, badge: 0 },
    { to: '/settings', label: 'Settings', icon: <IconSettings />, badge: 0 },
  ]
  return (
    <>
      {items.map((it) => (
        <NavLink
          key={it.to}
          to={it.to}
          className={({ isActive }) =>
            cn(
              'relative flex items-center justify-center rounded-xl transition-colors',
              vertical ? 'h-11 w-11' : 'flex-1 flex-col gap-0.5 py-2 text-[11px] font-medium',
              isActive ? 'text-accent' : 'text-muted hover:text-fg',
              vertical && 'hover:bg-raised',
            )
          }
          aria-label={it.label}
          title={it.label}
        >
          {({ isActive }) => (
            <>
              <span className={cn('relative', vertical && isActive && 'rounded-xl')}>
                {it.icon}
                {it.badge > 0 && (
                  <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-fg">
                    {it.badge > 99 ? '99+' : it.badge}
                  </span>
                )}
              </span>
              {!vertical && <span>{it.label}</span>}
              {vertical && isActive && <span className="absolute left-[-10px] h-5 w-1 rounded-r bg-accent" />}
            </>
          )}
        </NavLink>
      ))}
    </>
  )
}

function Shell() {
  const { profile } = useAuth()
  const inConversation = Boolean(useMatch('/chats/:conversationId'))
  return (
    <div className="h-app flex bg-bg">
      <nav aria-label="Main" className="hidden w-[68px] shrink-0 flex-col items-center gap-2 border-r border-line bg-surface py-4 md:flex">
        <Logo size={34} />
        <div className="mt-4 flex flex-1 flex-col items-center gap-2">
          <NavItems vertical />
        </div>
        {profile && <Avatar name={profile.full_name} src={profile.avatar_url} size={36} />}
      </nav>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1">
          <Outlet />
        </div>
        <nav
          aria-label="Main"
          className={cn('safe-b shrink-0 border-t border-line bg-surface md:hidden', inConversation ? 'hidden' : 'flex')}
        >
          <NavItems vertical={false} />
        </nav>
      </div>
    </div>
  )
}

export default function AppShell() {
  return (
    <ChatListProvider>
      <PresenceProvider>
        <CallProvider>
          <Shell />
          <CallOverlay />
        </CallProvider>
      </PresenceProvider>
    </ChatListProvider>
  )
}
