import { supabase } from '@/lib/supabase'
import type { Message, MessageType } from '@/types'
import type { NewAttachment } from './uploads'

export const PAGE_SIZE = 40

const MESSAGE_SELECT = `
  id, conversation_id, sender_id, content, message_type, reply_to, edited_at, deleted_at, created_at,
  attachments(id, message_id, storage_path, file_name, file_type, file_size),
  reactions:message_reactions(id, message_id, user_id, reaction),
  reads:message_reads(user_id),
  reply:messages!reply_to(id, content, sender_id, deleted_at, message_type)
`

type Row = Omit<Message, 'reads' | 'attachments' | 'reactions'> & {
  attachments: Message['attachments'] | null
  reactions: Message['reactions'] | null
  reads: Array<{ user_id: string }> | null
}

function normalise(r: Row): Message {
  return {
    ...r,
    attachments: r.attachments ?? [],
    reactions: r.reactions ?? [],
    reads: (r.reads ?? []).map((x) => x.user_id),
    reply: r.reply ?? null,
  }
}

/** Newest-first page; pass `before` (ISO timestamp) to fetch older messages. */
export async function fetchMessages(conversationId: string, before?: string): Promise<Message[]> {
  let q = supabase
    .from('messages')
    .select(MESSAGE_SELECT)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE)
  if (before) q = q.lt('created_at', before)
  const { data, error } = await q
  if (error) throw error
  return ((data ?? []) as unknown as Row[]).map(normalise).reverse()
}

export async function fetchMessage(id: string): Promise<Message | null> {
  const { data, error } = await supabase.from('messages').select(MESSAGE_SELECT).eq('id', id).maybeSingle()
  if (error) throw error
  return data ? normalise(data as unknown as Row) : null
}

export async function sendMessage(input: {
  id: string
  conversationId: string
  content: string
  type: MessageType
  replyTo: string | null
  attachments: NewAttachment[]
}) {
  const { error } = await supabase.rpc('send_message', {
    _id: input.id,
    _conversation: input.conversationId,
    _content: input.content,
    _type: input.type,
    _reply_to: input.replyTo,
    _attachments: input.attachments,
  })
  if (error) throw error
}

export async function editMessage(id: string, content: string) {
  const { error } = await supabase.from('messages').update({ content }).eq('id', id)
  if (error) throw error
}

export async function deleteMessage(id: string) {
  const { error } = await supabase.from('messages').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export async function addReaction(messageId: string, userId: string, reaction: string) {
  const { error } = await supabase
    .from('message_reactions')
    .insert({ message_id: messageId, user_id: userId, reaction })
  if (error && error.code !== '23505') throw error
}

export async function removeReaction(messageId: string, userId: string, reaction: string) {
  const { error } = await supabase
    .from('message_reactions')
    .delete()
    .eq('message_id', messageId)
    .eq('user_id', userId)
    .eq('reaction', reaction)
  if (error) throw error
}

export async function markConversationRead(conversationId: string) {
  const { error } = await supabase.rpc('mark_conversation_read', { _conversation: conversationId })
  if (error) throw error
}
