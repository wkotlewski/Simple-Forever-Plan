import { useEffect, useState } from 'react'
import { useData } from '../lib/data'
import { docPrompt, parseDocSummary, type DocRef } from '../lib/docSummary'
import { saveToApp } from '../lib/backup'
import type { DocSummary } from '../lib/types'
import { Icon, Media, Sheet } from './ui'
import { TextField } from './TextField'

/** A document's summary, with what's worth a closer look and what looks good set apart. */
export function DocSummaryView({ s, medical }: { s: DocSummary; medical: boolean }) {
  return (
    <div className="doc-summary stack tight">
      <p className="label"><Icon name="sparkle" size={14} /> What this document says</p>
      {s.summary && <p>{s.summary}</p>}
      {s.details.length > 0 && <List title="Key details" items={s.details} />}
      {medical ? (
        <>
          <List title="Worth a closer look" items={s.concerns.length ? s.concerns : ['Nothing stood out.']} tone={s.concerns.length ? 'watch' : 'calm'} />
          {s.good.length > 0 && <List title="Looks good" items={s.good} tone="good" />}
          {s.questions.length > 0 && <List title="Questions for the doctor" items={s.questions} />}
        </>
      ) : s.concerns.length > 0 && <List title="Highlights" items={s.concerns} />}
      {medical && <p className="muted small">Written from the document by your AI app to help you prepare — always check with the doctor.</p>}
    </div>
  )
}

function List({ title, items, tone }: { title: string; items: string[]; tone?: 'watch' | 'good' | 'calm' }) {
  return (
    <div className={`doc-list ${tone ?? ''}`}>
      <strong>{tone === 'watch' ? '⚠︎ ' : tone === 'good' ? '✓ ' : ''}{title}</strong>
      <ul>{items.map((t, i) => <li key={i}>{t}</li>)}</ul>
    </div>
  )
}

/** Summaries for the documents attached to one item, and a button for any that don't have one yet. */
export function ItemDocs({ docs, onSummarize, subtle }: { docs: DocRef[]; onSummarize: (d: DocRef[]) => void; subtle?: boolean }) {
  if (!docs.length) return null
  const missing = docs.filter((d) => !d.summary)
  return (
    <div className="item-docs stack tight" onClick={(e) => e.stopPropagation()}>
      {docs.filter((d) => d.summary).map((d) => <DocSummaryView key={d.mediaId} s={d.summary!} medical={d.medical} />)}
      {missing.length > 0 && (
        <button className={subtle ? 'link-btn small' : 'btn secondary small'} onClick={() => onSummarize(missing)}>
          <Icon name="sparkle" size={14} /> {subtle ? `Is this a document or letter? Summarize it` : `Summarize ${missing.length > 1 ? `these ${missing.length} documents` : 'this document'}`}
        </button>
      )}
    </div>
  )
}

/**
 * Goes through documents one at a time: send the document and instructions to your own AI app (ChatGPT, Claude,
 * Gemini…), then paste its answer back. The summary is saved with the document.
 */
