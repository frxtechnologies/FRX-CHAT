import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Hosts sometimes keep stray quotes/whitespace from pasted values, so clean them first.
const clean = (v: unknown) => (typeof v === 'string' ? v.trim().replace(/^["']|["']$/g, '').trim() : undefined)
const url = clean(import.meta.env.VITE_SUPABASE_URL)
const anonKey = clean(import.meta.env.VITE_SUPABASE_ANON_KEY)

function validUrl(v: string | undefined) {
  try {
    return Boolean(v && /^https?:$/.test(new URL(v).protocol))
  } catch {
    return false
  }
}

export const isSupabaseConfigured = validUrl(url) && Boolean(anonKey)

/** Why the app can't start, for the setup screen. */
export const configProblem: string | null = !url
  ? 'VITE_SUPABASE_URL is not set.'
  : !validUrl(url)
    ? 'VITE_SUPABASE_URL is not a valid URL. It must look like https://your-project-ref.supabase.co (with https://, no quotes or spaces).'
    : !anonKey
      ? 'VITE_SUPABASE_ANON_KEY is not set.'
      : null

const REMEMBER_KEY = 'frx.remember'

/** "Remember me" decides whether the session lives in localStorage or sessionStorage. */
export function setRemember(remember: boolean) {
  try {
    localStorage.setItem(REMEMBER_KEY, remember ? '1' : '0')
  } catch {
    /* storage unavailable */
  }
}

function pickStorage(): Storage {
  try {
    return localStorage.getItem(REMEMBER_KEY) === '0' ? sessionStorage : localStorage
  } catch {
    return sessionStorage
  }
}

const storage = {
  getItem: (k: string) => {
    try {
      return pickStorage().getItem(k)
    } catch {
      return null
    }
  },
  setItem: (k: string, v: string) => {
    try {
      pickStorage().setItem(k, v)
    } catch {
      /* ignore */
    }
  },
  removeItem: (k: string) => {
    try {
      localStorage.removeItem(k)
      sessionStorage.removeItem(k)
    } catch {
      /* ignore */
    }
  },
}

// Only the public anon key is ever used in the browser; access is enforced by RLS.
export const supabase: SupabaseClient = createClient(
  isSupabaseConfigured ? url! : 'http://localhost:54321',
  isSupabaseConfigured ? anonKey! : 'missing-anon-key',
  {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage },
  },
)
