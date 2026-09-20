import { supabase } from '@/lib/supabase'
import { safeFileName, validateAttachment, validateAvatar } from '@/lib/files'
import { newId } from '@/lib/utils'
import type { Attachment } from '@/types'

/** Upload a profile/group picture to the public avatars bucket (inside the caller's own folder). */
export async function uploadAvatar(userId: string, file: File): Promise<string> {
  const problem = validateAvatar(file)
  if (problem) throw new Error(problem)
  const path = `${userId}/${newId()}-${safeFileName(file.name)}`
  const { error } = await supabase.storage.from('avatars').upload(path, file, {
    cacheControl: '31536000',
    contentType: file.type,
  })
  if (error) throw error
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
}

export type NewAttachment = Pick<Attachment, 'storage_path' | 'file_name' | 'file_type' | 'file_size'>

/** Upload files to the private attachments bucket, returning the rows to attach to a message. */
export async function uploadAttachments(conversationId: string, files: File[]): Promise<NewAttachment[]> {
  const out: NewAttachment[] = []
  for (const file of files) {
    const problem = validateAttachment(file)
    if (problem) throw new Error(problem)
    const path = `${conversationId}/${newId()}/${safeFileName(file.name)}`
    const { error } = await supabase.storage.from('attachments').upload(path, file, {
      contentType: file.type,
      upsert: false,
    })
    if (error) throw error
    out.push({ storage_path: path, file_name: file.name, file_type: file.type, file_size: file.size })
  }
  return out
}

const cache = new Map<string, { url: string; expires: number }>()
const TTL = 60 * 60 // seconds

/** Signed URLs for private files, cached in memory until shortly before they expire. */
export async function getSignedUrl(path: string, download?: string | boolean): Promise<string> {
  const key = `${path}|${download ?? ''}`
  const hit = cache.get(key)
  if (hit && hit.expires > Date.now()) return hit.url
  const { data, error } = await supabase.storage.from('attachments').createSignedUrl(path, TTL, { download })
  if (error || !data) throw error ?? new Error('no url')
  cache.set(key, { url: data.signedUrl, expires: Date.now() + (TTL - 300) * 1000 })
  return data.signedUrl
}
