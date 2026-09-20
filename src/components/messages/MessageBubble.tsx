import { memo, type MouseEvent, type ReactNode } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { IconAlert, IconChevronDown, IconClock, IconPhone, IconVideo, Ticks } from '@/components/ui/Icons'
import { callLabel, parseCall } from '@/lib/calls'
import { cn, formatTime, splitLinks } from '@/lib/utils'
import type { Message, Profile } from '@/types'
import { AttachmentList } from './AttachmentView'

export type ReceiptState = 'sending' | 'failed' | 'sent' | 'delivered' | 'read'

interface Props {
  message: Message
  me: string
  isGroup: boolean
  /** first message of a run from the same sender (shows name/avatar in groups) */
  startsRun: boolean
  endsRun: boolean
  profiles: Record<string, Profile>
  receipt: ReceiptState | null
  highlighted: boolean
  onMenu: (m: Message) => void
  onReact: (id: string, emoji: string) => void
  onJump: (id: string) => void
  onRetry: (id: string) => void
  onDiscard: (id: string) => void
  onOpenImage: (url: string, name: string, path: string) => void
}

function Linkified({ text }: { text: string }) {
  const parts = splitLinks(text)
  return (
    <>
      {parts.map((p, i) =>
        p.url ? (
          <a key={i} href={p.url} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-2 hover:opacity-80">
            {p.text}
          </a>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  )
}

function ReplyQuote({ m, mine, profiles, me, onJump }: { m: NonNullable<Message['reply']>; mine: boolean; profiles: Record<string, Profile>; me: string; onJump: (id: string) => void }) {
  const name = m.sender_id === me ? 'You' : (profiles[m.sender_id]?.full_name ?? 'Former member')
  const text = m.deleted_at ? 'This message was deleted' : m.content || (m.message_type === 'image' ? 'Photo' : 'File')
  return (
    <button
      type="button"
      onClick={() => onJump(m.id)}
      className={cn(
        'mb-1.5 block w-full rounded-lg border-l-[3px] px-2.5 py-1.5 text-left',
        mine ? 'border-white/70 bg-black/20' : 'border-accent bg-black/10 dark:bg-white/5',
      )}
    >
      <span className={cn('block truncate text-xs font-semibold', mine ? 'text-white' : 'text-accent')}>{name}</span>
      <span className={cn('block truncate text-xs opacity-80', m.deleted_at && 'italic')}>{text}</span>
    </button>
  )
}

export const MessageBubble = memo(function MessageBubble(props: Props) {
  const { message: m, me, isGroup, startsRun, endsRun, profiles, receipt, highlighted } = props
  const mine = m.sender_id === me
  const deleted = Boolean(m.deleted_at)
  const sender = profiles[m.sender_id]

  // Touch screens: tap a message to open its actions (links and buttons keep working).
  // Desktop: right-click, or the chevron that appears on hover.
  const onTap = (e: MouseEvent<HTMLDivElement>) => {
    if (m.status || m.deleted_at || !window.matchMedia('(pointer: coarse)').matches) return
    if ((e.target as HTMLElement).closest('a, button')) return
    props.onMenu(m)
  }

  if (m.message_type === 'call') {
    const { video, outcome } = parseCall(m.content)
    const missed = outcome !== 'ended'
    return (
      <div id={`msg-${m.id}`} className="my-2 flex justify-center px-3">
        <span
          className={cn(
            'inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5 text-xs',
            missed && !mine ? 'text-danger' : 'text-muted',
          )}
        >
          {video ? <IconVideo width={15} height={15} /> : <IconPhone width={15} height={15} />}
          {callLabel(m.content, mine)}
          <time dateTime={m.created_at} className="opacity-70">
            {formatTime(m.created_at)}
          </time>
        </span>
      </div>
    )
  }

  const grouped = new Map<string, { count: number; mine: boolean }>()
  for (const r of m.reactions) {
    const g = grouped.get(r.reaction) ?? { count: 0, mine: false }
    g.count++
    if (r.user_id === me) g.mine = true
    grouped.set(r.reaction, g)
  }

  let body: ReactNode
  if (deleted) {
    body = <p className="text-sm italic opacity-70">This message was deleted</p>
  } else {
    body = (
      <>
        {m.reply && <ReplyQuote m={m.reply} mine={mine} profiles={profiles} me={me} onJump={props.onJump} />}
        {m.attachments.length > 0 && (
          <div className={cn(m.content && 'mb-1.5')}>
            <AttachmentList attachments={m.attachments} onOpenImage={props.onOpenImage} />
          </div>
        )}
        {m.content && (
          <p className="whitespace-pre-wrap text-[15px] leading-snug [overflow-wrap:anywhere]">
            <Linkified text={m.content} />
          </p>
        )}
      </>
    )
  }

  return (
    <div
      id={`msg-${m.id}`}
      className={cn('group flex items-end gap-2 px-3 md:px-6', mine ? 'justify-end' : 'justify-start', startsRun ? 'mt-3' : 'mt-0.5')}
    >
      {isGroup && !mine && (
        <div className="w-8 shrink-0 self-end">
          {endsRun && <Avatar name={sender?.full_name ?? '?'} src={sender?.avatar_url} size={32} />}
        </div>
      )}
      <div className={cn('flex min-w-0 max-w-[85%] flex-col md:max-w-[68%]', mine ? 'items-end' : 'items-start')}>
        {isGroup && !mine && startsRun && (
          <span className="mb-0.5 px-1 text-xs font-medium text-accent">{sender?.full_name ?? 'Former member'}</span>
        )}
        <div className="relative max-w-full">
          <div
            onContextMenu={(e) => {
              if (m.status || m.deleted_at) return
              e.preventDefault()
              props.onMenu(m)
            }}
            onClick={onTap}
            className={cn(
              'msg-bubble rounded-2xl px-3 py-2 shadow-sm transition-shadow [-webkit-touch-callout:none]',
              mine ? 'bg-bubble-out text-white' : 'border border-line/60 bg-bubble text-fg',
              mine ? (endsRun ? 'rounded-br-md' : '') : endsRun ? 'rounded-bl-md' : '',
              highlighted && 'ring-2 ring-accent ring-offset-2 ring-offset-bg',
              m.status === 'failed' && 'opacity-80',
            )}
          >
            {body}
            <div className={cn('mt-1 flex items-center justify-end gap-1 text-[11px]', mine ? 'text-white/70' : 'text-muted')}>
              {m.edited_at && !deleted && <span>Edited</span>}
              <time dateTime={m.created_at}>{formatTime(m.created_at)}</time>
              {mine && receipt && <ReceiptIcon state={receipt} />}
            </div>
          </div>
          {!deleted && !m.status && (
            <button
              aria-label="Message actions"
              onClick={() => props.onMenu(m)}
              className={cn(
                'absolute top-1 hidden h-6 w-6 items-center justify-center rounded-full bg-surface/90 text-muted opacity-0 shadow transition-opacity hover:text-fg focus-visible:opacity-100 group-hover:opacity-100 md:flex',
                mine ? '-left-8' : '-right-8',
              )}
            >
              <IconChevronDown width={16} height={16} />
            </button>
          )}
        </div>

        {grouped.size > 0 && !deleted && (
          <div className={cn('-mt-1.5 flex flex-wrap gap-1 px-1', mine ? 'justify-end' : 'justify-start')}>
            {[...grouped].map(([emoji, g]) => (
              <button
                key={emoji}
                onClick={() => props.onReact(m.id, emoji)}
                aria-label={`${emoji} ${g.count}${g.mine ? ', remove your reaction' : ''}`}
                aria-pressed={g.mine}
                className={cn(
                  'flex items-center gap-1 rounded-full border px-2 py-1 text-xs shadow-sm transition-colors',
                  g.mine ? 'border-accent bg-accent/20' : 'border-line bg-surface hover:bg-raised',
                )}
              >
                <span>{emoji}</span>
                {g.count > 1 && <span className="font-medium">{g.count}</span>}
              </button>
            ))}
          </div>
        )}

        {m.status === 'failed' && (
          <div className="mt-1 flex items-center gap-2 px-1 text-xs text-danger" role="alert">
            <IconAlert width={14} height={14} /> Not sent.
            <button onClick={() => props.onRetry(m.id)} className="font-medium underline">
              Retry
            </button>
            <button onClick={() => props.onDiscard(m.id)} className="text-muted underline">
              Discard
            </button>
          </div>
        )}
      </div>
    </div>
  )
})

function ReceiptIcon({ state }: { state: ReceiptState }) {
  if (state === 'sending') return <IconClock width={13} height={13} aria-label="Sending" />
  if (state === 'failed') return <IconAlert width={13} height={13} aria-label="Failed" />
  return <Ticks double={state !== 'sent'} read={state === 'read'} />
}

