import { useState } from 'react'
import { driveConfigured, FOLDER_NAME } from '../lib/google'
import { Icon } from './ui'

/**
 * The agreement shown before anything is saved to Google Drive.
 * Nothing connects until the person ticks the box and taps the button themselves.
 */
export default function DriveConsent({ busy, error, progress, onConnect, onCancel, cancelLabel = 'Keep it on this device only' }: {
  busy: boolean
  error: string
  progress?: string
  onConnect: () => void
  onCancel?: () => void
  cancelLabel?: string
}) {
  const [agreed, setAgreed] = useState(false)

  return (
    <div className="consent stack">
      <div className="consent-head">
        <span className="drive-badge"><Icon name="lock" size={22} /></span>
        <div>
          <h2>Save your plan to Google Drive?</h2>
          <p className="muted">So it’s backed up and you can open it on any device.</p>
        </div>
      </div>

      <ul className="consent-list">
        <li><strong>What is saved:</strong> your stories, recordings, videos, photos, medical information, family tree and messages.</li>
        <li><strong>Where:</strong> a folder called “{FOLDER_NAME}” in <em>your own</em> Google Drive. You own it, and you can download or delete it from Drive at any time.</li>
        <li><strong>What this app can see:</strong> only the files it creates in that folder — never your other Drive files, email or contacts.</li>
        <li><strong>Who else can see it:</strong> no one, unless you share it. Your information is stored by Google under your Google account’s privacy terms.</li>
        <li><strong>You can stop anytime:</strong> tap “Disconnect Google Drive” in the app, or remove access in your Google Account under Security → Third-party connections.</li>
      </ul>

      {!driveConfigured ? (
        <p className="notice">Google Drive saving isn’t switched on for this copy of the app yet. Your plan will stay on this device for now.</p>
      ) : (
        <>
          <label className="check consent-check">
            <input id="drive-consent" type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            <span>I agree to save my information in my Google Drive as described above.</span>
          </label>
          {error && <p className="error">{error}</p>}
          {progress && <p className="muted small">{progress}</p>}
          <button className="btn" disabled={!agreed || busy} onClick={onConnect}>
            {busy ? (progress ? 'Saving to Google Drive…' : 'Connecting…') : 'Connect Google Drive'}
          </button>
        </>
      )}
      {onCancel && <button className="btn ghost" disabled={busy} onClick={onCancel}>{cancelLabel}</button>}
    </div>
  )
}
