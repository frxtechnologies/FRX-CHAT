import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { touchLastSeen } from '@/services/profiles'
import { useAuth } from './AuthContext'

interface PresenceState {
  onlineIds: ReadonlySet<string>
  isOnline: (id: string | null | undefined) => boolean
}

const Ctx = createContext<PresenceState>({ onlineIds: new Set(), isOnline: () => false })

const HEARTBEAT_MS = 4 * 60_000

/**
 * One shared presence channel for the whole app. Online state lives in Realtime
 * presence (memory only); the database is written only on a slow heartbeat and
 * when the tab is hidden/closed, to keep `last_seen` roughly right.
 */
export function PresenceProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth()
  const [onlineIds, setOnline] = useState<ReadonlySet<string>>(new Set())
  const userId = user?.id
  const share = profile?.show_online ?? true

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    const channel = supabase.channel('lobby', { config: { private: true, presence: { key: userId } } })
    channel.on('presence', { event: 'sync' }, () => {
      if (!cancelled) setOnline(new Set(Object.keys(channel.presenceState())))
    })
    void supabase.realtime.setAuth().then(() => {
      if (cancelled) return
      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && share) await channel.track({ at: Date.now() })
      })
    })
    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
      setOnline(new Set())
    }
  }, [userId, share])

  useEffect(() => {
    if (!userId) return
    void touchLastSeen()
    const beat = setInterval(() => {
      if (document.visibilityState === 'visible') void touchLastSeen()
    }, HEARTBEAT_MS)
    const onHide = () => {
      if (document.visibilityState === 'hidden') void touchLastSeen()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onHide)
    return () => {
      clearInterval(beat)
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onHide)
    }
  }, [userId])

  const value = useMemo<PresenceState>(
    () => ({ onlineIds, isOnline: (id) => Boolean(id && onlineIds.has(id)) }),
    [onlineIds],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const usePresence = () => useContext(Ctx)
