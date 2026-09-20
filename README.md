# FRX Messenger

A private, real-time web messenger for a small group of friends. React + TypeScript + Vite + Tailwind on the front, Supabase (Auth, Postgres, Realtime, Storage, RLS) on the back. Rebrand in one place: `src/config/brand.ts`.

## Setup (about 10 minutes)

1. **Create a Supabase project** at supabase.com.
2. **Run the schema.** SQL editor → paste all of `supabase/migrations/0001_schema.sql` → Run. It creates tables, RLS policies, RPCs, storage buckets and the realtime setup.
3. **Auth settings** (Authentication → Providers → Email): for a friends-only app, turn **off** "Confirm email" so accounts work immediately. If you leave it on, signup shows a "check your email" screen instead. Add `http://localhost:5173` (and your deployed URL) under Authentication → URL Configuration, so password-reset links work.
4. **Env vars.** Copy `.env.example` to `.env.local` and fill in your project URL and **anon** key (Project Settings → API). Never use the service-role key in this app.
5. `npm install`, then `npm run dev`.

Without those env vars the app shows a setup screen rather than pretending to work.

Want it invite-only? After your friends have signed up, disable "Allow new users to sign up" in Authentication settings.

## Architecture

```
src/
  config/      brand
  context/     Auth, Settings (theme/notification prefs), Toast, Presence, ChatList
  hooks/       useMessages, useTyping, useMembers, useMisc (online, last seen, signed URLs)
  services/    messages, conversations, profiles, uploads   (all Supabase calls live here)
  components/  ui, chat, messages, groups, profile
  pages/       Login, Signup, ForgotPassword/ResetPassword, Messenger, Profile, Settings, AppShell
  lib/         supabase client, utils, file validation, notifications
supabase/migrations/0001_schema.sql
```

### Realtime, by design
| Concern | Mechanism |
|---|---|
| Messages, edits, deletes, reactions, receipts, attachments | `postgres_changes`, one channel per **open** conversation, removed on unmount |
| Chat list / unread / notifications | one app-level channel (new messages, my read receipts, membership changes), debounced refetch |
| Typing | private **Broadcast** channel `conv:<id>`, never stored |
| Online status | one private **Presence** channel `lobby`; `last_seen` is written only on a 4-minute heartbeat and when the tab hides |

After a reconnect, the open conversation refetches its newest page to fill any gap.

### Receipt ticks
`✓` sent (saved) · `✓✓` grey delivered (a recipient is currently online, or has read it) · `✓✓` blue read (by the other person; by everyone in a group).
Delivery is inferred from presence; there's no per-device delivery ack.

## Security model (all enforced in the database)

- **RLS on every table.** Membership is checked via `SECURITY DEFINER` helpers (`is_member`, `is_admin`) so policies don't recurse.
- Messages: members read; only the sender inserts as themselves; only the sender edits; **no DELETE grant** (soft delete blanks the text and sets `deleted_at`). A trigger locks `sender_id`, `conversation_id`, `reply_to`, `created_at`.
- Conversations/groups are created only through RPCs; group admins alone can rename, add, remove, promote. Members can leave. If the last admin leaves, the longest-standing member is promoted.
- **Storage:** `attachments` bucket is private, with size and MIME limits; object access requires membership of the conversation encoded in the path. Files are served through short-lived signed URLs. `avatars` is public but writable only inside your own folder.
- **Privacy toggles are real:** `profiles.last_seen` isn't directly selectable; it's exposed through `get_last_seens()`, which returns nothing for users who hid it.
- Typing and presence channels are **private** and gated by `realtime.messages` policies (`can_use_topic`).
- Only the anon key is in the browser. Raw database errors are mapped to friendly messages (`friendlyError`).

## Calls (voice + video, 1:1)

Run supabase/migrations/0002_calls.sql after 0001. Call state lives in a calls table (created only through start_call / set_call_status RPCs, so the caller is authenticated by the database). WebRTC offers/answers/ICE travel over a private Realtime channel call:<id> that only the two participants can join. Media is peer-to-peer and never stored. When a call ends, a "Voice call · 2:31" / "Missed video call" entry is added to the chat.

- **Reliability:** STUN only by default. For strict networks add a TURN relay via VITE_TURN_URL, VITE_TURN_USERNAME, VITE_TURN_CREDENTIAL (these are visible in the browser, so use a limited/rotating TURN account).
- Ringing works only while the callee has the app open (no push yet). Group calls aren't supported.

## Known limits

- **I could not run this against a live Supabase project in this environment.** It type-checks and builds cleanly, and the setup screen, auth redirect, and offline error handling were exercised in a browser, but the messaging flows (send/receive, RLS, uploads, presence, groups) are untested end to end. Run the checklist below before trusting it.
- Realtime `DELETE` events can't be RLS-filtered by Supabase, so reaction removals and membership deletes are broadcast with only row IDs (no content); clients match by id / refetch.
- Notifications are in-page (Notification API + chime). There's no service worker, so nothing arrives when the tab/browser is closed. Web push would be the next step.
- No end-to-end encryption; data is readable by whoever administers the Supabase project.

## Smoke-test checklist

1. Sign up two accounts (two browsers/profiles). Refresh: you stay signed in. Sign out works.
2. A → New chat → find B → send. B sees it instantly; unread badge shows; opening it turns A's ticks blue.
3. Typing indicator; online/last seen; reply (click the quote to jump), edit, delete, react, copy.
4. Send an image, a PDF and a >25 MB file (rejected). Click the image to enlarge; download the PDF.
5. Create a group with a third account; add/remove members; leave; rename.
6. As a third user, confirm you can't see A↔B (e.g. `select * from messages` in the client returns nothing).
7. Resize to 1920 / 1024 / 768 / 430 / 390 px; on phones, list → conversation → back.
8. Turn off "Last seen" for B; A should see "Offline" with no timestamp.

## Later

The schema and services leave room for voice notes (`attachments` + `message_type`), calls (signalling over Realtime), disappearing messages (a `expires_at` column and a cron purge), stories, and E2EE (encrypt `content` client-side).
