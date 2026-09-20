let audioCtx: AudioContext | null = null

/** A short two-tone chime generated with WebAudio (no audio asset needed). */
export function playMessageSound() {
  try {
    audioCtx ??= new AudioContext()
    const ctx = audioCtx
    if (ctx.state === 'suspended') void ctx.resume()
    const now = ctx.currentTime
    ;[660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, now + i * 0.09)
      gain.gain.exponentialRampToValueAtTime(0.12, now + i * 0.09 + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.09 + 0.18)
      osc.connect(gain).connect(ctx.destination)
      osc.start(now + i * 0.09)
      osc.stop(now + i * 0.09 + 0.2)
    })
  } catch {
    /* audio blocked until user interaction — ignore */
  }
}

export const notificationsSupported = () => typeof Notification !== 'undefined'

export function notificationPermission(): NotificationPermission | 'unsupported' {
  return notificationsSupported() ? Notification.permission : 'unsupported'
}

export async function requestNotificationPermission() {
  if (!notificationsSupported()) return 'unsupported' as const
  return Notification.requestPermission()
}

export function showBrowserNotification(title: string, body: string, tag: string, onClick: () => void) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return
  try {
    const n = new Notification(title, { body, tag, icon: '/favicon.svg' })
    n.onclick = () => {
      window.focus()
      onClick()
      n.close()
    }
  } catch {
    /* some mobile browsers only allow notifications via service worker */
  }
}

let ringTimer: ReturnType<typeof setInterval> | null = null

function ringOnce() {
  try {
    audioCtx ??= new AudioContext()
    const ctx = audioCtx
    if (ctx.state === 'suspended') void ctx.resume()
    const now = ctx.currentTime
    ;[0, 0.32].forEach((offset) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.value = 520
      gain.gain.setValueAtTime(0.0001, now + offset)
      gain.gain.exponentialRampToValueAtTime(0.18, now + offset + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.26)
      osc.connect(gain).connect(ctx.destination)
      osc.start(now + offset)
      osc.stop(now + offset + 0.3)
    })
  } catch {
    /* audio blocked until user interaction */
  }
}

/** Repeating incoming-call ring, generated with WebAudio. */
export function startRingtone() {
  if (ringTimer) return
  ringOnce()
  ringTimer = setInterval(ringOnce, 2200)
}

export function stopRingtone() {
  if (ringTimer) clearInterval(ringTimer)
  ringTimer = null
}
