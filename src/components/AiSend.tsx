import { useState } from 'react'
import { saveToApp } from '../lib/backup'
import { Icon } from './ui'

/**
 * Getting a file and its instructions into the person's AI app, in clear steps:
 * 1) copy the instructions, 2) send (or save) the file, 3) paste the instructions in the AI app and send.
 * Phones only keep one thing on the clipboard and drop it if the share sheet opens too fast, so the
 * instructions are copied in their own step — and shown, so they can be copied by hand too.
 */
export function AiSend({ file, prompt, what, children }: { file: File | null; prompt: string; what: string; children?: React.ReactNode }) {
  const [copied, setCopied] = useState(false)
  const [show, setShow] = useState(false)
  const [note, setNote] = useState('')

  const copy = async () => {
    try { await navigator.clipboard.writeText(prompt); setCopied(true); return true }
    catch { setShow(true); return false }
  }

  const send = async () => {
    if (!file) return
    if (!copied) await copy()
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
    if (nav.share && nav.canShare?.({ files: [file] })) {
      try { await nav.share({ files: [file] }); setNote(`Now, in your AI app: press and hold in the message box, tap Paste to add the instructions, and send.`); return }
      catch (e: any) { if (e?.name === 'AbortError') return }
    }
    await save()
  }

  const save = async () => {
    if (!file) return
    if (!copied) await copy()
    const r = await saveToApp(file, { afterTap: true })
    if (r !== 'cancelled') setNote(`Saved. In your AI app, attach the ${what}, then press and hold in the message box, tap Paste to add the instructions, and send.`)
  }

  return (
    <div className="ai-send stack">
      <div className="ai-step">
        <span className="ai-num">1</span>
        <div className="stack tight">
          <span>Copy the instructions for your AI app.</span>
          <div className="row wrap">
            <button className={`btn small ${copied ? 'secondary' : ''}`} onClick={copy}>
              <Icon name={copied ? 'check' : 'type'} size={16} /> {copied ? 'Instructions copied' : 'Copy instructions'}
            </button>
            <button className="link-btn small" onClick={() => setShow(!show)}>{show ? 'Hide them' : 'See them'}</button>
          </div>
          {show && <textarea className="ai-prompt" readOnly value={prompt} rows={8} onFocus={(e) => e.currentTarget.select()} aria-label="Instructions for your AI app" />}
        </div>
      </div>
      <div className="ai-step">
        <span className="ai-num">2</span>
        <div className="stack tight">
          <span>Send the {what} to your AI app{what === 'recording' ? ' — Gemini and ChatGPT take recordings' : ''}.</span>
          <div className="row wrap">
            <button className="btn small" disabled={!file} onClick={send}><Icon name="share" size={16} /> {file ? `Send the ${what}` : `Getting the ${what} ready…`}</button>
            {file && <button className="btn ghost small" onClick={save}>Or save it</button>}
          </div>
        </div>
      </div>
      <div className="ai-step">
        <span className="ai-num">3</span>
        <span>In your AI app, press and hold in the message box, tap <strong>Paste</strong> to add the instructions, and send.</span>
      </div>
      {note && <p className="success small" role="status">{note}</p>}
      {children && (
        <div className="ai-step">
          <span className="ai-num">4</span>
          <div className="stack tight grow">{children}</div>
        </div>
      )}
    </div>
  )
}
