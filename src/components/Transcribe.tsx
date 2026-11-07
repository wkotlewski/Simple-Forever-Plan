import { useState } from 'react'
import { useData } from '../lib/data'
import { mediaKind } from '../lib/store'
import { transcribeBlob, type TranscribeProgress } from '../lib/transcribe'
import type { Answer } from '../lib/types'
import { TextField } from './TextField'
import { Icon } from './ui'

/**
 * For an answer that has a recording but no words (for example, one put back after it was lost):
 * reads the recording file on this phone, writes out the words, and lets the storyteller fix them
 * before saving.
 */
export function Transcribe({ answer }: { answer: Answer }) {
  const { store, save } = useData()
  const [open, setOpen] = useState(false)
  const [progress, setProgress] = useState<TranscribeProgress | null>(null)
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const media = answer.mediaIds.find((m) => mediaKind(m) === 'audio' || mediaKind(m) === 'video')
  if (!media || answer.text.trim()) return null

  async function run() {
    setOpen(true); setError(''); setText('')
    try {
      const url = await store.mediaUrl(media!)
      if (!url) throw new Error('Couldn’t find this recording.')
      const blob = await (await fetch(url)).blob()
      const words = await transcribeBlob(blob, setProgress)
      setText(words)
      if (!words) setError('No words were heard in this recording. You can type or say them instead.')
    } catch (e: any) {
      setError(e?.message ?? 'Couldn’t write out this recording.')
    }
    setProgress(null)
  }

  if (!open) {
    return (
      <button className="btn secondary small transcribe-btn" onClick={run}>
        <Icon name="type" size={16} /> Write out the words
      </button>
    )
  }

  return (
    <div className="transcribe stack">
      {progress && (
        <div className="transcribe-progress" role="status">
          <span className="pulse-dot" />
          <span>
            {progress.stage === 'downloading'
              ? `Getting the speech tool ready — first time only (${progress.percent}%)`
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
          <TextField id={`transcript-${answer.id}`} multiline rows={5} label="The words — fix anything that came out wrong" value={text} onChange={setText}
            placeholder="Type the words, or tap the microphone and say them." />
          <div className="row wrap">
            <button className="btn small" disabled={!text.trim()} onClick={async () => { await save('answers', { ...answer, text: text.trim() }); setOpen(false) }}>Save the words</button>
            {error && <button className="btn ghost small" onClick={run}>Try again</button>}
            <button className="btn ghost small" onClick={() => setOpen(false)}>Cancel</button>
          </div>
          <p className="muted small">Written out on your phone — the recording isn’t sent anywhere.</p>
        </>
      )}
    </div>
  )
}
