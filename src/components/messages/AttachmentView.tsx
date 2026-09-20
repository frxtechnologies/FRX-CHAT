import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconClose, IconDownload, IconFile, IconAlert } from '@/components/ui/Icons'
import { IconButton } from '@/components/ui/Primitives'
import { useSignedUrl } from '@/hooks/useMisc'
import { isImageType } from '@/lib/files'
import { cn, formatBytes } from '@/lib/utils'
import type { Attachment } from '@/types'

export function ImageAttachment({ att, onOpen }: { att: Attachment; onOpen: (url: string, name: string, path: string) => void }) {
  const { url: signed, error } = useSignedUrl(att.localUrl ? null : att.storage_path)
  const [loaded, setLoaded] = useState(false)
  const src = att.localUrl ?? signed

  if (error) {
    return (
      <div className="flex h-32 w-56 items-center justify-center gap-2 rounded-xl bg-black/20 text-xs opacity-80">
        <IconAlert width={16} height={16} /> Image unavailable
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={() => src && onOpen(src, att.file_name, att.storage_path)}
      className="relative block overflow-hidden rounded-xl bg-black/20"
      aria-label={`Open image ${att.file_name}`}
    >
      {!loaded && <div className="skeleton absolute inset-0" />}
      {src && (
        <img
          src={src}
          alt={att.file_name}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          className={cn('block max-h-72 min-h-24 min-w-32 max-w-full object-cover transition-opacity', loaded ? 'opacity-100' : 'opacity-0')}
          style={{ maxWidth: 'min(18rem, 100%)' }}
        />
      )}
      {!src && <div className="h-40 w-56" />}
    </button>
  )
}

export function FileAttachment({ att }: { att: Attachment }) {
  const [want, setWant] = useState(false)
  const { url, error } = useSignedUrl(want ? att.storage_path : null, att.file_name)

  useEffect(() => {
    if (want && url) {
      const a = document.createElement('a')
      a.href = url
      a.download = att.file_name
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      a.remove()
      setWant(false)
    }
  }, [want, url, att.file_name])

  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl bg-black/15 px-3 py-2.5">
      <IconFile className="shrink-0" width={26} height={26} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{att.file_name}</p>
        <p className="text-xs opacity-70">{formatBytes(att.file_size)}</p>
      </div>
      {att.storage_path && (
        <button
          onClick={() => setWant(true)}
          disabled={want && !error}
          className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium underline-offset-2 hover:underline disabled:opacity-60"
        >
          <IconDownload width={16} height={16} />
          {error ? 'Retry' : want ? '…' : 'Download'}
        </button>
      )}
    </div>
  )
}

export function AttachmentList({ attachments, onOpenImage }: { attachments: Attachment[]; onOpenImage: (url: string, name: string, path: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      {attachments.map((a) =>
        isImageType(a.file_type) ? <ImageAttachment key={a.id} att={a} onOpen={onOpenImage} /> : <FileAttachment key={a.id} att={a} />,
      )}
    </div>
  )
}

export function Lightbox({ url, name, path, onClose }: { url: string; name: string; path: string; onClose: () => void }) {
  const { url: dl } = useSignedUrl(path || null, name)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div className="fixed inset-0 z-[60] flex animate-fade flex-col bg-black/90" onClick={onClose} role="dialog" aria-modal="true" aria-label={name}>
      <div className="flex items-center justify-between px-4 py-3 text-white" onClick={(e) => e.stopPropagation()}>
        <p className="truncate text-sm">{name}</p>
        <div className="flex items-center gap-1">
          {dl && (
            <a href={dl} download={name} className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10" aria-label="Download">
              <IconDownload />
            </a>
          )}
          <IconButton label="Close" onClick={onClose} className="text-white hover:bg-white/10 hover:text-white">
            <IconClose />
          </IconButton>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-4">
        <img src={url} alt={name} className="max-h-full max-w-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
      </div>
    </div>,
    document.body,
  )
}
