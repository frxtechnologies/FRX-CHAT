import { useState } from 'react'
import { AvatarPicker } from '@/components/profile/AvatarPicker'
import { Button, Field, TextArea } from '@/components/ui/Primitives'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { friendlyError } from '@/lib/utils'
import { updateProfile, usernameAvailable } from '@/services/profiles'
import { uploadAvatar } from '@/services/uploads'

const USERNAME_RE = /^[a-z0-9_]{3,20}$/

export function ProfileForm({ onSaved }: { onSaved?: () => void }) {
  const { profile, setProfile, user } = useAuth()
  const toast = useToast()
  const [name, setName] = useState(profile?.full_name ?? '')
  const [username, setUsername] = useState(profile?.username ?? '')
  const [about, setAbout] = useState(profile?.about ?? '')
  const [avatar, setAvatar] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [usernameError, setUsernameError] = useState<string | null>(null)

  if (!profile || !user) return null

  const dirty =
    name.trim() !== profile.full_name || username.toLowerCase() !== profile.username || about !== profile.about || avatar !== null

  async function save() {
    if (!profile || !user) return
    const u = username.trim().toLowerCase()
    if (!USERNAME_RE.test(u)) return setUsernameError('3–20 characters: letters, numbers and underscores.')
    setBusy(true)
    try {
      if (u !== profile.username && !(await usernameAvailable(u))) {
        setUsernameError('That username is taken.')
        return setBusy(false)
      }
      const avatar_url = avatar ? await uploadAvatar(user.id, avatar) : undefined
      const updated = await updateProfile(user.id, {
        full_name: name.trim(),
        username: u,
        about: about.trim(),
        ...(avatar_url ? { avatar_url } : {}),
      })
      setProfile(updated)
      setAvatar(null)
      toast('Profile saved.', 'success')
      onSaved?.()
    } catch (e) {
      toast(friendlyError(e, "Couldn't save your profile. Please try again."), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <AvatarPicker name={name} currentUrl={profile.avatar_url} file={avatar} onChange={setAvatar} onError={(m) => toast(m, 'error')} />
      <Field label="Full name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
      <Field
        label="Username"
        value={username}
        maxLength={20}
        error={usernameError}
        onChange={(e) => {
          setUsername(e.target.value.replace(/\s/g, ''))
          setUsernameError(null)
        }}
      />
      <TextArea label="About" value={about} maxLength={200} onChange={(e) => setAbout(e.target.value)} />
      <Button onClick={save} loading={busy} disabled={!dirty || !name.trim()}>
        Save changes
      </Button>
    </div>
  )
}
