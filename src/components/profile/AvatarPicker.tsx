import { useEffect, useRef, useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { IconCamera } from '@/components/ui/Icons'
import { validateAvatar } from '@/lib/files'

interface Props {
  name: string
  currentUrl?: string | null
  file: File | null
  onChange: (file: File | null) => void
  onError: (message: string) => void
  size?: number
  group?: boolean
}

export function AvatarPicker({ name, currentUrl, file, onChange, onError, size = 88, group }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)

  useEffect(() => {
    if (!file) return setPreview(null)
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => input.current?.click()}
        aria-label="Choose picture"
        className="group relative rounded-full"
      >
        <Avatar name={name || '?'} src={preview ?? currentUrl} size={size} group={group} />
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <IconCamera className="text-white" />
        </span>
      </button>
      <div className="text-sm">
        <button type="button" onClick={() => input.current?.click()} className="font-medium text-accent hover:underline">
          {file || currentUrl ? 'Change picture' : 'Add picture'}
        </button>
        {file && (
          <button type="button" onClick={() => onChange(null)} className="ml-3 text-muted hover:text-fg">
            Remove
          </button>
        )}
        <p className="mt-0.5 text-xs text-muted">JPG, PNG, WebP or GIF · up to 3 MB</p>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (!f) return
          const problem = validateAvatar(f)
          if (problem) return onError(problem)
          onChange(f)
        }}
      />
    </div>
  )
}
