import { supabase } from '@/lib/supabase'
import type { Profile } from '@/types'

// `last_seen` is intentionally absent: it is only readable through get_last_seens() so privacy is enforced in the DB.
export const PROFILE_COLS =
  'id, full_name, username, avatar_url, about, show_online, show_last_seen, created_at, updated_at'

export async function getProfile(id: string): Promise<Profile> {
  const { data, error } = await supabase.from('profiles').select(PROFILE_COLS).eq('id', id).single()
  if (error) throw error
  return data as Profile
}

export async function getProfiles(ids: string[]): Promise<Profile[]> {
  if (ids.length === 0) return []
  const { data, error } = await supabase.from('profiles').select(PROFILE_COLS).in('id', ids)
  if (error) throw error
  return (data ?? []) as Profile[]
}

export async function searchProfiles(query: string, excludeId: string): Promise<Profile[]> {
  const q = query.trim().replace(/[%_,()\\]/g, '')
  if (q.length < 2) return []
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLS)
    .neq('id', excludeId)
    .or(`full_name.ilike.%${q}%,username.ilike.%${q}%`)
    .order('full_name')
    .limit(20)
  if (error) throw error
  return (data ?? []) as Profile[]
}

export async function usernameAvailable(username: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('username_available', { _username: username })
  if (error) throw error
  return Boolean(data)
}

export type ProfileUpdate = Partial<
  Pick<Profile, 'full_name' | 'username' | 'avatar_url' | 'about' | 'show_online' | 'show_last_seen'>
>

export async function updateProfile(id: string, patch: ProfileUpdate): Promise<Profile> {
  const { data, error } = await supabase.from('profiles').update(patch).eq('id', id).select(PROFILE_COLS).single()
  if (error) throw error
  return data as Profile
}

export async function getLastSeens(ids: string[]): Promise<Record<string, string | null>> {
  if (ids.length === 0) return {}
  const { data, error } = await supabase.rpc('get_last_seens', { _ids: ids })
  if (error) throw error
  const out: Record<string, string | null> = {}
  for (const r of (data ?? []) as Array<{ user_id: string; last_seen: string | null }>) out[r.user_id] = r.last_seen
  return out
}

export async function touchLastSeen() {
  await supabase.rpc('touch_last_seen')
}
