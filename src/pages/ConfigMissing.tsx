import { brand } from '@/config/brand'
import { Logo } from '@/components/ui/Icons'
import { configProblem } from '@/lib/supabase'

export default function ConfigMissing() {
  return (
    <div className="flex min-h-full items-center justify-center bg-bg px-4 py-10">
      <div className="w-full max-w-xl">
        <div className="mb-6 flex items-center gap-3">
          <Logo size={36} />
          <span className="text-lg font-semibold">{brand.name}</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Connect your Supabase project</h1>
        <p className="mt-2 text-sm text-muted">
          This app stores messages in Supabase. It needs two environment variables before it can start.
        </p>
        {configProblem && (
          <p role="alert" className="mt-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm">
            {configProblem}
          </p>
        )}
        <ol className="mt-6 space-y-4 text-sm">
          <li>
            <b>1.</b> Create a project at supabase.com, then open the SQL editor and run{' '}
            <code className="rounded bg-raised px-1.5 py-0.5">supabase/migrations/0001_schema.sql</code>.
          </li>
          <li>
            <b>2.</b> Copy <code className="rounded bg-raised px-1.5 py-0.5">.env.example</code> to{' '}
            <code className="rounded bg-raised px-1.5 py-0.5">.env.local</code> and fill in:
            <pre className="mt-2 overflow-x-auto rounded-lg border border-line bg-surface p-3 text-xs">
{`VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon public key>`}
            </pre>
            <span className="mt-1 block text-muted">
              Project Settings → API. Use the <b>anon</b> key only — never the service-role key.
            </span>
          </li>
          <li>
            <b>3.</b> Restart the dev server (<code className="rounded bg-raised px-1.5 py-0.5">npm run dev</code>).
          </li>
        </ol>
        <p className="mt-6 text-xs text-muted">Full instructions are in README.md.</p>
      </div>
    </div>
  )
}
