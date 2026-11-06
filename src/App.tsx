import { useEffect, useState } from 'react'
import { DataProvider, useData } from './lib/data'
import { resolveCloudAccess, restoreLocal, signOut, type Access } from './lib/auth'
import { cloudEnabled } from './lib/supabase'
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

  if (checking) return <div className="splash"><Icon name="heart" size={40} /></div>
  if (!access) return <Welcome onAccess={setAccess} />

  return (
    <DataProvider access={access}>
      <Shell onSignOut={async () => { await signOut(); setAccess(null) }} />
    </DataProvider>
  )
}

function Shell({ onSignOut }: { onSignOut: () => void }) {
  const [tab, setTab] = useState<Tab>('home')
  const { loading, loadError, session, isOwner } = useData()

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
      <main className="main">
        {loading ? <div className="splash"><Icon name="heart" size={40} /></div>
          : loadError ? <div className="card error-card"><p>{loadError}</p><button className="btn" onClick={onSignOut}>Sign in again</button></div>
          : (
            <>
              {tab === 'home' && <Home go={setTab} onSignOut={onSignOut} />}
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
