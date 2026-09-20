import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { IconChevronDown } from '@/components/ui/Icons'
import { EmptyState, ErrorNotice, Skeleton, Spinner } from '@/components/ui/Primitives'
import { IconChat } from '@/components/ui/Icons'
import { cn, formatDayHeading } from '@/lib/utils'
import type { Member, Message, Profile } from '@/types'
import { MessageBubble, type ReceiptState } from './MessageBubble'

interface Props {
  messages: Message[]
  me: string
  isGroup: boolean
  members: Member[]
  profiles: Record<string, Profile>
  onlineIds: ReadonlySet<string>
  loading: boolean
  loadingOlder: boolean
  hasMore: boolean
  error: string | null
  highlightId: string | null
  onLoadOlder: () => void
  onMenu: (m: Message) => void
  onReact: (id: string, emoji: string) => void
  onJump: (id: string) => void
  onRetry: (id: string) => void
  onDiscard: (id: string) => void
  onOpenImage: (url: string, name: string, path: string) => void
}

const NEAR_BOTTOM_PX = 140

function MessagesSkeleton() {
  const rows = [
    ['w-44', false],
    ['w-64', false],
    ['w-52', true],
    ['w-36', true],
    ['w-72', false],
    ['w-48', true],
  ] as const
  return (
    <div className="flex flex-1 flex-col justify-end gap-3 px-4 py-6" aria-hidden="true">
      {rows.map(([w, mine], i) => (
        <div key={i} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
          <Skeleton className={cn('h-10 rounded-2xl', w)} />
        </div>
      ))}
    </div>
  )
}

export function MessageList(props: Props) {
  const { messages, me, isGroup, members, profiles, onlineIds, loading, loadingOlder, hasMore, error, highlightId, onLoadOlder } = props
  const scroller = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const prev = useRef({ first: '', last: '', height: 0, count: 0 })
  const [away, setAway] = useState(false)

  const scrollToBottom = (smooth = false) => {
    const el = scroller.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
  }

  // Keep position stable when older pages are prepended; follow new messages when near the bottom.
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el || messages.length === 0) return
    const first = messages[0].id
    const last = messages[messages.length - 1]
    const p = prev.current
    if (p.count === 0) {
      el.scrollTop = el.scrollHeight
      stick.current = true
    } else if (first !== p.first && last.id === p.last) {
      el.scrollTop += el.scrollHeight - p.height
    } else if (last.id !== p.last && (stick.current || last.sender_id === me)) {
      scrollToBottom(true)
    }
    prev.current = { first, last: last.id, height: el.scrollHeight, count: messages.length }
  }, [messages, me])

  // Images and late-loading content change height; stay pinned to the bottom if we were there.
  useEffect(() => {
    const inner = content.current
    if (!inner || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      if (stick.current) scrollToBottom()
      if (scroller.current) prev.current.height = scroller.current.scrollHeight
    })
    ro.observe(inner)
    return () => ro.disconnect()
  }, [loading, messages.length === 0])

  function onScroll() {
    const el = scroller.current
    if (!el) return
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    stick.current = distance < NEAR_BOTTOM_PX
    setAway(distance > 500)
    if (el.scrollTop < 120 && hasMore && !loadingOlder) onLoadOlder()
  }

  const others = useMemo(() => members.filter((m) => m.user_id !== me).map((m) => m.user_id), [members, me])

  const items = useMemo(() => {
    const out: Array<{ m: Message; day: string | null; startsRun: boolean; endsRun: boolean }> = []
    let lastDay = ''
    messages.forEach((m, i) => {
      const day = new Date(m.created_at).toDateString()
      const prevM = messages[i - 1]
      const nextM = messages[i + 1]
      const newDay = day !== lastDay
      lastDay = day
      const startsRun = newDay || !prevM || prevM.sender_id !== m.sender_id
      const nextDay = nextM ? new Date(nextM.created_at).toDateString() : ''
      const endsRun = !nextM || nextM.sender_id !== m.sender_id || nextDay !== day
      out.push({ m, day: newDay ? formatDayHeading(m.created_at) : null, startsRun, endsRun })
    })
    return out
  }, [messages])

  const receiptFor = (m: Message): ReceiptState | null => {
    if (m.sender_id !== me) return null
    if (m.status) return m.status
    if (m.deleted_at) return null
    const readers = m.reads.filter((u) => u !== me)
    const allRead = others.length > 0 && others.every((o) => readers.includes(o))
    if (allRead) return 'read'
    if (readers.length > 0 || others.some((o) => onlineIds.has(o))) return 'delivered'
    return 'sent'
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={scroller} onScroll={onScroll} className="flex h-full flex-col overflow-y-auto overscroll-contain" role="log" aria-live="polite" aria-label="Messages">
        {loading ? (
          <MessagesSkeleton />
        ) : error ? (
          <ErrorNotice message={error} />
        ) : messages.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState icon={<IconChat width={26} height={26} />} title="No messages yet">
              Say hello to start the conversation.
            </EmptyState>
          </div>
        ) : (
          <div ref={content} className="mt-auto pb-3 pt-2">
            {hasMore ? (
              <div className="flex justify-center py-3 text-muted">
                {loadingOlder ? (
                  <Spinner size={18} />
                ) : (
                  <button onClick={onLoadOlder} className="text-xs font-medium text-accent hover:underline">
                    Load older messages
                  </button>
                )}
              </div>
            ) : (
              <p className="py-3 text-center text-xs text-muted">Beginning of the conversation</p>
            )}
            {items.map(({ m, day, startsRun, endsRun }) => (
              <Fragment key={m.id}>
                {day && (
                  <div className="sticky top-1 z-10 my-3 flex justify-center">
                    <span className="rounded-full border border-line bg-surface/90 px-3 py-1 text-xs text-muted shadow-sm backdrop-blur">{day}</span>
                  </div>
                )}
                <MessageBubble
                  message={m}
                  me={me}
                  isGroup={isGroup}
                  startsRun={startsRun}
                  endsRun={endsRun}
                  profiles={profiles}
                  receipt={receiptFor(m)}
                  highlighted={highlightId === m.id}
                  onMenu={props.onMenu}
                  onReact={props.onReact}
                  onJump={props.onJump}
                  onRetry={props.onRetry}
                  onDiscard={props.onDiscard}
                  onOpenImage={props.onOpenImage}
                />
              </Fragment>
            ))}
          </div>
        )}
      </div>
      {away && (
        <button
          onClick={() => scrollToBottom(true)}
          aria-label="Jump to latest message"
          className="absolute bottom-3 right-4 flex h-10 w-10 animate-fade items-center justify-center rounded-full border border-line bg-surface text-muted shadow-lg hover:text-fg"
        >
          <IconChevronDown />
        </button>
      )}
    </div>
  )
}
