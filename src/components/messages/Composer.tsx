import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { IconButton } from '@/components/ui/Primitives'
import { IconClip, IconClose, IconEdit, IconFile, IconReply, IconSend, IconSmile } from '@/components/ui/Icons'
import { isImageType, validateAttachment } from '@/lib/files'
import { cn, formatBytes } from '@/lib/utils'
import type { Message } from '@/types'

const EmojiPicker = lazy(() => import('emoji-picker-react'))

interface Props {
  replyTo: Message | null
  replyToName: string | null
  editing: Message | null
  onSend: (content: string, files: File[]) => void
  onSaveEdit: (content: string) => void
  onCancelContext: () => void
  onTyping: () => void
  onStopTyping: () => void
  onError: (message: string) => void
}

const MAX_FILES = 10

export function Composer({ replyTo, replyToName, editing, onSend, onSaveEdit, onCancelContext, onTyping, onStopTyping, onError }: Props) {
  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [emojiOpen, setEmojiOpen] = useState(false)
  const area = useRef<HTMLTextAreaElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  // Entering edit mode loads the message text; leaving it clears the box.
  useEffect(() => {
    if (editing) {
      setText(editing.content)
      setFiles([])
      requestAnimationFrame(() => area.current?.focus())
    }
  }, [editing])
  useEffect(() => {
    if (replyTo) area.current?.focus()
  }, [replyTo])

  useLayoutEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [text])

  const canSend = (text.trim().length > 0 || (files.length > 0 && !editing)) && !(editing && text.trim() === editing.content.trim())

  function submit() {
    if (!canSend) return
    if (editing) onSaveEdit(text.trim())
    else onSend(text.trim(), files)
    setText('')
    setFiles([])
    setEmojiOpen(false)
    onStopTyping()
    area.current?.focus()
  }

  function addFiles(list: File[]) {
    const accepted: File[] = []
    for (const f of list) {
      const problem = validateAttachment(f)
      if (problem) onError(problem)
      else accepted.push(f)
    }
    if (accepted.length) {
      setFiles((cur) => {
        if (cur.length + accepted.length > MAX_FILES) onError(`You can attach up to ${MAX_FILES} files at once.`)
        return [...cur, ...accepted].slice(0, MAX_FILES)
      })
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    } else if (e.key === 'Escape' && (editing || replyTo)) {
      onCancelContext()
      if (editing) setText('')
    }
  }

  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const pasted = [...e.clipboardData.files]
    if (pasted.length && !editing) {
      e.preventDefault()
      addFiles(pasted)
    }
  }

  function insertEmoji(emoji: string) {
    const el = area.current
    const start = el?.selectionStart ?? text.length
    const end = el?.selectionEnd ?? text.length
    setText(text.slice(0, start) + emoji + text.slice(end))
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(start + emoji.length, start + emoji.length)
    })
    onTyping()
  }

  return (
    <div className="safe-b relative border-t border-line bg-surface">
      {(replyTo || editing) && (
        <div className="flex items-center gap-3 border-b border-line/60 px-4 py-2 text-sm">
          {editing ? <IconEdit width={18} height={18} className="text-accent" /> : <IconReply width={18} height={18} className="text-accent" />}
          <div className="min-w-0 flex-1 border-l-[3px] border-accent pl-2.5">
            <p className="truncate text-xs font-semibold text-accent">{editing ? 'Editing message' : `Replying to ${replyToName ?? 'message'}`}</p>
            {!editing && replyTo && (
              <p className="truncate text-xs text-muted">{replyTo.content || (replyTo.message_type === 'image' ? 'Photo' : 'File')}</p>
            )}
          </div>
          <IconButton
            label="Cancel"
            className="h-8 w-8"
            onClick={() => {
              onCancelContext()
              if (editing) setText('')
            }}
          >
            <IconClose width={16} height={16} />
          </IconButton>
        </div>
      )}

      {files.length > 0 && (
        <ul className="flex gap-2 overflow-x-auto px-4 pt-3">
          {files.map((f, i) => (
            <li key={i} className="relative shrink-0">
              <FileChip file={f} />
              <button
                aria-label={`Remove ${f.name}`}
                onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-fg text-bg"
              >
                <IconClose width={12} height={12} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-end gap-1 px-2 py-2 md:px-4">
        {!editing && (
          <IconButton label="Attach file" onClick={() => fileInput.current?.click()} className="h-11 w-11">
            <IconClip />
          </IconButton>
        )}
        <div className="relative">
          <IconButton label="Emoji" onClick={() => setEmojiOpen((o) => !o)} className={cn('h-11 w-11', emojiOpen && 'bg-raised text-fg')}>
            <IconSmile />
          </IconButton>
          {emojiOpen && (
            <div className="absolute bottom-14 left-0 z-30 animate-fade">
              <Suspense fallback={<div className="h-[380px] w-[320px] rounded-xl border border-line bg-surface" />}>
                <EmojiPicker
                  onEmojiClick={(d) => insertEmoji(d.emoji)}
                  theme={(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark') as never}
                  lazyLoadEmojis
                  width={Math.min(340, window.innerWidth - 24)}
                  height={380}
                  previewConfig={{ showPreview: false }}
                />
              </Suspense>
            </div>
          )}
        </div>
        <textarea
          ref={area}
          value={text}
          rows={1}
          maxLength={4000}
          placeholder="Type a message"
          aria-label="Message"
          enterKeyHint="send"
          onChange={(e) => {
            setText(e.target.value)
            if (e.target.value && !editing) onTyping()
            else if (!e.target.value) onStopTyping()
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onBlur={onStopTyping}
          className="max-h-40 min-h-11 flex-1 resize-none rounded-2xl border border-transparent bg-raised px-4 py-[11px] text-[15px] leading-snug placeholder:text-muted focus:border-accent focus:outline-none"
        />
        <button
          onClick={submit}
          disabled={!canSend}
          aria-label={editing ? 'Save edit' : 'Send message'}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg transition-all hover:brightness-110 disabled:bg-raised disabled:text-muted"
        >
          <IconSend />
        </button>
      </div>
      <input
        ref={fileInput}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          addFiles([...(e.target.files ?? [])])
          e.target.value = ''
        }}
      />
    </div>
  )
}

function FileChip({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!isImageType(file.type)) return
    const u = URL.createObjectURL(file)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [file])
  return url ? (
    <img src={url} alt={file.name} className="h-16 w-16 rounded-lg object-cover" />
  ) : (
    <div className="flex h-16 w-40 items-center gap-2 rounded-lg bg-raised px-3">
      <IconFile className="shrink-0" />
      <div className="min-w-0">
        <p className="truncate text-xs font-medium">{file.name}</p>
        <p className="text-[11px] text-muted">{formatBytes(file.size)}</p>
      </div>
    </div>
  )
}
