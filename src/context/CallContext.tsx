import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { getMedia, iceServers, mediaError } from '@/lib/rtc'
import { showBrowserNotification, startRingtone, stopRingtone } from '@/lib/notify'
import { friendlyError } from '@/lib/utils'
import { setCallStatus, startCallRpc } from '@/services/calls'
import { getProfiles } from '@/services/profiles'
import { useAuth } from './AuthContext'
import { useSettings } from './SettingsContext'
import { useToast } from './ToastContext'

export interface CallPeer {
  id: string
  name: string
  avatar: string | null
}

export interface CallView {
  id: string
  peer: CallPeer
  conversationId: string
  video: boolean
  direction: 'out' | 'in'
  phase: 'ringing' | 'connecting' | 'active'
  muted: boolean
  cameraOff: boolean
  local: MediaStream | null
  remote: MediaStream | null
  startedAt: number | null
  notice: string | null
  ended: boolean
}

interface CallState {
  call: CallView | null
  startCall: (conversationId: string, peer: CallPeer, video: boolean) => Promise<void>
  accept: () => Promise<void>
  decline: () => Promise<void>
  hangup: () => Promise<void>
  toggleMute: () => void
  toggleCamera: () => void
}

interface CallRow {
  id: string
  conversation_id: string
  caller_id: string
  callee_id: string
  video: boolean
  status: string
  created_at: string
}

const Ctx = createContext<CallState | null>(null)

/** Wait until the browser has gathered its network candidates, so offer/answer go out as ONE message. */
function gatheringDone(peer: RTCPeerConnection, ms = 4000) {
  return new Promise<void>((resolve) => {
    if (peer.iceGatheringState === 'complete') return resolve()
    const finish = () => {
      clearTimeout(timer)
      peer.removeEventListener('icegatheringstatechange', onChange)
      resolve()
    }
    const onChange = () => peer.iceGatheringState === 'complete' && finish()
    const timer = setTimeout(finish, ms)
    peer.addEventListener('icegatheringstatechange', onChange)
  })
}

const RING_MS = 45_000
const STALE_INVITE_MS = 60_000
const DISCONNECT_GRACE_MS = 8_000

