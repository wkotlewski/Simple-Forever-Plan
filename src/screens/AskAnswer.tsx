import { useEffect, useRef, useState } from 'react'
import { replyMessage, smsLink, shareMessage, type AskPayload } from '../lib/ask'
import { canRecord, canTranscribe, clock, useRecorder } from '../lib/recorder'
import { inboxAvailable, sendAnswer } from '../lib/inbox'
import { Icon } from '../components/ui'
import { TextField } from '../components/TextField'
import { FAMILY_HISTORY } from '../lib/familyHistory'

/**
 * What a relative sees after tapping the link in their text: one question, a way to answer by
 * typing or talking, and a button to text the answer back. No sign-up, nothing saved on their phone.
 */
/** The app's name and logo at the top, so the page is clearly from Simple Forever Plan. */
function AskBrand() {
  return (
    <header className="ask-brand">
      <span className="logo small"><Icon name="heart" size={20} /></span>
      <span><strong>Simple Forever Plan</strong><small>Family stories, kept forever</small></span>
    </header>
  )
}

function AskFooter({ from }: { from: string }) {
  return (
    <footer className="ask-foot">
      <p><strong>What is this?</strong> Simple Forever Plan is an app for keeping a family’s stories, health history and family tree together in one private place, so they can be passed down.</p>
      <p>Your answer goes only to {from.split(' ')[0]}. No account or download needed.</p>
    </footer>
  )
}

export default function AskAnswer({ ask, onDone }: { ask: AskPayload; onDone: () => void }) {
  const qs = ask.qs ?? ask.hq?.map((i) => FAMILY_HISTORY[i]?.question).filter(Boolean)
  if (qs?.length) return <SurveyAnswer ask={{ ...ask, qs }} onDone={onDone} />
  return <OneQuestion ask={ask} onDone={onDone} />
}

/**
 * A survey: several questions on one page. Each can be typed or said (microphone in every box) or left blank.
 * Tap Send once and every answer goes into the storyteller's app, each in the right place.
 */
function SurveyAnswer({ ask, onDone }: { ask: AskPayload; onDone: () => void }) {
  const qs = ask.qs!
  const [name, setName] = useState(ask.to === 'everyone' ? '' : ask.to)
  const [answers, setAnswers] = useState<string[]>(() => qs.map(() => ''))
  const [step, setStep] = useState<'answer' | 'sent'>('answer')
  const [sending, setSending] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const from = ask.from.split(' ')[0]
  const canSend = inboxAvailable && Boolean(ask.box)
  const count = answers.filter((a) => a.trim()).length
  const summary = [`My answers for ${from}’s ${ask.q.toLowerCase()}:`, ...qs.flatMap((q, i) => (answers[i].trim() ? [`${q}\n${answers[i].trim()}`] : [])), `— ${name.trim()}`].join('\n\n')

  async function send() {
    setError('')
    let done = 0
    try {
      for (let i = 0; i < qs.length; i++) {
        if (!answers[i].trim()) continue
        setSending(`Sending ${++done} of ${count}…`)
        await sendAnswer(ask.box!, `${ask.id}-${i}`, qs[i], name.trim(), answers[i].trim())
        // Clear what's been sent, so trying again after a dropped connection doesn't send it twice.
        setAnswers((cur) => cur.map((a, j) => (j === i ? '' : a)))
      }
      setStep('sent')
    } catch (e: any) { setError(`${e?.message ?? 'Couldn’t send.'} What’s left is still here — tap Send to try again.`) }
    setSending('')
  }

  return (
    <div className="welcome ask-page">
      <AskBrand />
      <div className="welcome-hero">
        <p className="eyebrow">{ask.from} is asking for your help</p>
        <h1 className="ask-question">{ask.q}</h1>
        <p className="ask-note">{qs.length} quick questions. Answer what you know and skip the rest — even one answer helps.</p>
        {ask.note && <p className="ask-note">{ask.note}</p>}
      </div>

      {step === 'answer' && (
        <div className="card stack">
          {qs.map((q, i) => (
            <div key={i} className="survey-q">
              <TextField id={`survey-${i}`} multiline rows={2} label={`${i + 1}. ${q}`} value={answers[i]}
                onChange={(v) => setAnswers((cur) => cur.map((a, j) => (j === i ? v : a)))}
                placeholder="Type, or tap the microphone and talk. Leave blank to skip." />
            </div>
          ))}
          <label className="field"><span>Your name</span>
            <input id="ask-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </label>
          {error && <p className="error">{error}</p>}
          {canSend ? (
            <button className="btn big" disabled={!!sending || !count || !name.trim()} onClick={send}>
              <Icon name="share" size={20} /> {sending || (count ? `Finish and send ${count} answer${count === 1 ? '' : 's'} to ${from}` : 'Answer at least one question')}
            </button>
          ) : (
            <a className={`btn big ${count && name.trim() ? '' : 'disabled'}`} href={count && name.trim() ? smsLink(ask.reply ?? '', summary) : undefined}
              onClick={() => count && name.trim() && setTimeout(() => setStep('sent'), 800)}>
              <Icon name="share" size={20} /> Text my answers to {from}
            </a>
          )}
          {count > 0 && name.trim() && (
            <button className="link-btn" onClick={async () => { try { await navigator.clipboard.writeText(summary); setCopied(true) } catch { /* ignore */ } }}>
              {copied ? 'Copied — paste it into a message' : 'Or copy my answers'}
            </button>
          )}
        </div>
      )}

      {step === 'sent' && (
        <div className="card stack center-text">
          <Icon name="heart" size={34} />
          <h2>Thank you, {name.trim()}.</h2>
          <p className="muted">{canSend ? `Your answers are on their way to ${from}, with your name on them.` : `Once ${from} gets your message, your answers become part of the family record.`}</p>
          {canSend && <button className="btn secondary" onClick={() => setStep('answer')}>Remembered more? Add to your answers</button>}
          {canSend && <p className="muted small">You can open this same link again any time to send more.</p>}
          <button className="link-btn" onClick={onDone}>Start a story of my own</button>
        </div>
      )}
      <AskFooter from={ask.from} />
    </div>
  )
}

