import { useEffect, useState } from 'react'
import { useData } from '../lib/data'
import { mediaKind } from '../lib/store'
import { saveToApp } from '../lib/backup'
import { CHAPTERS } from '../lib/questions'
import type { Answer } from '../lib/types'
import { TextField } from './TextField'
import { Icon, Sheet } from './ui'

const recordingOf = (a: Answer) => a.mediaIds.find((m) => mediaKind(m) === 'audio' || mediaKind(m) === 'video')

/** Answers with a recording but no words yet (for example, recordings put back after they were lost). */
export const needsWords = (answers: Answer[]) => answers.filter((a) => !a.skipped && recordingOf(a) && !a.text.trim())

/** What goes to the AI app with the recording: write down exactly what was said, nothing more. */
export const transcriptPrompt = (a: Answer) =>
  `Please write out the attached recording word for word. It's me answering the question “${a.question}” for my family's life-story book.

- Write only the words that are spoken — no summary, no headings, no comments.
- Keep my own words and way of speaking. You can leave out “um” and “uh” and add punctuation and paragraphs so it's easy to read.
- Spell family names and places as carefully as you can. If a word is hard to make out, write [unclear].`

/**
 * Under a recorded answer: get the words from your own AI app (ChatGPT, Gemini…) — or fix words that came out wrong.
 */
export function Transcribe({ answer }: { answer: Answer }) {
  const [open, setOpen] = useState(false)
  if (!recordingOf(answer)) return null
  const hasWords = !!answer.text.trim()
  return (
    <>
      {hasWords ? (
        <button className="link-btn small transcribe-again" onClick={() => setOpen(true)}>
          <Icon name="type" size={14} /> Words not right? Get a clean transcript
        </button>
      ) : (
        <button className="btn secondary small transcribe-btn" onClick={() => setOpen(true)}>
          <Icon name="type" size={16} /> Get the words with my AI app
        </button>
      )}
      {open && <TranscriptSheet answers={[answer]} onClose={() => setOpen(false)} />}
    </>
  )
}

/** A card listing recordings that still need their words, with one button to go through them. */
export function MissingWords() {
  const { data, isOwner } = useData()
  // The list is fixed when opened, so saving one doesn't shift or close the rest.
  const [queue, setQueue] = useState<Answer[] | null>(null)
  const list = needsWords(data.answers)
  if (queue) return <TranscriptSheet answers={queue} onClose={() => setQueue(null)} />
  if (!isOwner || !list.length) return null
  return (
    <div className="card survey-card">
      <div>
        <strong>{list.length} recording{list.length === 1 ? '' : 's'} without the words written out</strong>
        <p className="muted small">Send each one to your AI app to write out what you said, then paste it back. Having the words means they can go in your chapters and book.</p>
      </div>
      <button className="btn small" onClick={() => setQueue(list)}><Icon name="type" size={16} /> Get the words</button>
    </div>
  )
}

/**
 * One recording at a time: send it (with instructions) to your AI app, paste the words back, check them while
 * listening, and save. The words already there are kept unless you tap Save.
 */
export function TranscriptSheet({ answers, onClose }: { answers: Answer[]; onClose: () => void }) {
  const { data, save, store } = useData()
  const [i, setI] = useState(0)
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [note, setNote] = useState('')
  const [saved, setSaved] = useState(0)
  const answer = answers[i] ? data.answers.find((a) => a.id === answers[i].id) ?? answers[i] : undefined
  const media = answer && recordingOf(answer)
  const prompt = answer ? transcriptPrompt(answer) : ''

  // Get the file ready before the tap — phones only open the share sheet right after a tap.
  useEffect(() => {
    if (!answer || !media) return
    let live = true
    setFile(null); setUrl(null); setText(answer.text); setNote('')
    ;(async () => {
      const u = await store.mediaUrl(media)
      if (!u || !live) return
      setUrl(u)
      const blob = await (await fetch(u)).blob()
      const ext = (blob.type.split('/')[1] ?? 'webm').split(';')[0].replace('mpeg', 'mp3').replace('x-m4a', 'm4a')
      const chapter = CHAPTERS.find((c) => c.id === answer.chapterId)?.title ?? 'Story'
      if (live) setFile(new File([blob], `${chapter} - ${answer.question}`.replace(/[\\/:*?"<>|]/g, '').slice(0, 70) + `.${ext}`, { type: blob.type }))
    })()
    return () => { live = false }
  }, [answer?.id, media, store]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!answer || !media) {
    return (
      <Sheet title="Transcripts" onClose={onClose}>
        <div className="stack center-text">
          <Icon name="check" size={30} />
          <p>{saved ? `Words saved for ${saved} recording${saved === 1 ? '' : 's'}.` : 'Nothing was changed.'}</p>
          <button className="btn" onClick={onClose}>Done</button>
        </div>
      </Sheet>
    )
  }

  async function send() {
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
    navigator.clipboard?.writeText(prompt).catch(() => null)
    if (file && nav.share && nav.canShare?.({ files: [file], text: prompt })) {
      try { await nav.share({ files: [file], text: prompt }); setNote('Sent. If the instructions didn’t come through, paste them in your AI app — they’re copied.'); return }
      catch (e: any) { if (e?.name === 'AbortError') return }
    }
    if (file) {
      const r = await saveToApp(file, { afterTap: true })
      if (r !== 'cancelled') setNote('The recording is saved and the instructions are copied. Open your AI app, attach the recording, paste, and send.')
    }
  }

  return (
    <Sheet title={answers.length > 1 ? `Get the words · ${i + 1} of ${answers.length}` : 'Get the words'} onClose={onClose}>
      <div className="stack">
        <p className="label">{answer.question}</p>
        {url && (mediaKind(media) === 'video'
          ? <video src={url} controls playsInline className="transcribe-player" />
          : <audio src={url} controls className="transcribe-player" />)}
        <ol className="ai-list">
          <li>
            <span>Send this recording to your AI app with instructions to write out exactly what you said. Apps that take recordings, like ChatGPT or Gemini, work best.</span>
            <div className="row wrap">
              <button className="btn small" disabled={!file} onClick={send}><Icon name="share" size={16} /> Send to my AI app</button>
              <button className="btn ghost small" onClick={() => navigator.clipboard?.writeText(prompt).then(() => setNote('Instructions copied.')).catch(() => null)}>Copy instructions</button>
            </div>
            {note && <p className="muted small">{note}</p>}
          </li>
          <li>
            <span>Copy the words it writes, paste them here, and fix anything that’s off while you listen.</span>
            <TextField id={`transcript-${answer.id}`} multiline rows={7} label="What you said" value={text} onChange={setText} placeholder="Paste the words here — or type, or tap the microphone and say them." />
          </li>
        </ol>
        <div className="row wrap">
          <button className="btn" disabled={!text.trim() || text.trim() === answer.text.trim()} onClick={async () => {
            await save('answers', { ...answer, text: text.trim() })
            setSaved((n) => n + 1); setI(i + 1)
          }}>Save the words{answers.length > i + 1 ? ' and go to the next' : ''}</button>
          <button className="btn ghost" onClick={() => setI(i + 1)}>{answers.length > i + 1 ? 'Skip for now' : answer.text.trim() ? 'Keep what I had' : 'Not now'}</button>
        </div>
        <p className="muted small">Your recording goes only to the AI app you choose. It stays saved here either way.</p>
      </div>
    </Sheet>
  )
}
