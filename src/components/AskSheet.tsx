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
/** The phone's contact picker (Android Chrome and some others); not every phone offers it. */
const contactsSupported = typeof navigator !== 'undefined' && 'contacts' in navigator && 'select' in ((navigator as any).contacts ?? {})
async function pickContacts(): Promise<{ name: string; phone: string }[]> {
  const picked = await (navigator as any).contacts.select(['name', 'tel'], { multiple: true })
  return (picked ?? []).flatMap((c: any) => (c.tel?.[0] ? [{ name: c.name?.[0] ?? '', phone: c.tel[0] }] : []))
}

interface Recipient { name: string; phone: string }
const digits = (p: string) => p.replace(/\D/g, '')

/**
 * Text one question to one or more relatives. The question comes drafted for whatever you're looking at,
 * with other ready-made questions to pick from. Each person gets their own link, so every answer comes back
 * with their name on it.
 */
export function AskSheet({ chapterId, questionId, target, question, suggestions, onClose }: {
  chapterId?: string; questionId?: string; target?: Ask['target']; question: string; suggestions?: (string | Draft)[]; onClose: () => void
}) {
  const { data, save, settings, session } = useData()
  const [q, setQ] = useState(question)
  const [people, setPeople] = useState<Recipient[]>([{ name: '', phone: '' }])
  const [note, setNote] = useState('')
  const [mine, setMine] = useState(settings.phone ?? '')
  const [sent, setSent] = useState<{ ask: Ask; message: string; texted: boolean }[] | null>(null)
  const [box, setBox] = useState(settings.inboxId)
  const [preparing, setPreparing] = useState(inboxAvailable && !settings.inboxId)
  const [showMessage, setShowMessage] = useState(false)
  const [contactError, setContactError] = useState('')

  // People you've asked before, so they're one tap away.
  const recent = useMemo(() => {
    const seen = new Map<string, Recipient>()
    for (const a of [...data.asks].sort((x, y) => y.sentAt - x.sentAt)) {
      const key = digits(a.toPhone)
      if (key && !seen.has(key)) seen.set(key, { name: a.toName, phone: a.toPhone })
    }
    return [...seen.values()].slice(0, 8)
  }, [data.asks])

  useEffect(() => {
    if (!preparing) return
    ensureInbox(settings).then(async (next) => {
      if (next && next.inboxId !== settings.inboxId) { await save('settings', next); setBox(next.inboxId) }
    }).finally(() => setPreparing(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const drafts: Draft[] = (suggestions ?? []).map((d) => (typeof d === 'string' ? { text: d } : d))
  const options = [...new Set([question, ...drafts.map((d) => d.text)])]
  const field = drafts.find((d) => d.text === q)?.field
  const askTarget: Ask['target'] = target?.kind === 'person' ? { kind: 'person', personId: target.personId, ...(field ? { field } : {}) } : target
  const filled = people.filter((p) => p.name.trim() && digits(p.phone).length >= 7)
  const ready = q.trim() && filled.length > 0 && !preparing
  const from = settings.storytellerName || session.name

  const addPeople = (list: Recipient[]) => setPeople((cur) => {
    const keep = cur.filter((p) => p.name.trim() || p.phone.trim())
    const have = new Set(keep.map((p) => digits(p.phone)))
    const merged = [...keep, ...list.filter((p) => !have.has(digits(p.phone)))]
    return merged.length ? merged : [{ name: '', phone: '' }]
  })
  const setPerson = (i: number, patch: Partial<Recipient>) => setPeople((cur) => cur.map((p, j) => (j === i ? { ...p, ...patch } : p)))
  const isChosen = (r: Recipient) => people.some((p) => digits(p.phone) === digits(r.phone))

  function makeOne(r: Recipient) {
    const ask: Ask = { id: uid(), chapterId, questionId, target: askTarget, question: q.trim(), toName: r.name.trim(), toPhone: r.phone.trim(), note: note.trim() || undefined, sentAt: Date.now() }
    return { ask, message: askMessage({ v: 1, id: ask.id, q: ask.question, from, to: ask.toName, note: ask.note, reply: mine.trim() || undefined, box }), texted: false }
  }

  async function prepare() {
    const list = filled.map(makeOne)
    for (const it of list) await save('asks', it.ask)
    if (mine.trim() !== (settings.phone ?? '')) await save('settings', { ...settings, inboxId: box ?? settings.inboxId, phone: mine.trim() || undefined })
    setSent(list)
    return list
  }

  const previewMsg = askMessage({ v: 1, id: 'preview', q: q.trim(), from, to: filled[0]?.name.trim() || 'there', note: note.trim() || undefined, reply: mine.trim() || undefined, box })

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
              <span className="field-title">Who should you ask? <small className="muted">You can pick more than one.</small></span>
              <div className="row wrap">
                {contactsSupported && (
                  <button type="button" className="btn secondary small" onClick={async () => {
                    setContactError('')
                    try { addPeople(await pickContacts()) } catch { setContactError('Couldn’t open your contacts. You can type names and numbers instead.') }
                  }}><Icon name="plus" size={16} /> Choose from my contacts</button>
                )}
              </div>
              {contactError && <p className="error">{contactError}</p>}
              {recent.length > 0 && (
                <div className="chips">{recent.map((r) => (
                  <button key={r.phone} type="button" className={`chip ${isChosen(r) ? 'on' : ''}`}
                    onClick={() => (isChosen(r) ? setPeople((cur) => { const n = cur.filter((p) => digits(p.phone) !== digits(r.phone)); return n.length ? n : [{ name: '', phone: '' }] }) : addPeople([r]))}>
                    {isChosen(r) && <Icon name="check" size={14} />} {r.name}
                  </button>
                ))}</div>
              )}
            </div>
            {people.map((p, i) => (
              <div key={i} className="recipient">
                <TextField id={`ask-to-name-${i}`} label={i === 0 ? 'Their name' : 'Name'} value={p.name} onChange={(v) => setPerson(i, { name: v })} placeholder="e.g. Mom" />
                <TextField id={`ask-to-phone-${i}`} label="Mobile number" type="tel" value={p.phone} onChange={(v) => setPerson(i, { phone: v })} placeholder="(555) 123-4567" />
                {people.length > 1 && <button type="button" className="icon-btn" aria-label={`Remove ${p.name || 'this person'}`} onClick={() => setPeople((cur) => cur.filter((_, j) => j !== i))}>✕</button>}
              </div>
            ))}
            <button type="button" className="link-btn" onClick={() => setPeople((cur) => [...cur, { name: '', phone: '' }])}>+ Ask someone else too</button>

            <div className="field">
              <span className="field-title">Add a note (optional)</span>
              <div className="chips">{NOTES.map((n) => (
                <button key={n} type="button" className={`chip ${note === n ? 'on' : ''}`} onClick={() => setNote(note === n ? '' : n)}>{n}</button>
              ))}</div>
            </div>
            <TextField id="ask-note" label="Or write your own" value={note} onChange={setNote} />

            {!settings.phone && !box && (
              <TextField id="ask-my-phone" label="Your mobile number, so they can text you back" type="tel" value={mine} onChange={setMine} placeholder="Your number" />
            )}

            <button type="button" className="link-btn" onClick={() => setShowMessage(!showMessage)}>{showMessage ? 'Hide the message' : 'See the message they’ll get'}</button>
            {showMessage && <p className="message-preview">{previewMsg}</p>}

            {filled.length <= 1 ? (
              <a className={`btn big ${ready ? '' : 'disabled'}`} aria-disabled={!ready} href={ready ? smsLink(filled[0].phone, makeOne(filled[0]).message) : undefined}
                onClick={async (e) => {
                  if (!ready) { e.preventDefault(); return }
                  // Save first, then open Messages with this person's own link.
                  e.preventDefault()
                  const [one] = await prepare()
                  setSent([{ ...one, texted: true }])
                  window.location.href = smsLink(one.ask.toPhone, one.message)
                }}>
                <Icon name="share" size={20} /> Text {filled[0]?.name.trim() || 'them'} the question
              </a>
            ) : (
              <button className="btn big" disabled={!ready} onClick={prepare}><Icon name="share" size={20} /> Get texts ready for {filled.length} people</button>
            )}
            <p className="muted small">Each person gets their own link. They can type or talk their answer{box ? ', tap Submit, and it shows up here' : ', and it comes back to you'} with their name on it.</p>
          </>
        ) : (
          <>
            <p className="ask-preview">“{q.trim()}”</p>
            {sent.length > 1 && <p className="muted small">Tap each person to open Messages with their own text.</p>}
            <div className="stack">
              {sent.map((it, i) => (
                <div key={it.ask.id} className="send-row">
                  <span>{it.texted ? <Icon name="check" size={16} /> : null} <strong>{it.ask.toName}</strong> <small className="muted">{it.ask.toPhone}</small></span>
                  <div className="row wrap">
                    <a className={`btn small ${it.texted ? 'ghost' : ''}`} href={smsLink(it.ask.toPhone, it.message)}
                      onClick={() => setSent((cur) => cur!.map((x, j) => (j === i ? { ...x, texted: true } : x)))}>{it.texted ? 'Text again' : `Text ${it.ask.toName.split(' ')[0]}`}</a>
                    <button className="btn ghost small" onClick={() => shareMessage(it.message)}>Share…</button>
                  </div>
                </div>
              ))}
            </div>
            <p className="muted small">{box ? 'When they answer, it shows up the next time you open the app.' : 'When they answer, tap the link in their text and it’s added here automatically.'}</p>
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
