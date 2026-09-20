import { supabase } from '@/lib/supabase'
import { PROFILE_COLS } from './profiles'
import type { ChatListItem, Member, Profile, SearchMessageHit } from '@/types'

export async function fetchChatList(): Promise<ChatListItem[]> {
  const { data, error } = await supabase.rpc('get_chat_list')
  if (error) throw error
  return ((data ?? []) as ChatListItem[]).map((c) => ({ ...c, unread_count: Number(c.unread_count) }))
}

export async function createDirectConversation(otherUserId: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_direct_conversation', { _other: otherUserId })
  if (error) throw error
  return data as string
}

export async function createGroup(input: {
  name: string
  description: string
  avatarUrl: string | null
  memberIds: string[]
}): Promise<string> {
  const { data, error } = await supabase.rpc('create_group', {
    _name: input.name,
    _description: input.description,
    _avatar_url: input.avatarUrl,
    _members: input.memberIds,
  })
  if (error) throw error
  return data as string
}

export async function fetchMembers(conversationId: string): Promise<Member[]> {
  const { data, error } = await supabase
    .from('conversation_members')
    .select(`id, conversation_id, user_id, role, joined_at, profile:profiles!user_id(${PROFILE_COLS})`)
    .eq('conversation_id', conversationId)
    .order('joined_at')
  if (error) throw error
  return (data ?? []) as unknown as Member[]
}

export async function updateGroup(
  id: string,
  patch: { name?: string; description?: string | null; avatar_url?: string | null },
) {
  const { error } = await supabase.from('conversations').update(patch).eq('id', id)
  if (error) throw error
}

export async function addMembers(conversationId: string, userIds: string[]) {
  const { error } = await supabase
    .from('conversation_members')
    .insert(userIds.map((user_id) => ({ conversation_id: conversationId, user_id, role: 'member' })))
  if (error) throw error
}

export async function removeMember(conversationId: string, userId: string) {
  const { error } = await supabase
    .from('conversation_members')
    .delete()
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
  if (error) throw error
}

export async function setMemberRole(conversationId: string, userId: string, role: 'admin' | 'member') {
  const { error } = await supabase
    .from('conversation_members')
    .update({ role })
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
  if (error) throw error
}

export async function searchMessages(query: string): Promise<SearchMessageHit[]> {
  const { data, error } = await supabase.rpc('search_messages', { _query: query })
  if (error) throw error
  return (data ?? []) as SearchMessageHit[]
}

export type { Profile }
