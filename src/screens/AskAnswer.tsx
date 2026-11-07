import { useEffect, useRef, useState } from 'react'
import { replyMessage, smsLink, shareMessage, type AskPayload } from '../lib/ask'
import { canRecord, canTranscribe, clock, useRecorder } from '../lib/recorder'
import { inboxAvailable, sendAnswer } from '../lib/inbox'
import { Icon } from '../components/ui'

/**
 * What a relative sees after tapping the link in their text: one question, a way to answer by
 * typing or talking, and a button to text the answer back. No sign-up, nothing saved on their phone.
 */
export default function AskAnswer({ ask, onDone }: { ask: AskPayload; onDone: () => void }) {
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
      <div className="welcome-hero">
        <div className="logo"><Icon name="heart" size={30} /></div>
        <p className="eyebrow">{ask.from} is asking for your help</p>
        <h1 className="ask-question">“{ask.q}”</h1>
        {ask.note && <p className="ask-note">{ask.note}</p>}
      </div>

      {step === 'answer' && (
        <div className="card stack">
          <p className="muted">Share whatever you remember — a few words or a long story. {canRecord ? 'You can type, or tap Talk and just say it.' : ''}</p>

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
          {rec.error && <p className="error">{rec.error}</p>}

          <label className="field"><span>Your name</span>
            <input id="ask-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </label>
          {sendError && <p className="error">{sendError}</p>}
          {canSend ? (
            <button className="btn big" disabled={sending || rec.state === 'recording' || (!text.trim() && !audio) || !name.trim()} onClick={async () => {
              setSending(true); setSendError('')
              try { await sendAnswer(ask.box!, ask.id, ask.q, name.trim(), text.trim(), audio); setStep('sent') }
              catch (e: any) { setSendError(`${e?.message ?? 'Couldn’t send.'} You can also text it instead.`) }
              setSending(false)
            }}><Icon name="share" size={20} /> {sending ? 'Sending…' : `Send to ${from}`}</button>
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
          <button className="link-btn" onClick={onDone}>Start a story of my own</button>
        </div>
      )}
    </div>
  )
}