function OneQuestion({ ask, onDone }: { ask: AskPayload; onDone: () => void }) {
  // A question pasted into a family thread goes to “everyone” — each person types their own name.
  const [name, setName] = useState(ask.to === 'everyone' ? '' : ask.to)
  const [text, setText] = useState('')
  const [audio, setAudio] = useState<File | null>(null)
  const [audioUrl, setAudioUrl] = useState('')
  const [step, setStep] = useState<'answer' | 'send' | 'sent'>('answer')
  const [copied, setCopied] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const canSend = inboxAvailable && Boolean(ask.box)
  // For family health history: the other questions, so they can keep going in one visit.
  const others = ask.more === 'health' && canSend ? FAMILY_HISTORY.map((f, i) => ({ ...f, i })).filter((f) => f.question !== ask.q) : []
  const [showMore, setShowMore] = useState(false)
  const [extra, setExtra] = useState<Record<number, string>>({})
  const [sentMain, setSentMain] = useState(false)
  const extraCount = Object.values(extra).filter((v) => v.trim()).length
  const hasMain = !!(text.trim() || audio)
  const rec = useRecorder()
  const from = ask.from.split(' ')[0]

  useEffect(() => { if (rec.state === 'recording') setText(rec.liveText) }, [rec.liveText, rec.state])
  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl) }, [audioUrl])

  async function stop() {
    const out = await rec.stop()
    if (!out) return
    const ext = (out.blob.type.split('/')[1] ?? 'webm').split(';')[0]
    const file = new File([out.blob], `${name || 'Answer'} - voice answer.${ext}`, { type: out.blob.type })
    setAudio(file)
    setAudioUrl(URL.createObjectURL(file))
    if (out.transcript) setText(out.transcript)
  }

  const message = replyMessage({ v: 1, id: ask.id, q: ask.q, from: name.trim() || ask.to, text: text.trim(), audio: Boolean(audio) })
  const textRef = useRef<HTMLTextAreaElement>(null)

  return (
    <div className="welcome ask-page">
      <AskBrand />
      <div className="welcome-hero">
        <p className="eyebrow">{ask.from} is asking for your help</p>
        <h1 className="ask-question">“{ask.q}”</h1>
        {ask.note && <p className="ask-note">{ask.note}</p>}
      </div>

      {step === 'answer' && (
        <div className="card stack">
          <p className="muted">Share whatever you remember — a few words or a long story. {canRecord ? 'You can type, or tap Talk and just say it.' : ''}</p>

          {sentMain ? <p className="success"><Icon name="check" size={16} /> Your answer to this question was sent.</p> : (
            <>
          {rec.state === 'recording' ? (
            <div className="recording">
              <span><span className="rec-dot" /> Recording {clock(rec.seconds)}</span>
              {canTranscribe && <p className="live-text">{rec.liveText || 'Listening… speak whenever you’re ready.'}</p>}
              <button className="btn danger big" onClick={stop}><Icon name="stop" size={20} /> Stop</button>
            </div>
          ) : (
            <>
              {canRecord && (
                <button className="btn secondary big" onClick={() => rec.start('audio')}>
                  <Icon name="mic" size={22} /> {audio ? 'Record again' : 'Talk'}
                </button>
              )}
              {audioUrl && <audio src={audioUrl} controls className="media-audio" />}
              <label className="field">
                <span>{audio ? (canTranscribe ? 'What you said (fix anything that came out wrong)' : 'Add a few words about what you said') : 'Your answer'}</span>
                <textarea id="ask-answer" ref={textRef} rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="Type your answer here…" />
              </label>
            </>
          )}
            </>
          )}
          {rec.error && <p className="error">{rec.error}</p>}

          {others.length > 0 && (
            <div className="more-history stack">
              {!showMore ? (
                <button className="btn ghost" onClick={() => setShowMore(true)}><Icon name="plus" size={18} /> Know about other health conditions in the family? Add them too</button>
              ) : (
                <>
                  <p className="label">More family health history <small className="muted">— optional, skip any you don’t know</small></p>
                  {others.map((f) => (
                    <TextField key={f.i} id={`more-${f.i}`} multiline rows={2} label={f.question} value={extra[f.i] ?? ''}
                      onChange={(v) => setExtra((cur) => ({ ...cur, [f.i]: v }))} placeholder="Type, or tap the microphone and talk." />
                  ))}
                </>
              )}
            </div>
          )}

          <label className="field"><span>Your name</span>
            <input id="ask-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </label>
          {sendError && <p className="error">{sendError}</p>}
          {canSend ? (
            <button className="btn big" disabled={sending || rec.state === 'recording' || ((!hasMain || sentMain) && !extraCount) || !name.trim()} onClick={async () => {
              setSending(true); setSendError('')
              try {
                if (hasMain && !sentMain) { await sendAnswer(ask.box!, ask.id, ask.q, name.trim(), text.trim(), audio); setSentMain(true) }
                for (const f of others) {
                  const v = extra[f.i]?.trim()
                  if (!v) continue
                  await sendAnswer(ask.box!, `${ask.id}~${f.i}`, f.question, name.trim(), v)
                  // Clear what's sent, so trying again after a dropped connection doesn't send it twice.
                  setExtra((cur) => ({ ...cur, [f.i]: '' }))
                }
                setStep('sent')
              }
              catch (e: any) { setSendError(`${e?.message ?? 'Couldn’t send.'} What’s left is still here — tap to try again.`) }
              setSending(false)
            }}><Icon name="share" size={20} /> {sending ? 'Sending…' : others.length ? `Finish and send to ${from}` : `Send to ${from}`}</button>
          ) : null}
          <button className={canSend ? 'link-btn' : 'btn big'} disabled={rec.state === 'recording' || (!text.trim() && !audio) || !name.trim()} onClick={() => setStep('send')}>
            {canSend ? 'Or send it by text message' : `Next: send it to ${from}`}
          </button>
        </div>
      )}

      {step === 'send' && (
        <div className="card stack">
          <h2>Send your answer to {from}</h2>
          <p className="muted">
            {audio
              ? `Your words and your voice recording go back to ${from} in a text message.`
              : `Your answer goes back to ${from} in a text message.`}
          </p>
          {audio ? (
            <button className="btn big" onClick={async () => {
              const ok = await shareMessage(message, audio)
              if (ok) setStep('sent')
              else window.location.href = smsLink(ask.reply ?? '', message)
            }}><Icon name="share" size={20} /> Send with my recording</button>
          ) : (
            <a className="btn big" href={smsLink(ask.reply ?? '', message)} onClick={() => setTimeout(() => setStep('sent'), 800)}>
              <Icon name="share" size={20} /> Text it to {from}
            </a>
          )}
          {ask.reply && <p className="muted small">{from}’s number: {ask.reply}</p>}
          <button className="btn ghost" onClick={async () => {
            try { await navigator.clipboard.writeText(message); setCopied(true) } catch { setCopied(false) }
          }}>{copied ? 'Copied — paste it into a message' : 'Copy my answer instead'}</button>
          <button className="link-btn" onClick={() => setStep('answer')}><Icon name="back" size={18} /> Change my answer</button>
        </div>
      )}

      {step === 'sent' && (
        <div className="card stack center-text">
          <Icon name="heart" size={34} />
          <h2>Thank you, {name.trim()}.</h2>
          <p className="muted">{canSend ? `It’s on its way. Next time ${from} opens the app, your memory becomes part of their story — with your name on it.` : `Once ${from} opens your message, your memory becomes part of their story — with your name on it.`}</p>
          {!canSend && <button className="btn ghost" onClick={() => setStep('send')}>Didn’t send? Try again</button>}
          {others.length > 0 && (
            <button className="btn secondary" onClick={() => { setShowMore(true); setStep('answer') }}>Add more family health history</button>
          )}
          {canSend && <p className="muted small">You can open this same link again any time to send more.</p>}
          <button className="link-btn" onClick={onDone}>Start a story of my own</button>
        </div>
      )}
      <AskFooter from={ask.from} />
    </div>
  )
}
