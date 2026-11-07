import { useEffect, useRef, useState } from 'react'
import { useData } from '../lib/data'
import { dictationSupported } from '../lib/dictation'
import { mediaKind } from '../lib/store'
import type { Answer } from '../lib/types'
import { TextField } from './TextField'
import { Icon } from './ui'

const SpeechRec: any = typeof window !== 'undefined' ? (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition : null

/**
 * For an answer that has a recording but no words (for example, one put back after it was lost):
 * plays the recording out loud while the phone's speech recognition listens, writes out what it hears,
 * and lets the storyteller fix it before saving. Typing or talking it in works too.
 */
export function Transcribe({ answer }: { answer: Answer }) {
  const { store, save } = useData()
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<'idle' | 'listening' | 'done'>('idle')
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const stopRef = useRef<() => void>()
  const media = answer.mediaIds.find((m) => mediaKind(m) === 'audio' || mediaKind(m) === 'video')

  useEffect(() => () => stopRef.current?.(), [])
  if (!media || answer.text.trim()) return null

  async function listen() {
    setError(''); setText(''); setState('listening')
    const url = await store.mediaUrl(media!)
    if (!url || !SpeechRec) { setState('idle'); setError('This phone can’t write out recordings. Play it and type or talk the words in instead.'); return }
    const player = new Audio(url)
    const rec = new SpeechRec()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = navigator.language || 'en-US'
    let finals = ''
    let ended = false
    rec.onresult = (e: any) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finals += e.results[i][0].transcript.trim() + ' '
        else interim += e.results[i][0].transcript
      }
      setText((finals + interim).trim())
    }
    rec.onend = () => { if (!ended) { try { rec.start() } catch { /* stopped */ } } }
    const finish = () => {
      ended = true
      try { rec.stop() } catch { /* ignore */ }
      player.pause()
      setText((t) => finals.trim() || t)
      setState('done')
    }
    stopRef.current = finish
    player.onended = () => setTimeout(finish, 1500)
    try {
      rec.start()
      await player.play()
    } catch {
      finish()
      setError('The recording couldn’t play here. Play it above and type or talk the words in instead.')
    }
  }

  async function keep() {
    await save('answers', { ...answer, text: text.trim() })
    setOpen(false)
  }

  if (!open) {
    return (
      <button className="btn secondary small transcribe-btn" onClick={() => setOpen(true)}>
        <Icon name="type" size={16} /> Make a transcript
      </button>
    )
  }

  return (
    <div className="transcribe stack">
      {dictationSupported && state !== 'listening' && (
        <>
          <p className="muted small">Turn your volume up. The app plays the recording and writes out what it hears — you can fix anything after.</p>
          <button className="btn small" onClick={listen}><Icon name="play" size={16} /> {state === 'done' ? 'Listen again' : 'Play and write it out'}</button>
        </>
      )}
      {state === 'listening' && (
        <div className="row wrap">
          <span className="listening-note"><span className="rec-dot" /> Playing and writing it out…</span>
          <button className="btn ghost small" onClick={() => stopRef.current?.()}>Stop</button>
        </div>
      )}
      {error && <p className="error">{error}</p>}
      <TextField id={`transcript-${answer.id}`} multiline rows={5} label="The words" value={text} onChange={setText}
        placeholder={dictationSupported ? 'The words appear here as it listens. You can also type, or tap the microphone and say it.' : 'Type the words, or tap your keyboard’s microphone and say them.'} />
      <div className="row">
        <button className="btn small" disabled={!text.trim() || state === 'listening'} onClick={keep}>Save transcript</button>
        <button className="btn ghost small" onClick={() => { stopRef.current?.(); setOpen(false) }}>Cancel</button>
      </div>
    </div>
  )
}
