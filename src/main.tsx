import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

// Keep the app exactly as tall as the visible area, so the on-screen keyboard never covers the composer.
const vv = window.visualViewport
if (vv) {
  const sync = () => {
    document.documentElement.style.setProperty('--app-h', `${vv.height}px`)
    if (vv.offsetTop > 0) window.scrollTo(0, 0)
  }
  vv.addEventListener('resize', sync)
  vv.addEventListener('scroll', sync)
  sync()
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
