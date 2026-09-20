import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { AuthLayout, FormError } from '@/components/ui/AuthLayout'
import { Button, Field } from '@/components/ui/Primitives'
import { AvatarPicker } from '@/components/profile/AvatarPicker'
import { useAuth } from '@/context/AuthContext'
import { friendlyError } from '@/lib/utils'
import { usernameAvailable } from '@/services/profiles'

const USERNAME_RE = /^[a-z0-9_]{3,20}$/

export default function Signup() {
  const { signUp, session } = useAuth()
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [avatar, setAvatar] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const [confirmationSent, setConfirmationSent] = useState(false)

  if (session && !busy) return <Navigate to="/chats" replace />

  const mismatch = confirm.length > 0 && confirm !== password

  async function checkUsername() {
    const u = username.toLowerCase()
    if (!u) return setUsernameError(null)
    if (!USERNAME_RE.test(u)) return setUsernameError('3–20 characters: letters, numbers and underscores.')
    try {
      setUsernameError((await usernameAvailable(u)) ? null : 'That username is taken.')
    } catch {
      setUsernameError(null) // the server enforces uniqueness on submit anyway
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!fullName.trim()) return setError('Please enter your name.')
    if (!USERNAME_RE.test(username.toLowerCase())) return setUsernameError('3–20 characters: letters, numbers and underscores.')
    if (password.length < 8) return setError('Password must be at least 8 characters.')
    if (password !== confirm) return setError('Passwords do not match.')
    setBusy(true)
    try {
      if (!(await usernameAvailable(username.toLowerCase()))) {
        setUsernameError('That username is taken.')
        return setBusy(false)
      }
      const { needsConfirmation } = await signUp({ fullName, username, email: email.trim(), password, avatar })
      setBusy(false)
      if (needsConfirmation) setConfirmationSent(true)
    } catch (err) {
      const m = (err as Error).message?.toLowerCase() ?? ''
      setError(
        m.includes('database error') || m.includes('username')
          ? 'That username is taken or invalid. Try another one.'
          : friendlyError(err, "Couldn't create your account. Please try again."),
      )
      setBusy(false)
    }
  }

  if (confirmationSent) {
    return (
      <AuthLayout title="Check your email" subtitle={`We sent a confirmation link to ${email}. Open it, then sign in.`}>
        <Link to="/login" className="text-sm font-medium text-accent hover:underline">
          Back to sign in
        </Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Pick a username your friends can find you by."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-accent hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormError message={error} />
        <AvatarPicker name={fullName} file={avatar} onChange={setAvatar} onError={setError} />
        <Field label="Full name" autoComplete="name" required value={fullName} maxLength={60} onChange={(e) => setFullName(e.target.value)} />
        <Field
          label="Username"
          autoComplete="username"
          required
          value={username}
          maxLength={20}
          error={usernameError}
          hint="Letters, numbers and underscores."
          onChange={(e) => {
            setUsername(e.target.value.replace(/\s/g, ''))
            setUsernameError(null)
          }}
          onBlur={checkUsername}
        />
        <Field label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          hint="At least 8 characters."
          onChange={(e) => setPassword(e.target.value)}
        />
        <Field
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          error={mismatch ? 'Passwords do not match.' : null}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <Button type="submit" loading={busy} disabled={!fullName || !username || !email || !password || !confirm} className="w-full">
          Create account
        </Button>
      </form>
    </AuthLayout>
  )
}
