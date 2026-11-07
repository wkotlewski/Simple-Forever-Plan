import { useState } from 'react'
import { useData } from '../lib/data'
import type { Access } from '../lib/auth'
import StorageSheet from '../components/StorageSheet'
import { RequestsSheet } from '../components/AskSheet'
import { CHAPTERS, isFollowUp } from '../lib/questions'
import { Icon } from '../components/ui'
import type { Tab } from '../App'

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

const DAY = 86_400_000

const TOTAL = CHAPTERS.reduce((n, c) => n + c.questions.length, 0)

export default function Home({ go, onSignOut, onSwitch }: { go: (t: Tab) => void; onSignOut: () => void; onSwitch: (a: Access) => void }) {
  const { data, session, isOwner, settings, store, save } = useData()
  const [storage, setStorage] = useState(false)
  const [requests, setRequests] = useState(false)
  // Weekly reminder to save a backup, once there's something worth keeping.
  const somethingSaved = data.answers.length + data.people.length + data.medical.length + data.messages.length > 0
  const needsBackup = isOwner && store.mode !== 'cloud' && somethingSaved
    && (!settings.lastBackupAt || Date.now() - settings.lastBackupAt > 7 * DAY)
    && (!settings.backupSnoozedUntil || Date.now() > settings.backupSnoozedUntil)
  const main = data.answers.filter((a) => !isFollowUp(a.questionId))
  const answered = main.filter((a) => !a.skipped && (a.text || a.mediaIds.length)).length
  const touched = main.length
  const pct = Math.round((touched / TOTAL) * 100)
  const first = (isOwner ? session.name : settings.storytellerName).split(' ')[0]

  const areas: { tab: Tab; icon: string; title: string; text: string; count: string; hidden?: boolean }[] = [
    { tab: 'story', icon: 'book', title: isOwner ? 'My Story' : `${first || 'Their'}'s Story`, text: 'Chapters of a life, in their own voice.', count: plural(data.stories.filter((s) => isOwner || s.approved).length, 'chapter') },
    { tab: 'medical', icon: 'pill', title: 'Medical Binder', text: 'Medications, doctors, allergies and wishes.', count: plural(data.medical.length, 'item'), hidden: !session.canViewMedical },
    { tab: 'family', icon: 'tree', title: 'Family Tree', text: 'Who is who, with photos and notes.', count: data.people.length === 1 ? '1 person' : `${data.people.length} people` },
    { tab: 'keepsakes', icon: 'quote', title: 'Words to Keep', text: 'Scripture, quotes and messages for life’s moments.', count: plural(data.messages.length, 'message') },
  ]

  return (
    <div className="screen">
      <header className="home-head">
        <div>
          <p className="eyebrow">{isOwner ? 'Welcome back' : `${first ? `${first}'s` : 'A'} Forever Plan`}</p>
          <h1>{isOwner ? `Hello, ${first}` : `Hello, ${session.name.split(' ')[0]}`}</h1>
        </div>
        {isOwner && <button className="icon-btn ring" onClick={() => go('share')} aria-label="Share with family"><Icon name="share" /></button>}
      </header>

      {isOwner ? (
        <section className="card hero-card">
          <div className="progress-ring" style={{ ['--p' as any]: `${pct}%` }}><span>{pct}%</span></div>
          <div>
            <h2>{answered ? 'Keep going — your family will treasure this.' : 'Let’s start with a few easy questions.'}</h2>
            <p className="muted">{answered} of {TOTAL} questions answered. Skip anything you like.</p>
            <button className="btn" onClick={() => go('story')}><Icon name="mic" size={20} /> {answered ? 'Continue my story' : 'Start my story'}</button>
          </div>
        </section>
      ) : (
        <section className="card hero-card family">
          <Icon name="heart" size={34} />
          <div>
            <h2>{first ? `${first} left these for you.` : 'These were left for you.'}</h2>
            <p className="muted">Stories, recordings, the family tree and words for when you need them most.</p>
          </div>
        </section>
      )}

      <section className="area-grid">
        {areas.filter((a) => !a.hidden).map((a) => (
          <button key={a.tab} className="area" onClick={() => go(a.tab)}>
            <span className="area-icon"><Icon name={a.icon} /></span>
            <strong>{a.title}</strong>
            <small>{a.text}</small>
            <span className="area-count">{a.count}</span>
          </button>
        ))}
      </section>

      {isOwner && (
        <section className="card share-card" onClick={() => go('share')} role="button">
          <Icon name="share" />
          <div>
            <strong>Share with family</strong>
            <p className="muted">{data.members.length ? `${data.members.length} family member${data.members.length > 1 ? 's' : ''} invited.` : 'Send a private code by email or text so loved ones can open your plan.'}</p>
          </div>
        </section>
      )}

      {isOwner && data.asks.length > 0 && (() => {
        const waiting = new Set(data.asks.filter((x) => !x.answeredAt).map((x) => x.surveyId ?? x.id)).size
        const total = new Set(data.asks.map((x) => x.surveyId ?? x.id)).size
        return (
          <section className="card share-card" onClick={() => setRequests(true)} role="button">
            <Icon name="share" />
            <div>
              <strong>Requests sent to family</strong>
              <p className="muted">{total} sent{waiting ? ` · ${waiting} waiting for an answer` : ''}. See them or remove any.</p>
            </div>
          </section>
        )
      })()}

      {needsBackup && (
        <section className="card backup-reminder" role="status">
          <Icon name="upload" />
          <div>
            <strong>{settings.lastBackupAt ? `Last backup ${Math.floor((Date.now() - settings.lastBackupAt) / DAY)} days ago` : 'Back up your stories'}</strong>
            <p className="muted small">Save everything to iCloud, Google Drive or email so nothing is lost if this browser is cleared or you get a new phone.</p>
            <div className="row wrap">
              <button className="btn small" onClick={() => setStorage(true)}>Back up now</button>
              <button className="btn ghost small" onClick={() => save('settings', { ...settings, backupSnoozedUntil: Date.now() + 3 * DAY })}>Remind me later</button>
            </div>
          </div>
        </section>
      )}

      <button className="card save-card" onClick={() => setStorage(true)}>
        <Icon name="upload" />
        <span>
          <strong>{store.mode === 'drive' ? 'Saved in your Google Drive' : store.mode === 'cloud' ? 'Saved securely in the cloud' : 'Saved on this phone'}</strong>
          <small className="muted">{settings.lastBackupAt ? `Last backup: ${new Date(settings.lastBackupAt).toLocaleDateString()}. ` : ''}Back up, save a PDF, or restore</small>
        </span>
      </button>

      <footer className="home-foot">
        <span />
        <button className="link-btn" onClick={onSignOut}>Sign out</button>
      </footer>

      {requests && <RequestsSheet onClose={() => setRequests(false)} />}
      {storage && <StorageSheet onClose={() => setStorage(false)} onSwitch={onSwitch} onDisconnect={onSignOut} />}
    </div>
  )
}
