import { useEffect, useState } from 'react'
import { DataProvider, useData } from './lib/data'
import { openDrive, resolveCloudAccess, restoreLocal, signOut, type Access } from './lib/auth'
import { cloudEnabled } from './lib/supabase'
import { connectGoogle, disconnectGoogle, setOnExpired } from './lib/google'
import { Icon } from './components/ui'
import { clearHash, readHash, type ReplyPayload } from './lib/ask'
import { ReplySheet } from './components/AskSheet'
import AskAnswer from './screens/AskAnswer'
import { extraHistory } from './lib/familyHistory'
import { clearAnswers, inboxAvailable, readInbox, type InboxAnswer } from './lib/inbox'
import Welcome from './screens/Welcome'
import Home from './screens/Home'
import Story from './screens/Story'
import Medical from './screens/Medical'
import FamilyTree from './screens/FamilyTree'
import Keepsakes from './screens/Keepsakes'
import Share from './screens/Share'

export type Tab = 'home' | 'story' | 'medical' | 'family' | 'keepsakes' | 'share'

// Links from "Ask someone who knows": #ask=… opens the answer page for a relative;
// #reply=… brings their answer back. Replies wait here until the storyteller's plan is open.
const PENDING = 'sfp-pending-reply'
const fromLink = readHash()
if (fromLink.reply) { try { localStorage.setItem(PENDING, JSON.stringify(fromLink.reply)) } catch { /* private mode */ } }
if (fromLink.ask || fromLink.reply) clearHash()

export default function App() {
  const [ask, setAsk] = useState(fromLink.ask)
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

  if (ask) return <AskAnswer ask={ask} onDone={() => setAsk(undefined)} />
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
  const { loading, loadError, session, isOwner, store, settings, data } = useData()
  const [reply, setReply] = useState<ReplyPayload | null>(() => {
    try { return JSON.parse(localStorage.getItem(PENDING) ?? 'null') } catch { return null }
  })

  useEffect(() => { window.scrollTo(0, 0) }, [tab])
  useEffect(() => {
    const take = (r: ReplyPayload) => setReply(r)
    const onHash = () => { const r = readHash().reply; if (r) { clearHash(); take(r) } }
    const onOffer = (e: Event) => take((e as CustomEvent<ReplyPayload>).detail)
    window.addEventListener('hashchange', onHash)
    window.addEventListener('sfp-reply', onOffer)
    return () => { window.removeEventListener('hashchange', onHash); window.removeEventListener('sfp-reply', onOffer) }
  }, [])
  const closeReply = () => { try { localStorage.removeItem(PENDING) } catch { /* ignore */ } setReply(null) }

  // Answers relatives sent with "Send": check the mailbox when the app opens or comes back to the front.
  const [inbox, setInbox] = useState<InboxAnswer[]>([])
  const [dismissed] = useState(() => new Set<string>())
  useEffect(() => {
    if (!inboxAvailable || loading || !isOwner || !settings.inboxId) return
    const check = () => readInbox(settings).then((all) => setInbox(all.filter((a) => !dismissed.has(a.id)))).catch(() => null)
    check()
    const onVisible = () => document.visibilityState === 'visible' && check()
    document.addEventListener('visibilitychange', onVisible)
    const timer = window.setInterval(() => document.visibilityState === 'visible' && check(), 60_000)
    return () => { document.removeEventListener('visibilitychange', onVisible); window.clearInterval(timer) }
  }, [loading, isOwner, settings.inboxId, settings.inboxKey]) // eslint-disable-line react-hooks/exhaustive-deps
  // Answers to requests that were removed are cleared from the mailbox instead of shown.
  const asked = new Set(data.asks.map((a) => a.id))
  const known = { has: (id: string) => asked.has(extraHistory(id)?.baseId ?? id) }
  const orphans = inbox.filter((a) => !known.has(a.askId))
  useEffect(() => {
    if (!orphans.length || loading) return
    clearAnswers(settings, orphans.map((a) => a.id)).catch(() => null)
    orphans.forEach((a) => dismissed.add(a.id))
    setInbox((q) => q.filter((a) => known.has(a.askId)))
  }, [orphans.map((a) => a.id).join(), loading]) // eslint-disable-line react-hooks/exhaustive-deps
  const next = inbox.find((a) => known.has(a.askId))
  const doneWith = (id: string) => { dismissed.add(id); setInbox((q) => q.filter((a) => a.id !== id)) }

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
      {reply && isOwner && !loading && <ReplySheet reply={reply} onClose={closeReply} />}
      {!reply && next && isOwner && !loading && (
        <ReplySheet key={next.id} answerId={next.id} reply={{ v: 1, id: next.askId, q: next.question, from: next.from, text: next.text }} audio={next.audio}
          onAdded={() => clearAnswers(settings, [next.id])} onClose={() => doneWith(next.id)} />
      )}
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
