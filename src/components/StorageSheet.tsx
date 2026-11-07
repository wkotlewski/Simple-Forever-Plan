import { useState } from 'react'
import { useData } from '../lib/data'
import { makeBackup, makeSpreadsheet, restoreBackup, restoreSummary, saveToApp } from '../lib/backup'
import { makePdf, planSections } from '../lib/export'
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
  const { store, data, isOwner, session, settings, save } = useData()
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  // A file that's made and waiting for one more tap to open the phone's save sheet.
  const [ready, setReady] = useState<{ file: File; what: string; backup?: boolean } | null>(null)
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
  /** Saves a finished file; if the phone wants a fresh tap first, shows the "tap to save" button instead. */
  const deliver = async (file: File, what: string, backup = false) => {
    const r = await saveToApp(file)
    if (r === 'needs-tap') { setReady({ file, what, backup }); return `${what} is ready.` }
    if (backup && r !== 'cancelled' && isOwner) await save('settings', { ...settings, lastBackupAt: Date.now() })
    return result(r, what)
  }

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
          <h3>Back up everything</h3>
          <p className="muted small">One ZIP file with every story, recording, photo, your family tree and Words to Keep, plus a PDF anyone can read. Keep it in iCloud Drive, Google Drive, Dropbox or email — then a cleared browser or a new phone never costs you anything.</p>
          <label className="check"><input id="copy-media" type="checkbox" checked={withMedia} onChange={(e) => setWithMedia(e.target.checked)} /> Include recordings, videos and photos</label>
          {session.canViewMedical && (
            <label className="check"><input id="copy-medical" type="checkbox" checked={withMedical} onChange={(e) => setWithMedical(e.target.checked)} /> Include medical information</label>
          )}
          {ready && (
            <div className="ready-save stack tight">
              <button className="btn" onClick={() => run(async () => {
                const { file, what, backup } = ready
                const r = await saveToApp(file, { afterTap: true })
                setReady(null)
                if (backup && r !== 'cancelled' && isOwner) await save('settings', { ...settings, lastBackupAt: Date.now() })
                return result(r, what)
              })}><Icon name="upload" size={18} /> {ready.what} is ready — tap to save it</button>
              <p className="muted small">Choose where to keep it: Files / iCloud Drive, Google Drive, email…</p>
            </div>
          )}
          <button className="btn" disabled={busy} onClick={() => run(async () => {
            setReady(null)
            setStatus('Making a readable PDF…')
            const name = settings.storytellerName || session.name
            const pdf = await makePdf(`The Story of ${name}`, planSections(visible, name, { medical: withMedical }))
            const file = await makeBackup(store, visible, withMedia, setStatus, pdf)
            return deliver(file, 'Your backup', true)
          })}><Icon name="upload" size={18} /> Save a full backup (ZIP)</button>
          <button className="btn secondary" disabled={busy} onClick={() => run(async () => {
            const name = settings.storytellerName || session.name
            const pdf = await makePdf(`The Story of ${name}`, planSections(visible, name, { medical: withMedical }))
            return deliver(new File([pdf], `The Story of ${name}.pdf`, { type: 'application/pdf' }), 'Your PDF')
          })}><Icon name="book" size={18} /> Save as a PDF to read or print</button>
          <button className="btn secondary" disabled={busy} onClick={() => run(async () => deliver(makeSpreadsheet(visible, withMedical), 'Your spreadsheet'))}>
            <Icon name="type" size={18} /> Save as a spreadsheet
          </button>
          <p className="muted small">The spreadsheet opens in Google Sheets, Numbers or Excel. It holds the written information; recordings stay in the full copy.</p>
        </section>

        {isOwner && (
          <section className="card inset stack">
            <h3>Restore from a copy</h3>
            <p className="muted small">Bring back a backup you saved earlier, on this phone or a new one. It adds to what’s here — nothing already in the app is removed.</p>
            <FileButton label="Choose a saved backup" accept=".zip,application/zip,application/json,.json" onFile={(f) => run(async () => {
              const r = await restoreBackup(f, store, setStatus)
              if (r.added || r.filledIn) setTimeout(() => window.location.reload(), 2500)
              return restoreSummary(r)
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
