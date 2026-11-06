import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Ask the browser to keep this app's saved stories, photos and recordings even when the phone is
// low on space or the app hasn't been opened in a while (some browsers clear unprotected site data).
navigator.storage?.persist?.().catch(() => null)
