import { useEffect, useState } from 'react'
import { DataProvider, useData } from './lib/data'
import { openDrive, resolveCloudAccess, restoreLocal, signOut, type Access } from './lib/auth'
import { cloudEnabled } from './lib/supabase'
import { connectGoogle, disconnectGoogle, setOnExpired } from './lib/google'
import { Icon } from './components/ui'
import Welcome from './screens/Welcome'
import Home from './screens/Home'
import Story from './screens/Story'
import Medical from './screens/Medical'
import FamilyTree from './screens/FamilyTree'
import Keepsakes from './screens/Keepsakes'
import Share from './screens/Share'

export type Tab = 'home' | 'story' | 'medical' | 'family' | 'keepsakes' | 'share'

export default function App() {
  const [access, setAccess] = useState<Access | null>(() => restoreLocal())
  const [checking, setChecking] = useState(cloudEnabled)

  useEffect(() => {
    if (!cloudEnabled) return
    resolveCloudAccess().then(setAccess).catch(() => null).finally(() => setChecking(false))
  }, [])

  const leave = async () => {
    if (access?.session.storage === 'drive') await disconnectGoogle()
    await signOut()
    setAccess(null)
  }

  if (checking) return <div className="splash"><Icon name="heart" size={40} /></div>
  if (!access) return <Welcome onAccess={setAccess} />
  // The plan lives in Google Drive: reconnect (a tap is needed for Google's window) before showing it.
  if (access.session.storage === 'drive' && access.store.mode !== 'drive') {
    return <DriveGate name={access.session.name} onOpen={async () => setAccess(await openDrive(access.session))} onLeave={leave} />
  }

  return (
    <DataProvider key={access.store.mode} access={access}>
      <Shell onSignOut={leave} onSwitch={setAccess} />
    </DataProvider>
  )
}

function DriveGate({ name, onOpen, onLeave }: { name: string; onOpen: () => Promise<void>; onLeave: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return (
    <div className="welcome">
      <div className="welcome-hero">
        <div className="logo"><Icon name="heart" size={30} /></div>
        <h1>Welcome back, {name.split(' ')[0]}</h1>
        <p>Your plan is saved in your Google Drive.</p>
      </div>
      <div className="card stack">
        {error && <p className="error">{error}</p>}
        <button className="btn" disabled={busy} onClick={async () => {
          setBusy(true); setError('')
          try { await connectGoogle(); await onOpen() } catch (e: any) { setError(e?.message ?? 'Could not open Google Drive.') }
          setBusy(false)
        }}>{busy ? 'Opening…' : 'Open my plan from Google Drive'}</button>
        <button className="btn ghost" onClick={onLeave}>Use a different account</button>
      </div>
    </div>
  )
}

function ReconnectBar() {
  const [needed, setNeeded] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => { setOnExpired(() => setNeeded(true)); return () => setOnExpired(null) }, [])
  if (!needed) return null
  return (
    <div className="reconnect" role="status">
      <span>Google Drive needs you to reconnect to keep saving.</span>
      <button className="btn small" disabled={busy} onClick={async () => {
        setBusy(true)
        try { await connectGoogle(); setNeeded(false) } catch { /* stays visible */ }
        setBusy(false)
      }}>Reconnect</button>
    </div>
  )
}

function Shell({ onSignOut, onSwitch }: { onSignOut: () => void; onSwitch: (a: Access) => void }) {
  const [tab, setTab] = useState<Tab>('home')
  const { loading, loadError, session, isOwner, store } = useData()

  useEffect(() => { window.scrollTo(0, 0) }, [tab])

  const tabs: { id: Tab; label: string; icon: string; hidden?: boolean }[] = [
    { id: 'home', label: 'Home', icon: 'home' },
    { id: 'story', label: 'Story', icon: 'book' },
    { id: 'medical', label: 'Medical', icon: 'pill', hidden: !session.canViewMedical },
    { id: 'family', label: 'Family', icon: 'tree' },
    { id: 'keepsakes', label: 'Keepsakes', icon: 'quote' },
  ]

  return (
    <div className="app">
      {store.mode === 'drive' && <ReconnectBar />}
      <main className="main">
        {loading ? <div className="splash"><Icon name="heart" size={40} /></div>
          : loadError ? <div className="card error-card"><p>{loadError}</p><button className="btn" onClick={onSignOut}>Sign in again</button></div>
          : (
            <>
              {tab === 'home' && <Home go={setTab} onSignOut={onSignOut} onSwitch={onSwitch} />}
              {tab === 'story' && <Story />}
              {tab === 'medical' && <Medical />}
              {tab === 'family' && <FamilyTree />}
              {tab === 'keepsakes' && <Keepsakes />}
              {tab === 'share' && isOwner && <Share onBack={() => setTab('home')} />}
            </>
          )}
      </main>
      <nav className="tabbar" aria-label="Sections">
        {tabs.filter((t) => !t.hidden).map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)} aria-current={tab === t.id}>
            <Icon name={t.icon} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
