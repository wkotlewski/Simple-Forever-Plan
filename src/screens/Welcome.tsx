import { useState } from 'react'
import {
  enterLocalFamilyCode, isEmail, resolveCloudAccess, sendCode, startLocalOwner, verifyCode, type Access,
} from '../lib/auth'
import { cloudEnabled } from '../lib/supabase'
import { driveConfigured } from '../lib/google'
import { connectAndOpenDrive } from '../lib/openDrive'
import { FileButton, Icon } from '../components/ui'
import { localStore } from '../lib/store'
import { restoreBackup, restoreSummary } from '../lib/backup'
import DriveConsent from '../components/DriveConsent'

type Path = null | 'owner' | 'family' | 'drive' | 'restore'

export default function Welcome({ onAccess }: { onAccess: (a: Access) => void }) {
  const [path, setPath] = useState<Path>(null)

  return (
    <div className="welcome">
      <div className="welcome-hero">
        <div className="logo"><Icon name="heart" size={30} /></div>
        <h1>Simple Forever Plan</h1>
        <p>Your life, in your own words, kept safe for the people you love.</p>
      </div>

      {!path && (
        <div className="welcome-choices">
          <button className="choice" onClick={() => setPath('owner')}>
            <Icon name="mic" size={28} />
            <span><strong>I'm telling my story</strong><small>Record memories, medical notes, your family tree and words to keep.</small></span>
          </button>
          <button className="choice" onClick={() => setPath('family')}>
            <Icon name="lock" size={28} />
            <span><strong>I'm family — I have a code</strong><small>Open the stories and notes someone shared with you.</small></span>
          </button>
          <button className="link-btn center" onClick={() => setPath('restore')}>New phone, or lost your plan? Bring back a saved backup</button>
          {driveConfigured && !cloudEnabled && (
            <button className="link-btn center" onClick={() => setPath('drive')}>Already saved your plan to Google Drive? Open it here</button>
          )}
        </div>
      )}

      {path && (
        <div className="card welcome-form">
          <button className="link-btn" onClick={() => setPath(null)}><Icon name="back" size={18} /> Back</button>
          {path === 'drive' ? <DriveStep onAccess={onAccess} />
            : path === 'restore' ? <RestoreStep onAccess={onAccess} />
            : cloudEnabled ? <CloudSignIn path={path} onAccess={onAccess} /> : <LocalSignIn path={path} onAccess={onAccess} />}
        </div>
      )}

      <p className="welcome-foot">
        {cloudEnabled
          ? 'Your plan is private. Only family you invite can open it, and only after entering a code sent to them.'
          : driveConfigured
            ? 'Nothing is saved to Google Drive unless you agree to it. Otherwise everything stays privately on this device.'
            : 'Everything is saved privately on this device.'}
      </p>
    </div>
  )
}

/** Starts on this phone from a saved backup ZIP — everything comes back: stories, recordings, tree, medical, keepsakes. */
function RestoreStep({ onAccess }: { onAccess: (a: Access) => void }) {
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState<{ text: string; name: string } | null>(null)
  if (done) {
    return (
      <div className="stack">
        <h2>Welcome back{done.name ? `, ${done.name.split(' ')[0]}` : ''}</h2>
        <p className="success" role="status"><Icon name="check" size={16} /> {done.text}</p>
        <button className="btn" onClick={() => onAccess(startLocalOwner(done.name || 'Me'))}>Open my plan</button>
      </div>
    )
  }
  return (
    <div className="stack">
      <h2>Bring back your plan</h2>
      <p className="muted">Choose the backup you saved — the ZIP named “Simple Forever Plan backup…”. Look in Files, iCloud Drive, Google Drive, Downloads or your email.</p>
      <FileButton className="btn" label={busy ? 'Bringing it back…' : 'Choose my backup file'} accept=".zip,application/zip,application/json,.json"
        onFile={async (f) => {
          setBusy(true); setError('')
          try {
            const r = await restoreBackup(f, localStore, setProgress)
            setDone({ text: restoreSummary(r).replace(' on this phone was removed', ' was lost'), name: r.name ?? '' })
          } catch (e: any) { setError(e?.message ?? 'Couldn’t open that file.') }
          setBusy(false); setProgress('')
        }} />
      {progress && <p className="muted small" role="status">{progress}</p>}
      {error && <p className="error">{error}</p>}
      <p className="muted small">Your backup stays private — it’s opened right here on this phone.</p>
    </div>
  )
}

