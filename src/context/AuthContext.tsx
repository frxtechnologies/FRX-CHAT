import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { setRemember, supabase } from '@/lib/supabase'
import { getProfile } from '@/services/profiles'
import { uploadAvatar } from '@/services/uploads'
import { updateProfile } from '@/services/profiles'
import type { Profile } from '@/types'

interface SignUpInput {
  fullName: string
  username: string
  email: string
  password: string
  avatar?: File | null
}

interface AuthState {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
  signIn: (email: string, password: string, remember: boolean) => Promise<void>
  /** Resolves `needsConfirmation: true` when the project requires email confirmation. */
  signUp: (input: SignUpInput) => Promise<{ needsConfirmation: boolean }>
  signOut: () => Promise<void>
  setProfile: (p: Profile) => void
  reloadProfile: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      if (!data.session) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      if (!s) {
        setProfile(null)
        setLoading(false)
      }
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const userId = session?.user.id
  useEffect(() => {
    if (!userId) return
    let active = true
    getProfile(userId)
      .then((p) => active && setProfile(p))
      .catch(() => active && setProfile(null))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [userId])

  const signIn = useCallback(async (email: string, password: string, remember: boolean) => {
    setRemember(remember)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }, [])

  const signUp = useCallback(async (input: SignUpInput) => {
    setRemember(true)
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: { data: { full_name: input.fullName.trim(), username: input.username.toLowerCase() } },
    })
    if (error) throw error
    if (!data.session) return { needsConfirmation: true }
    if (input.avatar && data.user) {
      // Best effort: a failed avatar upload must not fail the signup.
      try {
        const url = await uploadAvatar(data.user.id, input.avatar)
        await updateProfile(data.user.id, { avatar_url: url })
      } catch {
        /* user can set a picture later from their profile */
      }
    }
    return { needsConfirmation: false }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setProfile(null)
  }, [])

  const reloadProfile = useCallback(async () => {
    if (userId) setProfile(await getProfile(userId))
  }, [userId])

  const value = useMemo<AuthState>(
    () => ({ session, user: session?.user ?? null, profile, loading, signIn, signUp, signOut, setProfile, reloadProfile }),
    [session, profile, loading, signIn, signUp, signOut, reloadProfile],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth must be used inside AuthProvider')
  return v
}
