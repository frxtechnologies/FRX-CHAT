export function formatDuration(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = String(m).padStart(h ? 2 : 1, '0')
  return `${h ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`
}

/** Call log messages are stored as "<video|voice>|<outcome>|<seconds>", sent by the caller. */
export function parseCall(content: string) {
  const [kind, outcome, secs] = content.split('|')
  return { video: kind === 'video', outcome: outcome ?? 'ended', seconds: Number(secs) || 0 }
}

/** Wording from the viewer's side: `mine` = I was the caller. */
export function callLabel(content: string, mine: boolean) {
  const { video, outcome, seconds } = parseCall(content)
  const kind = video ? 'video' : 'voice'
  const Kind = video ? 'Video' : 'Voice'
  switch (outcome) {
    case 'ended':
      return `${Kind} call · ${formatDuration(seconds)}`
    case 'declined':
      return mine ? 'Call declined' : `Declined ${kind} call`
    case 'cancelled':
      return mine ? 'Cancelled call' : `Missed ${kind} call`
    default:
      return mine ? 'No answer' : `Missed ${kind} call`
  }
}
