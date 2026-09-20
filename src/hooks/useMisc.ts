import { useEffect, useState } from 'react'
import { getLastSeens } from '@/services/profiles'
import { getSignedUrl } from '@/services/uploads'

export function useOnlineStatus() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

/** Last-seen for one user, fetched only while they are offline. Null means hidden/unknown. */
export function useLastSeen(userId: string | null, isOnline: boolean) {
  const [lastSeen, setLastSeen] = useState<string | null>(null)
  useEffect(() => {
    setLastSeen(null)
    if (!userId || isOnline) return
    let cancelled = false
    getLastSeens([userId])
      .then((r) => !cancelled && setLastSeen(r[userId] ?? null))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [userId, isOnline])
  return lastSeen
}

export function useSignedUrl(path: string | null, download?: string | boolean) {
  const [state, setState] = useState<{ url: string | null; error: boolean }>({ url: null, error: false })
  useEffect(() => {
    if (!path) {
      setState({ url: null, error: false })
      return
    }
    let cancelled = false
    getSignedUrl(path, download)
      .then((url) => !cancelled && setState({ url, error: false }))
      .catch(() => !cancelled && setState({ url: null, error: true }))
    return () => {
      cancelled = true
    }
  }, [path, download])
  return state
}

/** Tracks whether the tab is visible and focused, so read receipts only fire when someone can actually see the chat. */
export function usePageActive() {
  const [active, setActive] = useState(document.visibilityState === 'visible' && document.hasFocus())
  useEffect(() => {
    const update = () => setActive(document.visibilityState === 'visible' && document.hasFocus())
    document.addEventListener('visibilitychange', update)
    window.addEventListener('focus', update)
    window.addEventListener('blur', update)
    return () => {
      document.removeEventListener('visibilitychange', update)
      window.removeEventListener('focus', update)
      window.removeEventListener('blur', update)
    }
  }, [])
  return active
}
