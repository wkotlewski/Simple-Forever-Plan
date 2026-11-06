import { useState } from 'react'
import {
  enterLocalFamilyCode, isEmail, resolveCloudAccess, sendCode, startLocalOwner, verifyCode, type Access,
} from '../lib/auth'
import { cloudEnabled } from '../lib/supabase'
import { Icon } from '../components/ui'

type Path = null | 'owner' | 'family'

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
        </div>
      )}

      {path && (
        <div className="card welcome-form">
          <button className="link-btn" onClick={() => setPath(null)}><Icon name="back" size={18} /> Back</button>
          {cloudEnabled ? <CloudSignIn path={path} onAccess={onAccess} /> : <LocalSignIn path={path} onAccess={onAccess} />}
        </div>
      )}

      <p className="welcome-foot">
        {cloudEnabled
          ? 'Your plan is private. Only family you invite can open it, and only after entering a code sent to them.'
          : 'This-device mode: everything is saved privately in this browser. Connect a backend to share with family on their own phones.'}
      </p>
    </div>
  )
}

function LocalSignIn({ path, onAccess }: { path: Exclude<Path, null>; onAccess: (a: Access) => void }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')

  if (path === 'owner') {
    return (
      <form onSubmit={(e) => { e.preventDefault(); if (value.trim()) onAccess(startLocalOwner(value.trim())) }}>
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

function CloudSignIn({ path, onAccess }: { path: Exclude<Path, null>; onAccess: (a: Access) => void }) {
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