export function CallProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const settings = useSettings()
  const toast = useToast()
  const userId = user?.id

  const [call, setCall] = useState<CallView | null>(null)
  const callRef = useRef<CallView | null>(null)
  const pc = useRef<RTCPeerConnection | null>(null)
  const signal = useRef<RealtimeChannel | null>(null)
  const signalReady = useRef<Promise<void>>(Promise.resolve())
  const localStream = useRef<MediaStream | null>(null)
  const pendingIce = useRef<RTCIceCandidateInit[]>([])
  const timers = useRef<{ ring?: ReturnType<typeof setTimeout>; disc?: ReturnType<typeof setTimeout>; clear?: ReturnType<typeof setTimeout>; connect?: ReturnType<typeof setTimeout>; retry?: ReturnType<typeof setInterval> }>({})
  const inviting = useRef(new Set<string>())

  const commit = useCallback((next: CallView | null) => {
    callRef.current = next
    setCall(next)
  }, [])
  const patch = useCallback(
    (p: Partial<CallView>) => {
      if (callRef.current) commit({ ...callRef.current, ...p })
    },
    [commit],
  )

  /** Release everything. With a notice the overlay lingers briefly to show why the call ended. */
  const teardown = useCallback(
    (notice: string | null) => {
      stopRingtone()
      clearTimeout(timers.current.ring)
      clearTimeout(timers.current.disc)
      clearTimeout(timers.current.connect)
      clearInterval(timers.current.retry)
      pc.current?.close()
      pc.current = null
      localStream.current?.getTracks().forEach((t) => t.stop())
      localStream.current = null
      pendingIce.current = []
      if (signal.current) void supabase.removeChannel(signal.current)
      signal.current = null
      const cur = callRef.current
      if (!cur) return
      if (!notice) return commit(null)
      commit({ ...cur, ended: true, notice, local: null, remote: null })
      const id = cur.id
      clearTimeout(timers.current.clear)
      timers.current.clear = setTimeout(() => {
        if (callRef.current?.id === id) commit(null)
      }, 2200)
    },
    [commit],
  )

  const sendSignal = useCallback((event: 'offer' | 'answer' | 'ice', payload: unknown) => {
    void signal.current?.send({ type: 'broadcast', event, payload })
  }, [])

  const flushIce = useCallback(async () => {
    const peer = pc.current
    if (!peer?.remoteDescription) return
    const queued = pendingIce.current
    pendingIce.current = []
    for (const c of queued) await peer.addIceCandidate(c).catch(() => {})
  }, [])

  const openSignal = useCallback(
    async (id: string) => {
      await supabase.realtime.setAuth()
      const channel = supabase.channel(`call:${id}`, { config: { private: true, broadcast: { self: false } } })
      signal.current = channel

      channel.on('broadcast', { event: 'offer' }, async ({ payload }) => {
        const peer = pc.current
        if (!peer || callRef.current?.id !== id) return
        try {
          if (peer.remoteDescription) {
            // The caller retried because our answer may have been lost: send it again.
            if (peer.localDescription) sendSignal('answer', { sdp: peer.localDescription })
            return
          }
          await peer.setRemoteDescription(payload.sdp as RTCSessionDescriptionInit)
          await flushIce()
          const answer = await peer.createAnswer()
          await peer.setLocalDescription(answer)
          await gatheringDone(peer)
          sendSignal('answer', { sdp: peer.localDescription })
        } catch {
          void setCallStatus(id, 'ended').catch(() => {})
          teardown('Call failed')
        }
      })
      channel.on('broadcast', { event: 'answer' }, async ({ payload }) => {
        const peer = pc.current
        if (!peer || callRef.current?.id !== id || peer.remoteDescription) return
        try {
          clearInterval(timers.current.retry)
          await peer.setRemoteDescription(payload.sdp as RTCSessionDescriptionInit)
          await flushIce()
        } catch {
          void setCallStatus(id, 'ended').catch(() => {})
          teardown('Call failed')
        }
      })
      channel.on('broadcast', { event: 'ice' }, async ({ payload }) => {
        const peer = pc.current
        if (!peer || callRef.current?.id !== id) return
        const cand = payload.candidate as RTCIceCandidateInit
        if (peer.remoteDescription) await peer.addIceCandidate(cand).catch(() => {})
        else pendingIce.current.push(cand)
      })

      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('signalling timeout')), 10_000)
        channel.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            clearTimeout(t)
            resolve()
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            clearTimeout(t)
            reject(new Error('signalling failed'))
          }
        })
      })
    },
    [flushIce, sendSignal, teardown],
  )

  const createPeer = useCallback(
    (id: string) => {
      const peer = new RTCPeerConnection({ iceServers: iceServers() })
      localStream.current?.getTracks().forEach((t) => peer.addTrack(t, localStream.current!))
      peer.ontrack = (e) => {
        if (callRef.current?.id === id) patch({ remote: e.streams[0] ?? new MediaStream([e.track]) })
      }
      peer.onconnectionstatechange = () => {
        if (callRef.current?.id !== id || callRef.current.ended) return
        const s = peer.connectionState
        if (s === 'connected') {
          clearTimeout(timers.current.disc)
          clearTimeout(timers.current.connect)
          if (callRef.current.phase !== 'active') patch({ phase: 'active', startedAt: Date.now() })
        } else if (s === 'disconnected') {
          clearTimeout(timers.current.disc)
          timers.current.disc = setTimeout(() => {
            void setCallStatus(id, 'ended').catch(() => {})
            teardown('Connection lost')
          }, DISCONNECT_GRACE_MS)
        } else if (s === 'failed') {
          void setCallStatus(id, 'ended').catch(() => {})
          teardown('Connection failed. A network relay may be needed.')
        }
      }
      pc.current = peer
      return peer
    },
    [patch, teardown],
  )

  /** If the media path never comes up, fail with a clear message instead of hanging on 'Connecting…'. */
  const armConnectTimeout = useCallback(
    (id: string) => {
      clearTimeout(timers.current.connect)
      timers.current.connect = setTimeout(() => {
        const cur = callRef.current
        if (cur?.id !== id || cur.phase === 'active' || cur.ended) return
        void setCallStatus(id, 'ended').catch(() => {})
        teardown("Couldn't connect the call. Your networks may need a relay (TURN) to reach each other.")
      }, 25_000)
    },
    [teardown],
  )

  // ── my actions ──────────────────────────────────────────────

  const startCall = useCallback(
    async (conversationId: string, peer: CallPeer, video: boolean) => {
      if (callRef.current && !callRef.current.ended) return toast("You're already in a call.", 'info')
      if (!navigator.onLine) return toast("You're offline. Check your connection and try again.", 'error')
      clearTimeout(timers.current.clear)
      let stream: MediaStream
      try {
        stream = await getMedia(video)
      } catch (e) {
        return toast(mediaError(e, video), 'error')
      }
      let id: string
      try {
        id = await startCallRpc(conversationId, video)
      } catch (e) {
        stream.getTracks().forEach((t) => t.stop())
        return toast(friendlyError(e, "Couldn't start the call. Please try again."), 'error')
      }
      localStream.current = stream
      commit({
        id, peer, conversationId, video, direction: 'out', phase: 'ringing', muted: false, cameraOff: false,
        local: stream, remote: null, startedAt: null, notice: null, ended: false,
      })
      signalReady.current = openSignal(id)
      signalReady.current.catch(() => {
        if (callRef.current?.id === id) {
          void setCallStatus(id, 'cancelled').catch(() => {})
          teardown('Live connection failed. Please try again.')
        }
      })
      timers.current.ring = setTimeout(() => {
        void setCallStatus(id, 'missed').catch(() => {})
        teardown('No answer')
      }, RING_MS)
    },
    [commit, openSignal, teardown, toast],
  )

  const decline = useCallback(async () => {
    const cur = callRef.current
    if (!cur) return
    void setCallStatus(cur.id, 'declined').catch(() => {})
    teardown(null)
  }, [teardown])

  const accept = useCallback(async () => {
    const cur = callRef.current
    if (!cur || cur.direction !== 'in' || cur.phase !== 'ringing') return
    stopRingtone()
    clearTimeout(timers.current.ring)
    let stream: MediaStream
    try {
      stream = await getMedia(cur.video)
    } catch (e) {
      toast(mediaError(e, cur.video), 'error')
      void setCallStatus(cur.id, 'declined').catch(() => {})
      return teardown(null)
    }
    if (callRef.current?.id !== cur.id) return stream.getTracks().forEach((t) => t.stop())
    localStream.current = stream
    patch({ phase: 'connecting', local: stream })
    armConnectTimeout(cur.id)
    createPeer(cur.id)
    try {
      await signalReady.current
      await setCallStatus(cur.id, 'accepted')
    } catch (e) {
      toast(friendlyError(e, "Couldn't answer the call."), 'error')
      teardown(null)
    }
  }, [armConnectTimeout, createPeer, patch, teardown, toast])

  const hangup = useCallback(async () => {
    const cur = callRef.current
    if (!cur) return
    if (cur.ended) return commit(null)
    if (cur.phase === 'ringing') {
      void setCallStatus(cur.id, cur.direction === 'out' ? 'cancelled' : 'declined').catch(() => {})
    } else {
      void setCallStatus(cur.id, 'ended').catch(() => {})
    }
    teardown(null)
  }, [commit, teardown])

  const toggleMute = useCallback(() => {
    const cur = callRef.current
    if (!cur) return
    const next = !cur.muted
    localStream.current?.getAudioTracks().forEach((t) => (t.enabled = !next))
    patch({ muted: next })
  }, [patch])

  const toggleCamera = useCallback(() => {
    const cur = callRef.current
    if (!cur?.video) return
    const next = !cur.cameraOff
    localStream.current?.getVideoTracks().forEach((t) => (t.enabled = !next))
    patch({ cameraOff: next })
  }, [patch])

  // ── the other person's actions, delivered through the `calls` table ──

  const onInvite = useCallback(
    async (row: CallRow) => {
      if (Date.now() - new Date(row.created_at).getTime() > STALE_INVITE_MS) return
      if (callRef.current?.id === row.id || inviting.current.has(row.id)) return // already handled (realtime + fallback)
      if (callRef.current && !callRef.current.ended) {
        void setCallStatus(row.id, 'declined').catch(() => {}) // busy
        return
      }
      inviting.current.add(row.id)
      let peer: CallPeer = { id: row.caller_id, name: 'Someone', avatar: null }
      try {
        const [p] = await getProfiles([row.caller_id])
        if (p) peer = { id: p.id, name: p.full_name, avatar: p.avatar_url }
      } catch {
        /* keep the generic name */
      }
      if (callRef.current && !callRef.current.ended) return
      clearTimeout(timers.current.clear)
      commit({
        id: row.id, peer, conversationId: row.conversation_id, video: row.video, direction: 'in', phase: 'ringing',
        muted: false, cameraOff: false, local: null, remote: null, startedAt: null, notice: null, ended: false,
      })
      startRingtone()
      if (document.visibilityState === 'hidden' && settings.notifications) {
        showBrowserNotification(`${peer.name} is calling`, row.video ? 'Video call' : 'Voice call', `call:${row.id}`, () => {})
      }
      signalReady.current = openSignal(row.id)
      signalReady.current.catch(() => {})
      timers.current.ring = setTimeout(() => teardown(null), RING_MS + 5000)
    },
    [commit, openSignal, settings.notifications, teardown],
  )

  const onStatus = useCallback(
    async (row: CallRow) => {
      const cur = callRef.current
      if (!cur || cur.id !== row.id || cur.ended) return
      switch (row.status) {
        case 'accepted':
          if (cur.direction === 'in' && cur.phase === 'ringing') return teardown(null) // answered on another device
          if (cur.direction === 'out' && cur.phase === 'ringing') {
            clearTimeout(timers.current.ring)
            patch({ phase: 'connecting' })
            armConnectTimeout(row.id)
            try {
              await signalReady.current
              const peer = createPeer(row.id)
              const offer = await peer.createOffer()
              await peer.setLocalDescription(offer)
              await gatheringDone(peer)
              sendSignal('offer', { sdp: peer.localDescription })
              // Realtime broadcast is fire-and-forget: repeat the offer until the answer arrives.
              let tries = 0
              clearInterval(timers.current.retry)
              timers.current.retry = setInterval(() => {
                if (peer.remoteDescription || callRef.current?.id !== row.id || ++tries > 6) return clearInterval(timers.current.retry)
                sendSignal('offer', { sdp: peer.localDescription })
              }, 3000)
            } catch {
              void setCallStatus(row.id, 'ended').catch(() => {})
              teardown('Call failed')
            }
          }
          return
        case 'declined':
          if (cur.direction === 'out') teardown('Call declined')
          return
        case 'cancelled':
        case 'missed':
          if (cur.direction === 'in') teardown(null)
          return
        case 'ended':
          teardown('Call ended')
      }
    },
    [armConnectTimeout, createPeer, patch, sendSignal, teardown],
  )

  const handlers = useRef({ onInvite, onStatus })
  handlers.current = { onInvite, onStatus }

  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(`calls:${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'calls', filter: `callee_id=eq.${userId}` }, (p) =>
        void handlers.current.onInvite(p.new as CallRow),
      )
      // RLS limits these events to calls I'm part of.
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'calls' }, (p) => void handlers.current.onStatus(p.new as CallRow))
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId])

  // Realtime delivery is best-effort. During call setup only, double-check the database so a lost
  // event can't leave a call unrung or stuck: incoming ringing rows, and the status of my current call.
  useEffect(() => {
    if (!userId) return
    const cols = 'id, conversation_id, caller_id, callee_id, video, status, created_at'
    const t = setInterval(async () => {
      try {
        const cur = callRef.current
        if (cur && !cur.ended && cur.phase !== 'active') {
          const { data } = await supabase.from('calls').select(cols).eq('id', cur.id).maybeSingle()
          if (data) await handlers.current.onStatus(data as CallRow)
        } else if (!cur) {
          const since = new Date(Date.now() - 40_000).toISOString()
          const { data } = await supabase
            .from('calls').select(cols).eq('callee_id', userId).eq('status', 'ringing').gt('created_at', since)
            .order('created_at', { ascending: false }).limit(1)
          if (data?.[0]) await handlers.current.onInvite(data[0] as CallRow)
        }
      } catch {
        /* offline: the next tick retries */
      }
    }, 3000)
    return () => clearInterval(t)
  }, [userId])

  // Leaving/closing the tab mid-call: release the camera and mic.
  useEffect(() => {
    const onHide = () => {
      const cur = callRef.current
      if (cur && !cur.ended) void setCallStatus(cur.id, cur.phase === 'ringing' ? (cur.direction === 'out' ? 'cancelled' : 'declined') : 'ended').catch(() => {})
    }
    window.addEventListener('pagehide', onHide)
    return () => window.removeEventListener('pagehide', onHide)
  }, [])

  const value = useMemo<CallState>(
    () => ({ call, startCall, accept, decline, hangup, toggleMute, toggleCamera }),
    [call, startCall, accept, decline, hangup, toggleMute, toggleCamera],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useCall() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useCall must be used inside CallProvider')
  return v
}
