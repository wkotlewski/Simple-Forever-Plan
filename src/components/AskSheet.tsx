import { useState } from 'react'
import { useData } from '../lib/data'
import { askMessage, findReply, shareMessage, smsLink, type ReplyPayload } from '../lib/ask'
import { uid } from '../lib/store'
import type { Ask } from '../lib/types'
import { Icon, Sheet } from './ui'

/** Text one question to a relative who might remember more about it. */
export function AskSheet({ chapterId, questionId, question, onClose }: { chapterId: string; questionId: string; question: string; onClose: () => void }) {
  const { save, settings, session } = useData()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [note, setNote] = useState('')
  const [mine, setMine] = useState(settings.phone ?? '')
  const [sent, setSent] = useState<Ask | null>(null)
  const [copied, setCopied] = useState(false)

  const ready = name.trim() && phone.replace(/\D/g, '').length >= 7
  const ask: Ask = { id: sent?.id ?? uid(), chapterId, questionId, question, toName: name.trim(), toPhone: phone.trim(), note: note.trim() || undefined, sentAt: Date.now() }
  const message = askMessage({ v: 1, id: ask.id, q: question, from: settings.storytellerName || session.name, to: ask.toName, note: ask.note, reply: mine.trim() || undefined })

  async function record() {
    if (sent) return
    await save('asks', ask)
    if (mine.trim() !== (settings.phone ?? '')) await save('settings', { ...settings, phone: mine.trim() || undefined })
    setSent(ask)
  }

  return (
    <Sheet title="Ask someone who knows" onClose={onClose}>
      <div className="stack">
        <p className="ask-preview">“{question}”</p>
        {!sent ? (
          <>
            <p className="muted small">They’ll get a text with a link. They can type or talk their answer, and it comes back to you with their name on it.</p>
            <label className="field"><span>Who should you ask?</span>
              <input id="ask-to-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Aunt Maria" />
            </label>
            <label className="field"><span>Their mobile number</span>
              <input id="ask-to-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" autoComplete="off" />
            </label>
            <label className="field"><span>Add a note (optional)</span>
              <input id="ask-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="You were there that summer — what do you remember?" />
            </label>
            <label className="field"><span>Your mobile number, so they can text you back</span>
              <input id="ask-my-phone" type="tel" value={mine} onChange={(e) => setMine(e.target.value)} placeholder="Your number" autoComplete="tel" />
            </label>
            <a className={`btn big ${ready ? '' : 'disabled'}`} aria-disabled={!ready} href={ready ? smsLink(phone, message) : undefined}
              onClick={(e) => { if (!ready) { e.preventDefault(); return } record() }}>
              <Icon name="share" size={20} /> Text {name.trim() || 'them'} the question
            </a>
            <button className="btn ghost" disabled={!ready} onClick={async () => { await record(); await shareMessage(message) }}>Send another way (WhatsApp, email…)</button>
          </>
        ) : (
          <>
            <p className="success"><Icon name="check" size={16} /> Question saved. If your messages app didn’t open, send it another way below.</p>
            <div className="row wrap">
              <a className="btn secondary small" href={smsLink(phone, message)}>Open Messages again</a>
              <button className="btn ghost small" onClick={() => shareMessage(message)}>Share…</button>
              <button className="btn ghost small" onClick={async () => { try { await navigator.clipboard.writeText(message); setCopied(true) } catch { /* not allowed */ } }}>{copied ? 'Copied' : 'Copy message'}</button>
            </div>
            <p className="muted small">When {name.trim()} answers, tap the link in their text and it’s added here automatically.</p>
            <button className="btn" onClick={onClose}>Done</button>
          </>
        )}
      </div>
    </Sheet>
  )
}

/** Shows a relative's answer and adds it to the story — with their voice recording if they sent one. */
export function ReplySheet({ reply, onClose }: { reply: ReplyPayload; onClose: () => void }) {
  const { data, save, store } = useData()
  const ask = data.asks.find((a) => a.id === reply.id)
  const [audio, setAudio] = useState<File | null>(null)
  const [text, setText] = useState(reply.text)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const already = data.answers.some((a) => a.contributions?.some((c) => c.id === reply.id))
  const first = reply.from.split(' ')[0]

  async function add() {
    setBusy(true)
    const chapterId = ask?.chapterId ?? 'roots'
    const questionId = ask?.questionId ?? `asked-${reply.id}`
    const existing = data.answers.find((a) => a.questionId === questionId)
    const mediaIds = audio ? [await store.putMedia(audio)] : []
    const contribution = { id: reply.id, from: reply.from, text: text.trim(), mediaIds, addedAt: Date.now() }
    await save('answers', {
      id: existing?.id ?? uid(), chapterId, questionId, question: ask?.question ?? reply.q,
      text: existing?.text ?? '', mediaIds: existing?.mediaIds ?? [], createdAt: existing?.createdAt ?? Date.now(),
      contributions: [...(existing?.contributions ?? []).filter((c) => c.id !== reply.id), contribution],
    })
    if (ask) await save('asks', { ...ask, answeredAt: Date.now() })
    setBusy(false)
    setDone(true)
  }

  return (
    <Sheet title={`${first} answered your question`} onClose={onClose}>
      {done ? (
        <div className="stack center-text">
          <Icon name="heart" size={32} />
          <p>{first}’s memory is now part of your story. It will be included when you write that chapter.</p>
          <button className="btn" onClick={onClose}>Done</button>
        </div>
      ) : (
        <div className="stack">
          <p className="ask-preview">“{ask?.question ?? reply.q}”</p>
          {already && <p className="notice">You already added this answer. Adding it again will replace it.</p>}
          <label className="field"><span>{reply.from} said</span>
            <textarea id="reply-text" rows={6} value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          {reply.audio && (
            <div className="card inset stack">
              <p className="small">{first} also sent a voice recording in the text. To keep their voice, save it from Messages to your Files, then add it here.</p>
              <label className="btn secondary">
                <Icon name="mic" size={18} /> {audio ? `Added: ${audio.name}` : 'Add their voice recording'}
                <input type="file" accept="audio/*,video/*" hidden onChange={(e) => setAudio(e.target.files?.[0] ?? null)} />
              </label>
            </div>
          )}
          <button className="btn big" disabled={busy || !text.trim()} onClick={add}>{busy ? 'Adding…' : 'Add to my story'}</button>
          <button className="btn ghost" onClick={onClose}>Not now</button>
        </div>
      )}
    </Sheet>
  )
}

/** For when a reply link opened somewhere else: paste the whole text message here instead. */
export function PasteReply({ onReply }: { onReply: (r: ReplyPayload) => void }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  if (!open) return <button className="link-btn" onClick={() => setOpen(true)}>Got an answer by text? Paste it here</button>
  return (
    <div className="card inset stack">
      <label className="field"><span>Paste the whole message you received</span>
        <textarea id="paste-reply" rows={4} value={text} onChange={(e) => { setText(e.target.value); setError('') }} />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button className="btn small" onClick={() => {
          const r = findReply(text)
          if (r) { onReply(r); setOpen(false); setText('') } else setError('That message doesn’t include an answer link. Paste the full message, including the link at the end.')
        }}>Add answer</button>
        <button className="btn ghost small" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  )
}
