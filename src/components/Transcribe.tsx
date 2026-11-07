import { useEffect, useState } from 'react'
import { useData } from '../lib/data'
import { mediaKind } from '../lib/store'
import { accurateFailedHere, canBeMoreAccurate, transcribeBlob, type TranscribeProgress } from '../lib/transcribe'
import type { Answer } from '../lib/types'
import { TextField } from './TextField'
import { Icon } from './ui'

/**
 * Turns an answer's recording into words, on this phone. Works for answers with no words yet (for example,
 * one put back after it was lost) and for answers whose words came out wrong ("Write it out again").
 * The recording plays right above the words so they can be fixed by ear. Nothing is saved until "Save the words",
 * so the words already there are kept if this is cancelled.
 */
export function Transcribe({ answer }: { answer: Answer }) {
  const { store, save } = useData()
  const [open, setOpen] = useState(false)
  const [progress, setProgress] = useState<TranscribeProgress | null>(null)
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [url, setUrl] = useState<string | null>(null)
  const [usedAccurate, setUsedAccurate] = useState(false)
  const media = answer.mediaIds.find((m) => mediaKind(m) === 'audio' || mediaKind(m) === 'video')
  const hasWords = !!answer.text.trim()

  useEffect(() => {
    if (!open || !media) return
    let live = true
    store.mediaUrl(media).then((u) => live && setUrl(u))
    return () => { live = false }
  }, [open, media, store])

  if (!media) return null

  async function run(accurate: boolean) {
    setOpen(true); setError(''); setText(''); setUsedAccurate(accurate)
    try {
      const u = url ?? await store.mediaUrl(media!)
      if (!u) throw new Error('Couldn’t find this recording.')
      const blob = await (await fetch(u)).blob()
      const words = await transcribeBlob(blob, setProgress, { accurate })
      setText(words)
      if (!words) setError('No words were heard in this recording. You can type or say them instead.')
    } catch (e: any) {
      setError(e?.message ?? 'Couldn’t write out this recording.')
    }
    setProgress(null)
  }

  const better = canBeMoreAccurate()

  if (!open) {
    return hasWords ? (
      <button className="link-btn small transcribe-again" onClick={() => { setOpen(true); setText(answer.text) }}>
        <Icon name="type" size={14} /> Words not right? Write them out again
      </button>
    ) : (
      <button className="btn secondary small transcribe-btn" onClick={() => run(false)}>
        <Icon name="type" size={16} /> Write out the words
      </button>
    )
  }

  return (
    <div className="transcribe stack">
      {url && (
        <div className="stack tight">
          <span className="label">Listen while you fix the words</span>
          {mediaKind(media) === 'video'
            ? <video src={url} controls playsInline className="transcribe-player" />
            : <audio src={url} controls className="transcribe-player" />}
        </div>
      )}
      {progress && (
        <div className="transcribe-progress" role="status">
          <span className="pulse-dot" />
          <span>
            {progress.stage === 'downloading'
              ? `Getting the ${usedAccurate ? 'more accurate ' : ''}speech tool ready — first time only (${progress.percent}%)`
              : progress.stage === 'preparing' ? 'Opening the recording…'
              : progress.pieces > 1 ? `Writing out the words… part ${progress.piece} of ${progress.pieces}` : 'Writing out the words…'}
          </span>
          {progress.stage === 'downloading' && <span className="bar"><span style={{ width: `${progress.percent}%` }} /></span>}
          {progress.stage === 'working' && progress.pieces > 1 && <span className="bar"><span style={{ width: `${Math.round(((progress.piece - 1) / progress.pieces) * 100)}%` }} /></span>}
        </div>
      )}
      {progress?.stage === 'working' && progress.soFar && <p className="answer-text so-far">{progress.soFar}</p>}
      {error && <p className="error">{error}</p>}
      {!progress && (
        <>
          <TextField id={`transcript-${answer.id}`} multiline rows={6} label="The words — fix anything that came out wrong" value={text} onChange={setText}
            placeholder="Type the words, or tap the microphone and say them." />
          <div className="row wrap">
            <button className="btn small" disabled={!text.trim() || text.trim() === answer.text.trim()}
              onClick={async () => { await save('answers', { ...answer, text: text.trim() }); setOpen(false) }}>Save the words</button>
            <button className="btn ghost small" onClick={() => setOpen(false)}>{hasWords ? 'Keep what I had' : 'Cancel'}</button>
          </div>
          <div className="redo stack tight">
            <span className="label">Run it again</span>
            <div className="row wrap">
              {better && !accurateFailedHere() && (
                <button className="btn secondary small" onClick={() => run(true)}><Icon name="sparkle" size={14} /> More accurate (slower)</button>
              )}
              <button className="btn ghost small" onClick={() => run(false)}>{usedAccurate || !better ? 'Try again' : 'Quick'}</button>
            </div>
            <p className="muted small">
              {better && !accurateFailedHere()
                ? 'The more accurate way uses a bigger speech tool — about a 75 MB download the first time (Wi-Fi is best), and it takes a few times longer. '
                : accurateFailedHere() ? 'The more accurate tool was too much for this phone, so the quick one is used. ' : ''}
              Your words stay as they are until you tap Save. Written out on your phone — the recording isn’t sent anywhere.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
