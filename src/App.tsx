import { lazy, Suspense, type ReactElement } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Spinner } from '@/components/ui/Primitives'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { SettingsProvider } from '@/context/SettingsContext'
import { ToastProvider } from '@/context/ToastContext'
import { isSupabaseConfigured } from '@/lib/supabase'
import AppShell from '@/pages/AppShell'
import ConfigMissing from '@/pages/ConfigMissing'
import { ForgotPassword, ResetPassword } from '@/pages/ForgotPassword'
import Login from '@/pages/Login'
import Messenger from '@/pages/Messenger'
import Signup from '@/pages/Signup'

const ProfilePage = lazy(() => import('@/pages/Profile'))
const SettingsPage = lazy(() => import('@/pages/Settings'))
// Dev-only visual harness; the DEV guard removes it from production bundles.
const DevPreview = import.meta.env.DEV ? lazy(() => import('@/pages/DevPreview')) : null

function FullScreenSpinner() {
  return (
    <div className="flex h-full items-center justify-center text-muted">
      <Spinner size={28} />
    </div>
  )
}

function RequireAuth({ children }: { children: ReactElement }) {
  const { session, loading } = useAuth()
  const location = useLocation()
  if (loading) return <FullScreenSpinner />
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return children
}

export default function App() {
  if (!isSupabaseConfigured) return <ConfigMissing />
  return (
    <SettingsProvider>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <Suspense fallback={<FullScreenSpinner />}>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/signup" element={<Signup />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                {DevPreview && <Route path="/__preview" element={<DevPreview />} />}
                <Route
                  element={
                    <RequireAuth>
                      <AppShell />
                    </RequireAuth>
                  }
                >
                  <Route path="/chats" element={<Messenger />} />
                  <Route path="/chats/:conversationId" element={<Messenger />} />
                  <Route path="/profile" element={<ProfilePage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                </Route>
                <Route path="*" element={<Navigate to="/chats" replace />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </SettingsProvider>
  )
}

