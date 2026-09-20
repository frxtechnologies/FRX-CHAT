import { Avatar } from '@/components/ui/Avatar'
import { IconLogout } from '@/components/ui/Icons'
import { Button, Skeleton } from '@/components/ui/Primitives'
import { ProfileForm } from '@/components/profile/ProfileForm'
import { useAuth } from '@/context/AuthContext'
import { formatDate } from '@/lib/utils'

export default function ProfilePage() {
  const { profile, signOut, user } = useAuth()

  return (
    <div className="h-full flex-1 overflow-y-auto">
      <div className="mx-auto max-w-xl px-4 py-8">
        <h1 className="mb-6 text-xl font-semibold tracking-tight">Profile</h1>
        {!profile ? (
          <div className="space-y-4" aria-hidden="true">
            <Skeleton className="h-20 w-20 rounded-full" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
          </div>
        ) : (
          <>
            <div className="mb-8 flex items-center gap-4 rounded-xl border border-line bg-surface p-4">
              <Avatar name={profile.full_name} src={profile.avatar_url} size={64} />
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold">{profile.full_name}</p>
                <p className="truncate text-sm text-muted">@{profile.username}</p>
                <p className="mt-0.5 truncate text-xs text-muted">{user?.email} · Joined {formatDate(profile.created_at)}</p>
              </div>
            </div>
            <ProfileForm />
            <div className="mt-10 border-t border-line pt-6">
              <Button variant="secondary" onClick={() => void signOut()}>
                <IconLogout width={18} height={18} /> Sign out
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
