import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

const SEND_EVERY_MS = 2500
const IDLE_STOP_MS = 3000
const EXPIRE_MS = 4500

/**
 * Typing indicators over a private Realtime broadcast channel (`conv:<id>`).
 * Nothing is written to the database; membership is enforced by realtime RLS.
 */
export function useTyping(conversationId: string, userId: string, name: string) {
  const [typing, setTyping] = useState<Record<string, string>>({})
  const channelRef = useRef<RealtimeChannel | null>(null)
  const ready = useRef(false)
  const lastSent = useRef(0)
  const idleTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const expiry = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  useEffect(() => {
    let cancelled = false
    const timers = expiry.current
    setTyping({})
    ready.current = false
    const channel = supabase.channel(`conv:${conversationId}`, {
      config: { private: true, broadcast: { self: false } },
    })
    channelRef.current = channel

    const clear = (id: string) => {
      clearTimeout(timers.get(id))
      timers.delete(id)
      setTyping((t) => {
        if (!(id in t)) return t
        const { [id]: _drop, ...rest } = t
        return rest
      })
    }

    channel.on('broadcast', { event: 'typing' }, ({ payload }) => {
      const p = payload as { user_id: string; name: string; typing: boolean }
      if (!p || p.user_id === userId) return
      if (!p.typing) return clear(p.user_id)
      setTyping((t) => (t[p.user_id] === p.name ? t : { ...t, [p.user_id]: p.name }))
      clearTimeout(timers.get(p.user_id))
      timers.set(p.user_id, setTimeout(() => clear(p.user_id), EXPIRE_MS))
    })

    void supabase.realtime.setAuth().then(() => {
      if (cancelled) return
      channel.subscribe((status) => {
        ready.current = status === 'SUBSCRIBED'
      })
    })

    return () => {
      cancelled = true
      ready.current = false
      clearTimeout(idleTimer.current)
      timers.forEach(clearTimeout)
      timers.clear()
      channelRef.current = null
      void supabase.removeChannel(channel)
    }
  }, [conversationId, userId])

  const emit = useCallback(
    (isTyping: boolean) => {
      if (!ready.current || !channelRef.current) return
      void channelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: { user_id: userId, name, typing: isTyping },
      })
    },
    [userId, name],
  )

  const stopTyping = useCallback(() => {
    clearTimeout(idleTimer.current)
    if (lastSent.current) emit(false)
    lastSent.current = 0
  }, [emit])

  /** Call on every keystroke; throttled internally. */
  const notifyTyping = useCallback(() => {
    const now = Date.now()
    if (now - lastSent.current > SEND_EVERY_MS) {
      lastSent.current = now
      emit(true)
    }
    clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(stopTyping, IDLE_STOP_MS)
  }, [emit, stopTyping])

  return { typingNames: Object.values(typing), notifyTyping, stopTyping }
}

