import { useEffect, useRef, useState, type ReactNode } from 'react'
import { mediaKind } from '../lib/store'
import { useData } from '../lib/data'
import type { ID } from '../lib/types'

const paths: Record<string, ReactNode> = {
  home: <path d="M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z" />,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v3" /></>,
  video: <><rect x="3" y="6" width="13" height="12" rx="2" /><path d="M16 10l5-3v10l-5-3z" /></>,
  book: <path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2zm0 0v16M8 7h7" />,
  heart: <path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z" />,
  pill: <><rect x="3" y="7" width="18" height="13" rx="2.5" /><path d="M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M12 10.5v6M9 13.5h6" /></>,
  tree: <><circle cx="12" cy="5" r="2.5" /><circle cx="5" cy="19" r="2.5" /><circle cx="19" cy="19" r="2.5" /><path d="M12 7.5V12M5 16.5V12h14v4.5" /></>,
  quote: <path d="M7 7h4v4c0 3-1.5 5-4 6M15 7h4v4c0 3-1.5 5-4 6" />,
  share: <><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4" /></>,
  type: <path d="M5 6V4h14v2M12 4v16M9 20h6" />,
  upload: <path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" />,
  skip: <path d="M5 5l9 7-9 7zM18 5v14" />,
  play: <path d="M7 4l13 8-13 8z" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
  plus: <path d="M12 5v14M5 12h14" />,
  back: <path d="M15 5l-7 7 7 7" />,
  sparkle: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" />,
  print: <><path d="M6 9V3h12v6" /><rect x="3" y="9" width="18" height="8" rx="2" /><path d="M7 14h10v7H7z" /></>,
  speaker: <path d="M4 9h4l5-4v14l-5-4H4zM16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12" />,
  camera: <><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></>,
  trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />,
  check: <path d="M4 12l5 5L20 6" />,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></>,
}

export function Icon({ name, size = 22 }: { name: keyof typeof paths | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {paths[name]}
    </svg>
  )
}

/** Shows any saved recording, photo or file by its id. */
export function Media({ id, className }: { id: ID; className?: string }) {
  const { store } = useData()
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => { store.mediaUrl(id).then(setUrl) }, [id, store])
  if (!url) return <div className={`media-loading ${className ?? ''}`} />
  const kind = mediaKind(id)
  if (kind === 'image') return <img src={url} alt="" className={`media-img ${className ?? ''}`} />
  if (kind === 'video') return <video src={url} controls playsInline className={`media-video ${className ?? ''}`} />
  if (kind === 'audio') return <audio src={url} controls className={`media-audio ${className ?? ''}`} />
  return <a href={url} target="_blank" rel="noreferrer" className="chip">Open attached file</a>
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { ref.current?.focus() }, [])
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={title} tabIndex={-1} ref={ref} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Empty({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon"><Icon name={icon} size={30} /></div>
      <h3>{title}</h3>
      {children}
    </div>
  )
}

/** A file picker dressed as a button. `capture` opens the camera directly on phones. */
export function FileButton({ label, accept, capture, icon = 'upload', onFile, className = 'btn secondary' }: {
  label: string; accept: string; capture?: boolean; icon?: string; onFile: (f: File) => void; className?: string
}) {
  return (
    <label className={className}>
      <Icon name={icon} size={20} /> {label}
      <input type="file" accept={accept} {...(capture ? { capture: 'environment' } : {})} hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />
    </label>
  )
}

export function ScreenHeader({ title, sub, onBack, action }: { title: string; sub?: string; onBack?: () => void; action?: ReactNode }) {
  return (
    <header className="screen-head">
      {onBack && <button className="icon-btn" onClick={onBack} aria-label="Back"><Icon name="back" /></button>}
      <div className="screen-title">
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {action}
    </header>
  )
}
