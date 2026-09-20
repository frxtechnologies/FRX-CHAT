import { memo, useState } from 'react'
import { cn, initials } from '@/lib/utils'
import { IconUsers } from './Icons'

interface Props {
  name: string
  src?: string | null
  size?: number
  online?: boolean
  group?: boolean
  className?: string
}

const HUES = [212, 199, 226, 187, 240, 172]

function hueFor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return HUES[h % HUES.length]
}

export const Avatar = memo(function Avatar({ name, src, size = 44, online, group, className }: Props) {
  const [broken, setBroken] = useState(false)
  const showImg = src && !broken
  return (
    <span
      className={cn('relative inline-flex shrink-0', className)}
      style={{ width: size, height: size }}
    >
      {showImg ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
          className="h-full w-full rounded-full object-cover"
        />
      ) : (
        <span
          className="flex h-full w-full select-none items-center justify-center rounded-full font-semibold text-white"
          style={{
            background: `hsl(${hueFor(name)} 55% 42%)`,
            fontSize: Math.max(11, size * 0.36),
          }}
          aria-hidden="true"
        >
          {group ? <IconUsers width={size * 0.5} height={size * 0.5} /> : initials(name)}
        </span>
      )}
      {online && (
        <span
          className="absolute bottom-0 right-0 rounded-full border-2 border-surface bg-ok"
          style={{ width: Math.max(9, size * 0.26), height: Math.max(9, size * 0.26) }}
          title="Online"
        />
      )}
    </span>
  )
})
