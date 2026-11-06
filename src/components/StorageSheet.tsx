import { useState } from 'react'
import { useData } from '../lib/data'
import { makeBackup, makeSpreadsheet, restoreBackup, saveToApp } from '../lib/backup'
import { driveConfigured } from '../lib/google'
import { connectAndOpenDrive } from '../lib/openDrive'
import type { Access } from '../lib/auth'
import DriveConsent from './DriveConsent'
import { FileButton, Icon, Sheet } from './ui'

/** Where the plan is kept, and ways to save a copy to any app on the phone. */
export default function StorageSheet({ onClose, onSwitch, onDisconnect }: {
  onClose: () => void
  onSwitch: (a: Access) => void
  onDisconnect: () => void
}) {
  const { store, data, isOwner, session } = useData()
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [withMedia, setWithMedia] = useState(true)
  const [withMedical, setWithMedical] = useState(session.canViewMedical)
  const [showDrive, setShowDrive] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)

  const shared = isOwner ? data : { ...data, members: [] }
  const visible = withMedical ? shared : { ...shared, medical: [] }

  const run = async (fn: () => Promise<string>) => {
    setBusy(true); setError(''); setStatus('')
    try { setStatus(await fn()) } catch (e: any) { setError(e?.message ?? 'Something went wrong. Please try again.') }
    setBusy(false)
  }
  const result = (r: string, what: string) =>
    r === 'shared' ? `${what} saved.` : r === 'downloaded' ? `${what} downloaded to this device.` : ''

  if (showDrive) {
    return (
      <Sheet title="Google Drive" onClose={onClose}>
        <DriveConsent busy={busy} error={error} progress={status} cancelLabel="Not now" onCancel={() => setShowDrive(false)}
          onConnect={() => run(async () => { onSwitch(await connectAndOpenDrive(session.name, setStatus)); onClose(); return '' })} />
      </Sheet>
    )
  }

  return (
    <Sheet title="Where your plan is saved" onClose={onClose}>
      <div className="stack">
        <div className="where">
          <Icon name={store.mode === 'drive' ? 'lock' : 'home'} />
          <div>
            <strong>{store.mode === 'drive' ? 'In your Google Drive' : store.mode === 'cloud' ? 'In the cloud' : 'On this phone'}</strong>
            <p className="muted small">
              {store.mode === 'drive' ? 'In a folder called “Simple Forever Plan”. You can see and download it in the Google Drive app.'
                : store.mode === 'cloud' ? 'Saved securely and shared with the family you invite.'
                : 'Saved privately in this phone’s browser. Save a copy now and then so nothing is lost if the phone is.'}
            </p>
          </div>
        </div>

        <section className="card inset stack">
          <h3>Save a copy</h3>
          <p className="muted small">You choose where it goes: Files, iCloud Drive, Google Drive, Dropbox, email, or any app that keeps files.</p>
          <label className="check"><input id="copy-media" type="checkbox" checked={withMedia} onChange={(e) => setWithMedia(e.target.checked)} /> Include recordings, videos and photos</label>
          {session.canViewMedical && (
            <label className="check"><input id="copy-medical" type="checkbox" checked={withMedical} onChange={(e) => setWithMedical(e.target.checked)} /> Include medical information</label>
          )}
          <button className="btn" disabled={busy} onClick={() => run(async () => {
            const file = await makeBackup(store, visible, withMedia, setStatus)
            return result(await saveToApp(file), 'Copy')
          })}><Icon name="upload" size={18} /> Save a full copy</button>
          <button className="btn secondary" disabled={busy} onClick={() => run(async () => result(await saveToApp(makeSpreadsheet(visible, withMedical)), 'Spreadsheet'))}>
            <Icon name="type" size={18} /> Save as a spreadsheet
          </button>
          <p className="muted small">The spreadsheet opens in Google Sheets, Numbers or Excel. It holds the written information; recordings stay in the full copy.</p>
        </section>

        {isOwner && (
          <section className="card inset stack">
            <h3>Restore from a copy</h3>
            <p className="muted small">Bring back a full copy you saved earlier, on this phone or a new one.</p>
            <FileButton label="Choose a saved copy" accept="application/json,.json" onFile={(f) => run(async () => {
              const n = await restoreBackup(f, store, setStatus)
              setTimeout(() => window.location.reload(), 900)
              return `Restored ${n} items.`
            })} />
          </section>
        )}

        {isOwner && store.mode === 'local' && driveConfigured && (
          <button className="btn ghost" disabled={busy} onClick={() => { setError(''); setStatus(''); setShowDrive(true) }}>Keep it in Google Drive instead</button>
        )}
        {isOwner && store.mode === 'drive' && (
          confirmLeave ? (
            <div className="card inset stack">
              <p>Disconnect Google Drive on this phone? Your plan stays in your Drive, and you can open it again anytime.</p>
              <div className="row wrap">
                <button className="btn danger" onClick={onDisconnect}>Disconnect</button>
                <button className="btn ghost" onClick={() => setConfirmLeave(false)}>Cancel</button>
              </div>
            </div>
          ) : <button className="btn ghost" onClick={() => setConfirmLeave(true)}>Disconnect Google Drive</button>
        )}

        {status && <p className="success" role="status"><Icon name="check" size={16} /> {status}</p>}
        {error && <p className="error">{error}</p>}
      </div>
    </Sheet>
  )
}
