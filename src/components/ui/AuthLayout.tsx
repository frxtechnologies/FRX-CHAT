import type { ReactNode } from 'react'
import { brand } from '@/config/brand'
import { Logo } from './Icons'

export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center bg-bg px-4 py-10">
      <div className="w-full max-w-sm animate-rise">
        <div className="mb-8 flex items-center gap-3">
          <Logo size={36} />
          <span className="text-lg font-semibold tracking-tight">{brand.name}</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
        <div className="mt-6">{children}</div>
        {footer && <div className="mt-6 text-center text-sm text-muted">{footer}</div>}
      </div>
    </div>
  )
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm">
      {message}
    </div>
  )
}
