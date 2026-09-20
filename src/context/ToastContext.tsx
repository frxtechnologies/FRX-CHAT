import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Kind = 'error' | 'success' | 'info'
interface ToastItem {
  id: number
  kind: Kind
  message: string
}

const Ctx = createContext<((message: string, kind?: Kind) => void) | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const seq = useRef(0)

  const push = useCallback((message: string, kind: Kind = 'info') => {
    const id = ++seq.current
    setItems((s) => [...s.slice(-3), { id, kind, message }])
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), kind === 'error' ? 6000 : 3500)
  }, [])

  const value = useMemo(() => push, [push])

  return (
    <Ctx.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-20 z-[100] flex flex-col items-center gap-2 px-4 md:bottom-6"
        role="status"
        aria-live="polite"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto max-w-md animate-rise rounded-lg border px-4 py-2.5 text-sm shadow-lg',
              t.kind === 'error' && 'border-danger/40 bg-surface text-fg',
              t.kind === 'success' && 'border-ok/40 bg-surface text-fg',
              t.kind === 'info' && 'border-line bg-surface text-fg',
            )}
          >
            <span
              className={cn(
                'mr-2 inline-block h-2 w-2 rounded-full',
                t.kind === 'error' ? 'bg-danger' : t.kind === 'success' ? 'bg-ok' : 'bg-accent',
              )}
            />
            {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export function useToast() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useToast must be used inside ToastProvider')
  return v
}
