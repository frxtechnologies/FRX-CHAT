export const MAX_FILE_BYTES = 25 * 1024 * 1024
export const MAX_AVATAR_BYTES = 3 * 1024 * 1024

// Must stay in sync with the `attachments` bucket's allowed_mime_types (supabase/migrations/0001_schema.sql).
export const ALLOWED_FILE_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf', 'text/plain', 'text/csv', 'application/zip', 'application/json',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'audio/mpeg', 'audio/wav', 'audio/ogg', 'video/mp4', 'video/webm',
])

export const AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

export const isImageType = (t: string) => t.startsWith('image/')

export function validateAttachment(file: File): string | null {
  if (file.size === 0) return `"${file.name}" is empty.`
  if (file.size > MAX_FILE_BYTES) return `"${file.name}" is larger than 25 MB.`
  if (!ALLOWED_FILE_TYPES.has(file.type)) return `"${file.name}" is a file type that can't be sent.`
  return null
}

export function validateAvatar(file: File): string | null {
  if (!AVATAR_TYPES.has(file.type)) return 'Use a JPG, PNG, WebP or GIF image.'
  if (file.size > MAX_AVATAR_BYTES) return 'Profile pictures must be under 3 MB.'
  return null
}

export function safeFileName(name: string) {
  const dot = name.lastIndexOf('.')
  const ext = dot > 0 ? name.slice(dot).replace(/[^a-zA-Z0-9.]/g, '').slice(0, 10) : ''
  const base = (dot > 0 ? name.slice(0, dot) : name).replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 60) || 'file'
  return base + ext
}