/** Asks for agreement, then connects Google Drive. `name` is set for someone just starting. */
function DriveStep({ name, onAccess, onSkip }: { name?: string; onAccess: (a: Access) => void; onSkip?: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState('')
  return (
    <DriveConsent busy={busy} error={error} progress={progress} onCancel={onSkip} cancelLabel="Go back"
      onConnect={async () => {
        setBusy(true); setError('')
        try { onAccess(await connectAndOpenDrive(name, setProgress)) } catch (e: any) { setError(e?.message ?? 'Could not connect Google Drive.'); setProgress('') }
        setBusy(false)
      }} />
  )
}

/** Where should the plan be saved? The phone is the default; Google Drive only after agreeing. */
function StorageChoice({ name, onAccess }: { name: string; onAccess: (a: Access) => void }) {
  const [drive, setDrive] = useState(false)
  if (drive) return <DriveStep name={name} onAccess={onAccess} onSkip={() => setDrive(false)} />
  return (
    <div className="stack">
      <h2>Where should your plan be saved?</h2>
      <button className="choice" onClick={() => onAccess(startLocalOwner(name))}>
        <Icon name="home" size={28} />
        <span><strong>On this phone</strong><small>Private to this phone. Nothing is sent anywhere. You can save a copy to Files, iCloud, Google Drive, Dropbox or a spreadsheet whenever you like.</small></span>
      </button>
      {driveConfigured && (
        <button className="choice" onClick={() => setDrive(true)}>
          <Icon name="lock" size={28} />
          <span><strong>In my Google Drive</strong><small>Backed up automatically and opens on any device. You’ll be asked to agree first.</small></span>
        </button>
      )}
    </div>
  )
}

function LocalSignIn({ path, onAccess }: { path: Exclude<Path, null>; onAccess: (a: Access) => void }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [named, setNamed] = useState(false)

  if (path === 'owner' && named) {
    return <StorageChoice name={value.trim()} onAccess={onAccess} />
  }
  if (path === 'owner') {
    return (
      <form onSubmit={(e) => { e.preventDefault(); if (value.trim()) setNamed(true) }}>
        <label className="field"><span>What should we call you?</span>
          <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder="Your name" autoComplete="name" />
        </label>
        <button className="btn" disabled={!value.trim()}>Begin</button>
      </form>
    )
  }
  return (
    <form onSubmit={async (e) => {
      e.preventDefault()
      const a = await enterLocalFamilyCode(value)
      if (a) onAccess(a)
      else setError('That code did not match. Check the message you were sent and try again.')
    }}>
      <label className="field"><span>Enter the code you were sent</span>
        <input autoFocus className="code-input" value={value} onChange={(e) => { setValue(e.target.value.toUpperCase()); setError('') }} placeholder="ABCD-2345" autoCapitalize="characters" />
      </label>
      {error && <p className="error">{error}</p>}
      <button className="btn" disabled={value.replace(/\W/g, '').length < 8}>Open</button>
    </form>
  )
}

function CloudSignIn({ path, onAccess }: { path: 'owner' | 'family'; onAccess: (a: Access) => void }) {
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'contact' | 'code'>('contact')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError('')
    try { await fn() } catch (e: any) { setError(e?.message ?? 'Something went wrong. Please try again.') }
    setBusy(false)
  }

  if (step === 'contact') {
    return (
      <form onSubmit={(e) => { e.preventDefault(); run(async () => { await sendCode(contact); setStep('code') }) }}>
        {path === 'owner' && (
          <label className="field"><span>Your name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
          </label>
        )}
        <label className="field"><span>{path === 'family' ? 'The email or phone number your invite was sent to' : 'Your email or mobile number'}</span>
          <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="name@email.com or (555) 123-4567" autoComplete="email" required />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn" disabled={busy}>{busy ? 'Sending…' : `Send my code by ${isEmail(contact) || !contact ? 'email' : 'text'}`}</button>
      </form>
    )
  }

  return (
    <form onSubmit={(e) => {
      e.preventDefault()
      run(async () => {
        await verifyCode(contact, code)
        const a = await resolveCloudAccess(path === 'owner' ? { createIfMissing: name.trim() } : {})
        if (!a) throw new Error('We could not find a plan shared with this email or phone. Ask the person who invited you to check it.')
        onAccess(a)
      })
    }}>
      <p className="muted">We sent a 6-digit code to <strong>{contact}</strong>.</p>
      <label className="field"><span>Enter your code</span>
        <input autoFocus className="code-input" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" />
      </label>
      {error && <p className="error">{error}</p>}
      <button className="btn" disabled={busy || code.replace(/\D/g, '').length < 6}>{busy ? 'Checking…' : 'Open'}</button>
      <button type="button" className="link-btn" onClick={() => run(() => sendCode(contact))}>Send a new code</button>
    </form>
  )
}
