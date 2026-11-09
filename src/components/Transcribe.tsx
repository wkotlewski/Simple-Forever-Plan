import { useEffect, useState } from 'react'
import { useData } from '../lib/data'
import { mediaKind } from '../lib/store'
import { toSpeechWav } from '../lib/aiShare'
import { AiSend } from './AiSend'
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
  const [saved, setSaved] = useState(0)
  const answer = answers[i] ? data.answers.find((a) => a.id === answers[i].id) ?? answers[i] : undefined
  const media = answer && recordingOf(answer)
  const prompt = answer ? transcriptPrompt(answer) : ''

  // Get the file ready before the tap — phones only open the share sheet right after a tap.
  useEffect(() => {
    if (!answer || !media) return
    let live = true
    setFile(null); setUrl(null); setText(answer.text)
    ;(async () => {
      const u = await store.mediaUrl(media)
      if (!u || !live) return
      setUrl(u)
      const blob = await (await fetch(u)).blob()
      const chapter = CHAPTERS.find((c) => c.id === answer.chapterId)?.title ?? 'Story'
      const name = `${chapter} - ${answer.question}`.replace(/[\\/:*?"<>|]/g, '').slice(0, 70)
      // A plain sound file every AI app can open; if converting fails, send the original.
      const wav = await toSpeechWav(blob, name).catch(() => null)
      const ext = (blob.type.split('/')[1] ?? 'webm').split(';')[0].replace('mpeg', 'mp3').replace('x-m4a', 'm4a').replace(/^mp4$/, 'm4a')
      if (live) setFile(wav ?? new File([blob], `${name}.${ext}`, { type: blob.type.replace('video/', 'audio/') }))
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


  return (
    <Sheet title={answers.length > 1 ? `Get the words · ${i + 1} of ${answers.length}` : 'Get the words'} onClose={onClose}>
      <div className="stack">
        <p className="label">{answer.question}</p>
        {url && (mediaKind(media) === 'video'
          ? <video src={url} controls playsInline className="transcribe-player" />
          : <audio src={url} controls className="transcribe-player" />)}
        <AiSend file={file} prompt={prompt} what="recording">
            <span>Copy the words your AI app writes, paste them here, and fix anything that’s off while you listen.</span>
            <TextField id={`transcript-${answer.id}`} multiline rows={7} label="What you said" value={text} onChange={setText} placeholder="Paste the words here — or type, or tap the microphone and say them." />
        </AiSend>
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
