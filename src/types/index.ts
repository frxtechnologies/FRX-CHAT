export interface Profile {
  id: string
  full_name: string
  username: string
  avatar_url: string | null
  about: string
  show_online: boolean
  show_last_seen: boolean
  created_at: string
  updated_at: string
}

export type ConversationType = 'direct' | 'group'
export type MemberRole = 'admin' | 'member'

export interface ChatListItem {
  id: string
  type: ConversationType
  name: string | null
  avatar_url: string | null
  description: string | null
  created_by: string | null
  created_at: string
  last_message_at: string
  my_role: MemberRole
  other_user_id: string | null
  other_full_name: string | null
  other_username: string | null
  other_avatar_url: string | null
  last_message_id: string | null
  last_message_content: string | null
  last_message_type: MessageType | null
  last_message_sender_id: string | null
  last_message_sender_name: string | null
  last_message_created_at: string | null
  last_message_deleted: boolean | null
  unread_count: number
}

export interface Member {
  id: string
  conversation_id: string
  user_id: string
  role: MemberRole
  joined_at: string
  profile: Profile
}

export type MessageType = 'text' | 'image' | 'file' | 'call'

export interface Attachment {
  id: string
  message_id: string
  storage_path: string
  file_name: string
  file_type: string
  file_size: number
  /** Client-only: blob URL used while the upload is in flight. */
  localUrl?: string
}

export interface Reaction {
  id: string
  message_id: string
  user_id: string
  reaction: string
}

export interface ReplyPreview {
  id: string
  content: string
  sender_id: string
  deleted_at: string | null
  message_type: MessageType
}

export interface Message {
  id: string
  conversation_id: string
  sender_id: string
  content: string
  message_type: MessageType
  reply_to: string | null
  edited_at: string | null
  deleted_at: string | null
  created_at: string
  attachments: Attachment[]
  reactions: Reaction[]
  /** user ids that have read this message */
  reads: string[]
  reply: ReplyPreview | null
  /** Client-only delivery state for optimistic sends. */
  status?: 'sending' | 'failed'
}

export interface SearchMessageHit {
  id: string
  conversation_id: string
  sender_id: string
  sender_name: string
  content: string
  created_at: string
}

export const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥'] as const
