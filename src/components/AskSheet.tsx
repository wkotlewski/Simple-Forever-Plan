import { useEffect, useMemo, useState } from 'react'
import { ensureInbox, inboxAvailable } from '../lib/inbox'
import { useData } from '../lib/data'
import { askMessage, findReply, shareMessage, smsLink, type ReplyPayload } from '../lib/ask'
import { uid } from '../lib/store'
import type { Ask, Contribution } from '../lib/types'
import type { Draft } from '../lib/drafts'
import { Icon, Media, Sheet } from './ui'
import { TextField } from './TextField'

/** Text one question to a relative who might remember more about it. */
const NOTES = ['Just want to make sure I have this right.', 'No rush — whenever you have a minute.', 'You were there, so I thought of you.', 'Even a little bit helps.']

/**
 * Text one question to a relative. The question comes drafted for whatever you're looking at, with other
 * ready-made questions to pick from; everything can be changed before sending.
 */
export function AskSheet({ chapterId, questionId, target, question, suggestions, onClose }: {
  chapterId?: string; questionId?: string; target?: Ask['target']; question: string; suggestions?: (string | Draft)[]; onClose: () => void
}) {
  const { data, save, settings, session } = useData()
  const [q, setQ] = useState(question)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [note, setNote] = useState('')
  const [mine, setMine] = useState(settings.phone ?? '')
  const [sent, setSent] = useState<Ask | null>(null)
  const [copied, setCopied] = useState(false)
  const [box, setBox] = useState(settings.inboxId)
  const [preparing, setPreparing] = useState(inboxAvailable && !settings.inboxId)
  const [showMessage, setShowMessage] = useState(false)

  // People you've asked before, so they're one tap away.
  const recent = useMemo(() => {
    const seen = new Map<string, { name: string; phone: string }>()
    for (const a of [...data.asks].sort((x, y) => y.sentAt - x.sentAt)) {
      const key = a.toPhone.replace(/\D/g, '')
      if (key && !seen.has(key)) seen.set(key, { name: a.toName, phone: a.toPhone })
    }
    return [...seen.values()].slice(0, 6)
  }, [data.asks])

  // Set up the answer mailbox the first time, so relatives can just tap Send.
  useEffect(() => {
    if (!preparing) return
    ensureInbox(settings).then(async (next) => {
      if (next && next.inboxId !== settings.inboxId) { await save('settings', next); setBox(next.inboxId) }
    }).finally(() => setPreparing(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const drafts: Draft[] = (suggestions ?? []).map((d) => (typeof d === 'string' ? { text: d } : d))
  const options = [...new Set([question, ...drafts.map((d) => d.text)])]
  // If the chosen question is about a birthday or date of passing, the answer can fill that in on the tree.
  const field = drafts.find((d) => d.text === q)?.field
  const askTarget: Ask['target'] = target?.kind === 'person' ? { kind: 'person', personId: target.personId, ...(field ? { field } : {}) } : target
  const ready = q.trim() && name.trim() && phone.replace(/\D/g, '').length >= 7 && !preparing
  const ask: Ask = { id: sent?.id ?? uid(), chapterId, questionId, target: askTarget, question: q.trim(), toName: name.trim(), toPhone: phone.trim(), note: note.trim() || undefined, sentAt: Date.now() }
  const message = askMessage({ v: 1, id: ask.id, q: q.trim(), from: settings.storytellerName || session.name, to: ask.toName || 'there', note: ask.note, reply: mine.trim() || undefined, box })

  async function record() {
    if (sent) return
    await save('asks', ask)
    if (mine.trim() !== (settings.phone ?? '')) await save('settings', { ...settings, inboxId: box ?? settings.inboxId, phone: mine.trim() || undefined })
    setSent(ask)
  }

  return (
    <Sheet title="Ask family" onClose={onClose}>
      <div className="stack">
        {!sent ? (
          <>
            <div className="field">
              <span className="field-title">What do you want to ask?</span>
              {options.length > 1 && (
                <div className="draft-options">
                  {options.map((o) => (
                    <button key={o} type="button" className={`draft-option ${q === o ? 'on' : ''}`} onClick={() => setQ(o)}>{o}</button>
                  ))}
                </div>
              )}
            </div>
            <TextField id="ask-question" multiline rows={2} label={options.length > 1 ? 'Your question (change it however you like)' : 'Your question'} value={q} onChange={setQ} />

            <div className="field">
              <span className="field-title">Who should you ask?</span>
              {recent.length > 0 && (
                <div className="chips">{recent.map((r) => (
                  <button key={r.phone} type="button" className={`chip ${phone === r.phone ? 'on' : ''}`} onClick={() => { setName(r.name); setPhone(r.phone) }}>{r.name}</button>
                ))}</div>
              )}
            </div>
            <div className="grid2">
              <TextField id="ask-to-name" label="Their name" value={name} onChange={setName} placeholder="e.g. Mom" />
              <TextField id="ask-to-phone" label="Mobile number" type="tel" value={phone} onChange={setPhone} placeholder="(555) 123-4567" />
            </div>

            <div className="field">
              <span className="field-title">Add a note (optional)</span>
              <div className="chips">{NOTES.map((n) => (
                <button key={n} type="button" className={`chip ${note === n ? 'on' : ''}`} onClick={() => setNote(note === n ? '' : n)}>{n}</button>
              ))}</div>
            </div>
            <TextField id="ask-note" label="Or write your own" value={note} onChange={setNote} />

            {!settings.phone && (
              <TextField id="ask-my-phone" label="Your mobile number, so they can text you back" type="tel" value={mine} onChange={setMine} placeholder="Your number" />
            )}

            <button type="button" className="link-btn" onClick={() => setShowMessage(!showMessage)}>{showMessage ? 'Hide the message' : 'See the message they’ll get'}</button>
            {showMessage && <p className="message-preview">{message}</p>}

            <a className={`btn big ${ready ? '' : 'disabled'}`} aria-disabled={!ready} href={ready ? smsLink(phone, message) : undefined}
              onClick={(e) => { if (!ready) { e.preventDefault(); return } record() }}>
              <Icon name="share" size={20} /> Text {name.trim() || 'them'} the question
            </a>
            <button className="btn ghost" disabled={!ready} onClick={async () => { await record(); await shareMessage(message) }}>Send another way (WhatsApp, email…)</button>
            <p className="muted small">They can type or talk their answer{box ? ', tap Send, and it shows up here' : ', and it comes back to you'} with their name on it.</p>
          </>
        ) : (
          <>
            <p className="ask-preview">“{ask.question}”</p>
            <p className="success"><Icon name="check" size={16} /> Question saved. If your messages app didn’t open, send it another way below.</p>
            <div className="row wrap">
              <a className="btn secondary small" href={smsLink(phone, message)}>Open Messages again</a>
              <button className="btn ghost small" onClick={() => shareMessage(message)}>Share…</button>
              <button className="btn ghost small" onClick={async () => { try { await navigator.clipboard.writeText(message); setCopied(true) } catch { /* not allowed */ } }}>{copied ? 'Copied' : 'Copy message'}</button>
            </div>
            <p className="muted small">{box ? `When ${name.trim()} sends an answer, it shows up the next time you open the app.` : `When ${name.trim()} answers, tap the link in their text and it’s added here automatically.`}</p>
            <button className="btn" onClick={onClose}>Done</button>
          </>
        )}
      </div>
    </Sheet>
  )
}

/** Shows a relative's answer and adds it to the story — with their voice recording if they sent one. */
export function ReplySheet({ reply, audio: sentAudio, onAdded, onClose }: { reply: ReplyPayload; audio?: File; onAdded?: () => void; onClose: () => void }) {
  const { data, save, store } = useData()
  const ask = data.asks.find((a) => a.id === reply.id)
  const [audio, setAudio] = useState<File | null>(sentAudio ?? null)
  const sentUrl = useMemo(() => (sentAudio ? URL.createObjectURL(sentAudio) : ''), [sentAudio])
  const [text, setText] = useState(reply.text)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const fillPerson = ask?.target?.kind === 'person' && ask.target.field ? data.people.find((p) => p.id === (ask.target as any).personId) : undefined
  const fillField = ask?.target?.kind === 'person' ? ask.target.field : undefined
  const [fill, setFill] = useState(reply.text.trim().slice(0, 60))
  const [useFill, setUseFill] = useState(true)
  const already = [...data.answers, ...data.medical, ...data.people].some((a) => a.contributions?.some((c) => c.id === reply.id))
  const first = reply.from.split(' ')[0]

  async function add() {
    setBusy(true)
    const target = ask?.target
    const scope = target?.kind === 'medical' ? 'medical' : undefined
    const mediaIds = audio ? [await store.putMedia(audio, scope)] : []
    const contribution = { id: reply.id, from: reply.from, text: text.trim(), mediaIds, addedAt: Date.now() }
    const merge = (list?: Contribution[]) => [...(list ?? []).filter((c) => c.id !== reply.id), contribution]

    if (target?.kind === 'medical') {
      // Goes onto the medical item it was about (created if it doesn't exist yet, e.g. a family-history question).
      const item = data.medical.find((m) => m.id === target.itemId) ?? data.medical.find((m) => m.category === target.category && m.title === target.title)
      await save('medical', item
        ? { ...item, contributions: merge(item.contributions) }
        : { id: target.itemId ?? uid(), category: target.category, title: target.title, details: '', mediaIds: [], createdAt: Date.now(), contributions: [contribution] })
    } else if (target?.kind === 'person') {
      const person = data.people.find((p) => p.id === target.personId)
      if (person) {
        const filled = target.field && useFill && fill.trim() ? { [target.field]: fill.trim() } : {}
        await save('people', { ...person, ...filled, contributions: merge(person.contributions) })
      }
    } else {
      const chapterId = ask?.chapterId ?? 'roots'
      const questionId = ask?.questionId ?? `asked-${reply.id}`
      const existing = data.answers.find((a) => a.questionId === questionId)
      await save('answers', {
        id: existing?.id ?? uid(), chapterId, questionId, question: ask?.question ?? reply.q,
        text: existing?.text ?? '', mediaIds: existing?.mediaIds ?? [], createdAt: existing?.createdAt ?? Date.now(),
        contributions: merge(existing?.contributions),
      })
    }
    if (ask) await save('asks', { ...ask, answeredAt: Date.now() })
    onAdded?.()
    setBusy(false)
    setDone(true)
  }

  return (
    <Sheet title={`${reply.from} answered your question`} onClose={onClose}>
      {done ? (
        <div className="stack center-text">
          <Icon name="heart" size={32} />
          <p>{ask?.target?.kind === 'medical'
            ? `${first}’s answer is saved in your Medical Binder${ask.target.category === 'family' ? ' under Family Health History' : ''}.`
            : ask?.target?.kind === 'person'
              ? `${first}’s memories are saved with ${data.people.find((p) => p.id === (ask.target as any).personId)?.name ?? 'that person'} on your family tree.`
              : `${first}’s memory is now part of your story. It will be included when you write that chapter.`}</p>
          <button className="btn" onClick={onClose}>Done</button>
        </div>
      ) : (
        <div className="stack">
          <p className="ask-preview">“{ask?.question ?? reply.q}”</p>
          {already && <p className="notice">You already added this answer. Adding it again will replace it.</p>}
          <label className="field"><span>{reply.from} said</span>
            <textarea id="reply-text" rows={6} value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          {sentUrl && <audio src={sentUrl} controls className="media-audio" />}
          {fillPerson && fillField && (
            <div className="card inset stack">
              <label className="check"><input id="reply-fill" type="checkbox" checked={useFill} onChange={(e) => setUseFill(e.target.checked)} /> Also put this on the family tree</label>
              {useFill && <TextField id="reply-fill-value" label={`${fillPerson.name.split(' ')[0]}’s ${fillField === 'born' ? 'birthday' : 'date of passing'}`} value={fill} onChange={setFill}
                hint={<p className="muted small">Shorten it to just the date, like “March 3, 1940”.{(fillField === 'born' ? fillPerson.born : fillPerson.died) ? ` It currently says ${fillField === 'born' ? fillPerson.born : fillPerson.died}.` : ''}</p>} />}
            </div>
          )}
          {reply.audio && !sentAudio && (
            <div className="card inset stack">
              <p className="small">{first} also sent a voice recording in the text. To keep their voice, save it from Messages to your Files, then add it here.</p>
              <label className="btn secondary">
                <Icon name="mic" size={18} /> {audio ? `Added: ${audio.name}` : 'Add their voice recording'}
                <input type="file" accept="audio/*,video/*" hidden onChange={(e) => setAudio(e.target.files?.[0] ?? null)} />
              </label>
            </div>
          )}
          <button className="btn big" disabled={busy || (!text.trim() && !audio)} onClick={add}>{busy ? 'Adding…' : 'Add to my story'}</button>
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

/** What relatives shared when asked, shown with their name (and voice, if they sent a recording). */
export function Contributions({ items, label = 'remembers' }: { items?: Contribution[]; label?: string }) {
  if (!items?.length) return null
  return (
    <div className="family-answers">
      {items.map((c) => (
        <div key={c.id} className="contribution" onClick={(e) => e.stopPropagation()}>
          <p className="label">{c.from} {label}</p>
          {c.text && <p className="answer-text">{c.text}</p>}
          {c.mediaIds.map((m) => <Media key={m} id={m} />)}
        </div>
      ))}
    </div>
  )
}

/** Questions sent to relatives that haven't been answered yet. */
export function Waiting({ asks }: { asks: Ask[] }) {
  if (!asks.length) return null
  return <>{asks.map((a) => <p key={a.id} className="waiting"><span className="pulse-dot" /> Asked {a.toName} · waiting for an answer</p>)}</>
}
