import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Button, Field, Toggle } from '@/components/ui/Primitives'
import { brand } from '@/config/brand'
import { useAuth } from '@/context/AuthContext'
import { useSettings, type ThemeMode } from '@/context/SettingsContext'
import { useToast } from '@/context/ToastContext'
import { notificationPermission, requestNotificationPermission } from '@/lib/notify'
import { supabase } from '@/lib/supabase'
import { cn, friendlyError } from '@/lib/utils'
import { updateProfile } from '@/services/profiles'
import { IconLogout } from '@/components/ui/Icons'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">{title}</h2>
      <div className="divide-y divide-line rounded-xl border border-line bg-surface">{children}</div>
    </section>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
      {children}
    </div>
  )
}

function ChangePassword() {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setError(null)
    if (pw.length < 8) return setError('Password must be at least 8 characters.')
    if (pw !== confirm) return setError('Passwords do not match.')
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    if (error) return setError(friendlyError(error, "Couldn't change your password. Please try again."))
    toast('Password changed.', 'success')
    setOpen(false)
    setPw('')
    setConfirm('')
  }

  if (!open) {
    return (
      <Row label="Password">
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          Change
        </Button>
      </Row>
    )
  }
  return (
    <div className="space-y-3 px-4 py-4">
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Field label="New password" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
      <Field label="Confirm new password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button size="sm" loading={busy} disabled={!pw || !confirm} onClick={save}>
          Update password
        </Button>
      </div>
    </div>
  )
}

const THEMES: Array<{ value: ThemeMode; label: string }> = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System' },
]

export default function SettingsPage() {
  const { profile, setProfile, user, signOut } = useAuth()
  const settings = useSettings()
  const toast = useToast()
  const [perm, setPerm] = useState(notificationPermission())

  async function setPrivacy(patch: { show_online?: boolean; show_last_seen?: boolean }) {
    if (!user) return
    try {
      setProfile(await updateProfile(user.id, patch))
    } catch (e) {
      toast(friendlyError(e, "Couldn't update that setting."), 'error')
    }
  }

  async function toggleNotifications(on: boolean) {
    settings.update({ notifications: on })
    if (on && perm === 'default') setPerm(await requestNotificationPermission())
  }

  return (
    <div className="h-full flex-1 overflow-y-auto">
      <div className="mx-auto max-w-xl px-4 py-8">
        <h1 className="mb-6 text-xl font-semibold tracking-tight">Settings</h1>

        <Section title="Account">
          <Row label="Edit profile" hint={profile ? `${profile.full_name} · @${profile.username}` : undefined}>
            <Link to="/profile" className="text-sm font-medium text-accent hover:underline">
              Open
            </Link>
          </Row>
          <Row label="Email" hint={user?.email ?? ''}>
            <span />
          </Row>
          <ChangePassword />
        </Section>

        <Section title="Appearance">
          <div className="p-3">
            <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-1 rounded-lg bg-bg p-1">
              {THEMES.map((t) => (
                <button
                  key={t.value}
                  role="radio"
                  aria-checked={settings.theme === t.value}
                  onClick={() => settings.update({ theme: t.value })}
                  className={cn(
                    'h-9 rounded-md text-sm font-medium transition-colors',
                    settings.theme === t.value ? 'bg-accent text-accent-fg' : 'text-muted hover:text-fg',
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </Section>

        <Section title="Notifications">
          <Row
            label="Message notifications"
            hint={
              perm === 'denied'
                ? 'Blocked in your browser settings.'
                : perm === 'unsupported'
                  ? 'Not supported by this browser.'
                  : 'Desktop alerts when the app is in the background.'
            }
          >
            <Toggle
              label="Message notifications"
              checked={settings.notifications && perm !== 'denied' && perm !== 'unsupported'}
              onChange={toggleNotifications}
            />
          </Row>
          <Row label="Sound" hint="Play a chime for new messages.">
            <Toggle label="Sound" checked={settings.sound} onChange={(v) => settings.update({ sound: v })} />
          </Row>
        </Section>

        <Section title="Privacy">
          <Row label="Online status" hint="Let friends see when you're online.">
            <Toggle label="Online status" checked={profile?.show_online ?? true} onChange={(v) => setPrivacy({ show_online: v })} />
          </Row>
          <Row label="Last seen" hint="Let friends see when you were last active.">
            <Toggle label="Last seen" checked={profile?.show_last_seen ?? true} onChange={(v) => setPrivacy({ show_last_seen: v })} />
          </Row>
        </Section>

        <Section title="About">
          <Row label={brand.name} hint={brand.tagline}>
            <span className="text-sm text-muted">v{brand.version}</span>
          </Row>
          <Row label="Data" hint="Messages are stored in your Supabase project and protected by row-level security.">
            <span />
          </Row>
        </Section>

        <Button variant="secondary" onClick={() => void signOut()}>
          <IconLogout width={18} height={18} /> Sign out
        </Button>
      </div>
    </div>
  )
}