export function SummarizeSheet({ docs, onClose }: { docs: DocRef[]; onClose: () => void }) {
  const { data, save, store } = useData()
  const [i, setI] = useState(0)
  const [file, setFile] = useState<File | null>(null)
  const [pasted, setPasted] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(0)
  const doc = docs[i]
  const prompt = doc ? docPrompt(doc) : ''

  // Get the file ready before the tap — phones only open the share sheet right after a tap.
  useEffect(() => {
    if (!doc) return
    let live = true
    setFile(null); setPasted(''); setNote(''); setError('')
    ;(async () => {
      const url = await store.mediaUrl(doc.mediaId)
      if (!url) return
      const blob = await (await fetch(url)).blob()
      const ext = (blob.type.split('/')[1] ?? 'jpg').split(';')[0].replace('jpeg', 'jpg')
      const name = `${doc.label.replace(/[\\/:*?"<>|]/g, '').slice(0, 60) || 'Document'}.${ext}`
      if (live) setFile(new File([blob], name, { type: blob.type }))
    })()
    return () => { live = false }
  }, [doc, store])

  if (!doc) {
    return (
      <Sheet title="Document summaries" onClose={onClose}>
        <div className="stack center-text">
          <Icon name="check" size={30} />
          <p>{saved ? `${saved} summar${saved === 1 ? 'y' : 'ies'} saved. You’ll find each one under its document.` : 'Nothing was saved this time.'}</p>
          <button className="btn" onClick={onClose}>Done</button>
        </div>
      </Sheet>
    )
  }

  async function send() {
    setError('')
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
    // Copy the instructions too, in case the AI app only takes the file.
    navigator.clipboard?.writeText(prompt).catch(() => null)
    if (file && nav.share && nav.canShare?.({ files: [file], text: prompt })) {
      try { await nav.share({ files: [file], text: prompt }); setNote('Sent. If the instructions didn’t come through, paste them in your AI app — they’re copied.'); return }
      catch (e: any) { if (e?.name === 'AbortError') return }
    }
    if (file) {
      const r = await saveToApp(file, { afterTap: true })
      if (r !== 'cancelled') setNote('The document is saved and the instructions are copied. Open your AI app, attach the document, paste, and send.')
    } else setError('Couldn’t open this document.')
  }

  async function keep() {
    const s = parseDocSummary(pasted, doc.mediaId)
    if (!s) { setError('Paste your AI app’s answer first.'); return }
    if (doc.owner === 'medical') {
      const item = data.medical.find((m) => m.id === doc.itemId)
      if (item) await save('medical', { ...item, docSummaries: [...(item.docSummaries ?? []).filter((x) => x.mediaId !== doc.mediaId), s] })
    } else {
      const item = data.answers.find((a) => a.id === doc.itemId)
      if (item) await save('answers', { ...item, docSummaries: [...(item.docSummaries ?? []).filter((x) => x.mediaId !== doc.mediaId), s] })
    }
    setSaved((n) => n + 1)
    setI(i + 1)
  }

  const preview = pasted.trim() ? parseDocSummary(pasted, doc.mediaId) : null

  return (
    <Sheet title={docs.length > 1 ? `Summarize documents · ${i + 1} of ${docs.length}` : 'Summarize this document'} onClose={onClose}>
      <div className="stack">
        <div className="doc-head">
          <div className="doc-thumb"><Media id={doc.mediaId} /></div>
          <div><p className="label">{doc.medical ? 'Medical binder' : 'Your story'}</p><strong>{doc.label}</strong></div>
        </div>

        <ol className="ai-list">
          <li>
            <span>Send this document to your AI app (ChatGPT, Claude, Gemini…) with instructions to {doc.medical ? 'explain it simply and point out what’s worth a closer look and what looks good' : 'summarize it'}.</span>
            <div className="row wrap">
              <button className="btn small" disabled={!file} onClick={send}><Icon name="share" size={16} /> Send to my AI app</button>
              <button className="btn ghost small" onClick={() => navigator.clipboard?.writeText(prompt).then(() => setNote('Instructions copied.')).catch(() => null)}>Copy instructions</button>
            </div>
            {note && <p className="muted small">{note}</p>}
          </li>
          <li>
            <span>Copy its answer and paste it here.</span>
            <TextField id="doc-summary-paste" multiline rows={6} label="Your AI app’s answer" value={pasted} onChange={setPasted} placeholder="Paste the answer here" />
          </li>
        </ol>

        {preview && <DocSummaryView s={preview} medical={doc.medical} />}
        {error && <p className="error">{error}</p>}
        <div className="row wrap">
          <button className="btn" disabled={!pasted.trim()} onClick={keep}>Save summary{docs.length > i + 1 ? ' and go to the next' : ''}</button>
          <button className="btn ghost" onClick={() => setI(i + 1)}>{docs.length > i + 1 ? 'Skip for now' : 'Not now'}</button>
        </div>
        <p className="muted small">Your document goes only to the AI app you choose. The summary is saved with the document here on your phone and included in backups.</p>
      </div>
    </Sheet>
  )
}
