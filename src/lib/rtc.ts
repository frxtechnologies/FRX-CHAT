/**
 * STUN alone connects most pairs. A TURN relay makes calls reliable on strict networks:
 * set VITE_TURN_URL (comma-separated allowed), VITE_TURN_USERNAME and VITE_TURN_CREDENTIAL.
 * Note: anything in a VITE_ variable is visible in the browser, so use a TURN account with
 * short-lived/limited credentials.
 */
export function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }]
  const url = import.meta.env.VITE_TURN_URL as string | undefined
  if (url) {
    servers.push({
      urls: url.split(',').map((s) => s.trim()).filter(Boolean),
      username: import.meta.env.VITE_TURN_USERNAME as string | undefined,
      credential: import.meta.env.VITE_TURN_CREDENTIAL as string | undefined,
    })
  }
  return servers
}

export async function getMedia(video: boolean): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) throw new DOMException('insecure', 'SecurityError')
  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: video ? { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } : false,
  })
}

export function mediaError(e: unknown, video: boolean): string {
  const name = (e as { name?: string } | null)?.name
  const device = video ? 'camera and microphone' : 'microphone'
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return `Access to your ${device} is blocked. Allow it in your browser's site settings and try again.`
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return `No ${device} was found on this device.`
  if (name === 'NotReadableError') return `Your ${device} is being used by another app.`
  if (name === 'SecurityError') return 'Calls need a secure (https) connection.'
  return `Couldn't access your ${device}.`
}
