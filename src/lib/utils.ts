export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const dateFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
const weekdayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'long' })

export const formatTime = (iso: string) => timeFmt.format(new Date(iso))

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

export function dayDiff(iso: string) {
  return Math.round((startOfDay(new Date()) - startOfDay(new Date(iso))) / 86_400_000)
}

/** Chat-list style: time today, "Yesterday", weekday this week, otherwise a date. */
export function formatListTime(iso: string) {
  const diff = dayDiff(iso)
  if (diff <= 0) return formatTime(iso)
  if (diff === 1) return 'Yesterday'
  if (diff < 7) return weekdayFmt.format(new Date(iso))
  return dateFmt.format(new Date(iso))
}

export function formatDayHeading(iso: string) {
  const diff = dayDiff(iso)
  if (diff <= 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff < 7) return weekdayFmt.format(new Date(iso))
  return dateFmt.format(new Date(iso))
}

export function formatDate(iso: string) {
  return dateFmt.format(new Date(iso))
}

export function formatLastSeen(iso: string | null | undefined) {
  if (!iso) return 'Last seen recently'
  const diff = dayDiff(iso)
  const mins = (Date.now() - new Date(iso).getTime()) / 60_000
  if (mins < 2) return 'Last seen just now'
  if (diff <= 0) return `Last seen today at ${formatTime(iso)}`
  if (diff === 1) return `Last seen yesterday at ${formatTime(iso)}`
  return `Last seen ${dateFmt.format(new Date(iso))}`
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined
  const d = (...a: A) => {
    clearTimeout(t)
    t = setTimeout(() => fn(...a), ms)
  }
  d.cancel = () => clearTimeout(t)
  return d
}

export function newId() {
  return crypto.randomUUID()
}

/**
 * Turn any thrown value into a message that is safe to show. Raw database
 * errors are never surfaced; callers pass a friendly fallback.
 */
export function friendlyError(err: unknown, fallback: string): string {
  const e = err as { message?: string; code?: string; status?: number } | null
  const msg = (e?.message ?? '').toLowerCase()
  if (!navigator.onLine || msg.includes('failed to fetch') || msg.includes('networkerror')) {
    return "You're offline. Check your connection and try again."
  }
  if (e?.code === '42501' || msg.includes('row-level security') || msg.includes('not authorized') || e?.status === 403) {
    return "You don't have permission to do that."
  }
  if (msg.includes('invalid login credentials')) return 'Incorrect email or password.'
  if (msg.includes('email not confirmed')) return 'Please confirm your email first, then sign in.'
  if (msg.includes('user already registered')) return 'An account with this email already exists.'
  if (msg.includes('jwt') || msg.includes('not authenticated')) return 'Your session expired. Please sign in again.'
  if (msg.includes('password should be') || msg.includes('weak password')) return 'Choose a stronger password (at least 8 characters).'
  if (msg.includes('rate limit') || e?.status === 429) return 'Too many attempts. Please wait a moment and try again.'
  if (e?.code === '23505') return 'That value is already taken.'
  return fallback
}

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)"'])/g
export function splitLinks(text: string): Array<{ text: string; url?: string }> {
  const out: Array<{ text: string; url?: string }> = []
  let last = 0
  for (const m of text.matchAll(URL_RE)) {
    const i = m.index ?? 0
    if (i > last) out.push({ text: text.slice(last, i) })
    out.push({ text: m[0], url: m[0] })
    last = i + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last) })
  return out
}
