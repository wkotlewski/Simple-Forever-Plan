import { useState } from 'react'
import { useData } from '../lib/data'
import { aiInstructions, makePdf, planSections, sectionsToText } from '../lib/export'
import { saveToApp } from '../lib/backup'
import { chapterById } from '../lib/questions'
import { TextField } from './TextField'
import { Icon } from './ui'

/**
 * Use any AI chat tool (ChatGPT, Claude, Gemini…) to write from your stories:
 * 1) copy everything — or save it as a PDF — with instructions to stay truthful,
 * 2) paste it into the AI, 3) paste what it wrote back here.
 */
export function AiShare({ kind, chapterId, onResult, resultLabel }: {
  kind: 'story' | 'chapter'
  chapterId?: string
  onResult: (text: string) => Promise<void> | void
  resultLabel: string
}) {
  const { data, settings, session } = useData()
  const [copied, setCopied] = useState(false)
  const [pasted, setPasted] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [readyPdf, setReadyPdf] = useState<File | null>(null)
  const name = settings.storytellerName || session.name
  const chapterTitle = chapterId ? chapterById(chapterId)?.title : undefined
  const sections = () => planSections(data, name, { medical: false, chapterId })
  const instructions = aiInstructions(kind, name, chapterTitle)
  const title = kind === 'chapter' ? `${name} — ${chapterTitle}` : `The Story of ${name}`

  async function copy() {
    const text = instructions + sectionsToText(title, sections())
    try { await navigator.clipboard.writeText(text); setCopied(true); setStatus('Copied. Open your AI app, paste it in, and send.') }
    catch { setStatus('Your phone didn’t allow copying here — use “Save as PDF” instead.') }
  }

  async function pdf() {
    setBusy(true)
    try {
      const file = new File([await makePdf(title, sections(), instructions.replace(/----\s*$/, ''))], `${title}.pdf`, { type: 'application/pdf' })
      const r = await saveToApp(file)
      if (r === 'needs-tap') setReadyPdf(file)
      else if (r !== 'cancelled') setStatus('Saved. Attach the PDF in your AI app and send it.')
    } catch (e: any) { setStatus(e?.message ?? 'Couldn’t save the PDF.') }
    setBusy(false)
  }

  return (
    <section className="card ai-share stack">
      <div className="ai-steps">
        <p className="label">Write it with your AI app</p>
        <p className="muted small">Works with ChatGPT, Claude, Gemini or any chat tool. It includes instructions to keep everything true — smoother and clearer, but nothing made up.</p>
      </div>
      <ol className="ai-list">
        <li>
          <span>Copy {kind === 'chapter' ? 'this chapter’s answers' : 'everything you’ve shared'}, or save it as a PDF.</span>
          <div className="row wrap">
            <button className="btn small" onClick={copy}><Icon name={copied ? 'check' : 'type'} size={16} /> {copied ? 'Copied' : 'Copy for AI'}</button>
            <button className="btn secondary small" disabled={busy} onClick={pdf}><Icon name="book" size={16} /> Save as PDF</button>
          </div>
        </li>
        <li><span>Paste it (or attach the PDF) in your AI app and send.</span></li>
        <li>
          <span>Copy what it wrote and paste it here.</span>
          <TextField id={`ai-result-${kind}-${chapterId ?? 'all'}`} multiline rows={5} label={resultLabel} value={pasted} onChange={setPasted} placeholder="Paste the AI’s writing here…" />
          <button className="btn small" disabled={!pasted.trim()} onClick={async () => { await onResult(pasted.trim()); setPasted(''); setStatus('Added. Read it through and fix anything that isn’t right.') }}>Use this</button>
        </li>
      </ol>
      {readyPdf && (
        <button className="btn small" onClick={async () => {
          const r = await saveToApp(readyPdf, { afterTap: true }); setReadyPdf(null)
          if (r !== 'cancelled') setStatus('Saved. Attach the PDF in your AI app and send it.')
        }}><Icon name="upload" size={16} /> PDF is ready — tap to save it</button>
      )}
      {status && <p className="muted small" role="status">{status}</p>}
    </section>
  )
}
