import { useParams } from 'react-router-dom'
import { ChatListPanel } from '@/components/chat/ChatListPanel'
import { Conversation } from '@/components/chat/Conversation'
import { Logo } from '@/components/ui/Icons'
import { brand } from '@/config/brand'
import { cn } from '@/lib/utils'

function Welcome() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center">
      <Logo size={56} />
      <h2 className="mt-5 text-xl font-semibold tracking-tight">Welcome to {brand.name}</h2>
      <p className="mt-1.5 text-sm text-muted">Select a conversation to start messaging.</p>
    </div>
  )
}

/** Two panes on desktop; on phones only one pane shows at a time (list → conversation). */
export default function Messenger() {
  const { conversationId } = useParams()
  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <aside
        className={cn(
          'min-h-0 w-full shrink-0 border-r border-line bg-surface md:block md:w-[340px] lg:w-[380px]',
          conversationId ? 'hidden' : 'block',
        )}
      >
        <ChatListPanel />
      </aside>
      <main className={cn('min-h-0 min-w-0 flex-1', conversationId ? 'block' : 'hidden md:block')}>
        {conversationId ? <Conversation key={conversationId} conversationId={conversationId} /> : <Welcome />}
      </main>
    </div>
  )
}
