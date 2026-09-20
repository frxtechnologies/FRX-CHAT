// Development-only visual harness (never included in production builds). Renders the real
// components with static sample data so layouts can be checked without a backend session.
import { useState } from 'react'
import { ChatHeader } from '@/components/chat/ChatHeader'
import { ChatListItem } from '@/components/chat/ChatListItem'
import { Composer } from '@/components/messages/Composer'
import { MessageList } from '@/components/messages/MessageList'
import { MessageMenu } from '@/components/messages/MessageMenu'
import { IconPlus, IconSearch, IconUsers } from '@/components/ui/Icons'
import { IconButton } from '@/components/ui/Primitives'
import type { ChatListItem as Chat, Member, Message, Profile } from '@/types'

const ME = 'me'
const iso = (minsAgo: number) => new Date(Date.now() - minsAgo * 60_000).toISOString()

const prof = (id: string, name: string): Profile => ({
  id, full_name: name, username: name.toLowerCase().split(' ')[0], avatar_url: null, about: '',
  show_online: true, show_last_seen: true, created_at: iso(9999), updated_at: iso(9999),
})
const profiles: Record<string, Profile> = { me: prof('me', 'Feroze Mughal'), raaef: prof('raaef', 'Raaef Khan'), ali: prof('ali', 'Ali Raza') }
const members: Member[] = Object.values(profiles).map((p) => ({ id: p.id, conversation_id: 'c1', user_id: p.id, role: 'member', joined_at: iso(9999), profile: p }))

const msg = (id: string, sender: string, content: string, minsAgo: number, extra: Partial<Message> = {}): Message => ({
  id, conversation_id: 'c1', sender_id: sender, content, message_type: 'text', reply_to: null, edited_at: null,
  deleted_at: null, created_at: iso(minsAgo), attachments: [], reactions: [], reads: [], reply: null, ...extra,
})

const messages: Message[] = [
  msg('1', 'raaef', 'Bro are you free tonight?', 1500),
  msg('2', ME, 'Yeah, after 8. What’s the plan?', 1490, { reads: ['raaef'] }),
  msg('3', 'raaef', 'I’ll send the file tonight, check https://frxchat.netlify.app when you get a chance', 60),
  msg('4', 'raaef', 'Also a very long unbroken string to test wrapping: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 58, {
    reactions: [{ id: 'r1', message_id: '4', user_id: ME, reaction: '👍' }, { id: 'r2', message_id: '4', user_id: 'ali', reaction: '👍' }, { id: 'r3', message_id: '4', user_id: 'ali', reaction: '🔥' }],
  }),
  msg('5', ME, 'Okay bro 👍', 30, { reads: ['raaef'], reply: { id: '3', content: 'I’ll send the file tonight', sender_id: 'raaef', deleted_at: null, message_type: 'text' } }),
  msg('6', ME, 'Here is the spec', 12, {
    message_type: 'file', reads: [],
    attachments: [{ id: 'a1', message_id: '6', storage_path: '', file_name: 'project-spec-final.pdf', file_type: 'application/pdf', file_size: 2516582 }],
  }),
  msg('7', ME, '', 10, { deleted_at: iso(9) }),
  msg('8', 'raaef', 'voice|missed|0', 5, { message_type: 'call' }),
  msg('9', 'raaef', 'Calling you now', 2, { edited_at: iso(1) }),
]

const chat = (id: string, name: string, last: string, unread: number, extra: Partial<Chat> = {}): Chat => ({
  id, type: 'direct', name: null, avatar_url: null, description: null, created_by: null, created_at: iso(9999),
  last_message_at: iso(5), my_role: 'member', other_user_id: id, other_full_name: name, other_username: name, other_avatar_url: null,
  last_message_id: 'm', last_message_content: last, last_message_type: 'text', last_message_sender_id: id,
  last_message_sender_name: name, last_message_created_at: iso(5), last_message_deleted: false, unread_count: unread, ...extra,
})
const chats: Chat[] = [
  chat('raaef', 'Raaef Khan', 'Bro I’ll call you later', 3),
  chat('ali', 'Ali Raza', 'See you tomorrow', 0, { last_message_sender_id: ME }),
  chat('g', 'FRX Team', 'Project is ready', 12, { type: 'group', name: 'FRX Team', other_user_id: null, last_message_sender_id: 'ali', last_message_sender_name: 'Ali Raza' }),
]

export default function DevPreview() {
  const view = new URLSearchParams(location.search).get('v') ?? 'chat'
  const [menu, setMenu] = useState<Message | null>(view === 'menu' ? messages[4] : null)

  if (view === 'list') {
    return (
      <div className="h-app flex flex-col bg-surface">
        <header className="flex items-center justify-between px-4 pb-2 pt-4">
          <h1 className="text-xl font-semibold tracking-tight">Chats</h1>
          <div className="flex gap-1">
            <IconButton label="New group"><IconUsers /></IconButton>
            <IconButton label="New chat" className="bg-accent text-accent-fg"><IconPlus /></IconButton>
          </div>
        </header>
        <div className="px-3 pb-2">
          <div className="relative">
            <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" width={18} height={18} />
            <input placeholder="Search chats and messages" className="h-10 w-full rounded-lg bg-raised pl-10 text-sm" />
          </div>
        </div>
        <ul className="flex-1 overflow-y-auto">
          {chats.map((c, i) => (
            <ChatListItem key={c.id} chat={c} me={ME} active={i === 1} online={i === 0} onOpen={() => {}} />
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div className="h-app flex flex-col bg-bg">
      <ChatHeader chat={chats[0]} me={ME} members={members} typingNames={[]} onBack={() => {}} onInfo={() => {}} onCall={() => {}} />
      <MessageList
        messages={messages} me={ME} isGroup={false} members={members} profiles={profiles} onlineIds={new Set(['raaef'])}
        loading={false} loadingOlder={false} hasMore={false} error={null} highlightId={null}
        onLoadOlder={() => {}} onMenu={setMenu} onReact={() => {}} onJump={() => {}} onRetry={() => {}} onDiscard={() => {}} onOpenImage={() => {}}
      />
      <div className="h-5 shrink-0 bg-bg" />
      <Composer replyTo={null} replyToName={null} editing={null} onSend={() => {}} onSaveEdit={() => {}} onCancelContext={() => {}} onTyping={() => {}} onStopTyping={() => {}} onError={() => {}} />
      {menu && (
        <MessageMenu message={menu} mine={menu.sender_id === ME} myReactions={new Set()} onClose={() => setMenu(null)} onReact={() => {}} onReply={() => {}} onCopy={() => {}} onEdit={() => {}} onDelete={() => {}} />
      )}
    </div>
  )
}
