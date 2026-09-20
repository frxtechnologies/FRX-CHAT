import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Avatar } from '@/components/ui/Avatar'
import { IconMic, IconMicOff, IconPhone, IconPhoneOff, IconVideo, IconVideoOff } from '@/components/ui/Icons'
import { useCall } from '@/context/CallContext'
import { formatDuration } from '@/lib/calls'
import { cn } from '@/lib/utils'

function RoundButton({
  label,
  onClick,
  tone = 'neutral',
  active,
  children,
}: {
  label: string
  onClick: () => void
  tone?: 'neutral' | 'danger' | 'ok'
  active?: boolean
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cn(
        'flex h-14 w-14 items-center justify-center rounded-full text-white transition-transform active:scale-95',
        tone === 'danger' && 'bg-danger hover:brightness-110',
        tone === 'ok' && 'bg-ok hover:brightness-110',
        tone === 'neutral' && (active ? 'bg-white text-black' : 'bg-white/15 hover:bg-white/25'),
      )}
    >
      {children}
    </button>
  )
}

export function CallOverlay() {
  const { call, accept, decline, hangup, toggleMute, toggleCamera } = useCall()
  const remoteEl = useRef<HTMLVideoElement>(null)
  const localEl = useRef<HTMLVideoElement>(null)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (!call?.startedAt) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [call?.startedAt])

  useEffect(() => {
    if (remoteEl.current && remoteEl.current.srcObject !== (call?.remote ?? null)) {
      remoteEl.current.srcObject = call?.remote ?? null
      void remoteEl.current.play().catch(() => {})
    }
  }, [call?.remote])
  useEffect(() => {
    if (localEl.current && localEl.current.srcObject !== (call?.local ?? null)) localEl.current.srcObject = call?.local ?? null
  }, [call?.local, call?.phase])

  if (!call) return null

  const incoming = call.direction === 'in' && call.phase === 'ringing' && !call.ended
  const status = call.notice
    ? call.notice
    : call.phase === 'active' && call.startedAt
      ? formatDuration((now - call.startedAt) / 1000)
      : call.phase === 'ringing'
        ? call.direction === 'out'
          ? 'Calling…'
          : `Incoming ${call.video ? 'video' : 'voice'} call`
        : 'Connecting…'

  if (incoming) {
    return createPortal(
      <div className="fixed inset-0 z-[80] flex animate-fade items-center justify-center bg-black/75 p-4" role="alertdialog" aria-label="Incoming call">
        <div className="w-full max-w-xs animate-sheet rounded-2xl border border-line bg-surface p-6 text-center shadow-2xl">
          <div className="flex justify-center">
            <Avatar name={call.peer.name} src={call.peer.avatar} size={96} />
          </div>
          <h2 className="mt-4 text-lg font-semibold [overflow-wrap:anywhere]">{call.peer.name}</h2>
          <p className="mt-1 text-sm text-muted">{status}</p>
          <div className="mt-6 flex justify-center gap-8">
            <div className="flex flex-col items-center gap-1.5 text-xs text-muted">
              <RoundButton label="Decline call" tone="danger" onClick={() => void decline()}>
                <IconPhoneOff />
              </RoundButton>
              Decline
            </div>
            <div className="flex flex-col items-center gap-1.5 text-xs text-muted">
              <RoundButton label="Answer call" tone="ok" onClick={() => void accept()}>
                {call.video ? <IconVideo /> : <IconPhone />}
              </RoundButton>
              Answer
            </div>
          </div>
        </div>
      </div>,
      document.body,
    )
  }

  const showRemoteVideo = call.video && call.remote && call.phase === 'active'
  const showLocalVideo = call.video && call.local && !call.cameraOff

  return createPortal(
    <div className="fixed inset-0 z-[80] flex animate-fade flex-col bg-neutral-950 text-white" role="dialog" aria-label={`Call with ${call.peer.name}`}>
      {/* Remote media. Kept mounted (even for voice) so the audio plays. */}
      <video
        ref={remoteEl}
        autoPlay
        playsInline
        className={cn(showRemoteVideo ? 'absolute inset-0 h-full w-full object-cover' : 'pointer-events-none absolute h-px w-px opacity-0')}
      />

      {!showRemoteVideo && (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <Avatar name={call.peer.name} src={call.peer.avatar} size={132} />
          <h2 className="mt-5 text-2xl font-semibold [overflow-wrap:anywhere]">{call.peer.name}</h2>
          <p className="mt-1.5 text-sm text-white/70" aria-live="polite">
            {status}
          </p>
        </div>
      )}

      {showRemoteVideo && (
        <div className="relative z-10 bg-gradient-to-b from-black/60 to-transparent px-5 pb-8 pt-5 text-center" style={{ paddingTop: 'max(1.25rem, env(safe-area-inset-top))' }}>
          <p className="text-base font-semibold">{call.peer.name}</p>
          <p className="text-xs text-white/80" aria-live="polite">
            {status}
          </p>
        </div>
      )}
      {showRemoteVideo && <div className="flex-1" />}

      {showLocalVideo && (
        <video
          ref={localEl}
          autoPlay
          muted
          playsInline
          className={cn(
            'absolute z-20 -scale-x-100 rounded-xl border border-white/20 bg-black object-cover shadow-xl',
            showRemoteVideo ? 'bottom-32 right-4 h-36 w-24 md:h-44 md:w-32' : 'right-4 top-4 h-36 w-24 md:h-44 md:w-32',
          )}
        />
      )}

      {!call.ended && (
        <div
          className="relative z-10 flex items-center justify-center gap-5 bg-gradient-to-t from-black/70 to-transparent px-4 pt-6"
          style={{ paddingBottom: 'max(1.75rem, env(safe-area-inset-bottom))' }}
        >
          <RoundButton label={call.muted ? 'Unmute microphone' : 'Mute microphone'} active={call.muted} onClick={toggleMute}>
            {call.muted ? <IconMicOff /> : <IconMic />}
          </RoundButton>
          {call.video && (
            <RoundButton label={call.cameraOff ? 'Turn camera on' : 'Turn camera off'} active={call.cameraOff} onClick={toggleCamera}>
              {call.cameraOff ? <IconVideoOff /> : <IconVideo />}
            </RoundButton>
          )}
          <RoundButton label="End call" tone="danger" onClick={() => void hangup()}>
            <IconPhoneOff />
          </RoundButton>
        </div>
      )}
    </div>,
    document.body,
  )
}
