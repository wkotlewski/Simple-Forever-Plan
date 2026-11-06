import { useEffect, useRef, useState } from 'react'

type Kind = 'audio' | 'video'

const pickMime = (kind: Kind) => {
  const options =
    kind === 'video'
      ? ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm']
      : ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm']
  return options.find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) ?? ''
}

const SpeechRec: any =
  typeof window !== 'undefined' ? (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition : null

export const canTranscribe = Boolean(SpeechRec)
export const canRecord = typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'

/**
 * Records audio or video and, where the browser supports it, writes down what was said as it is said,
 * so the story writer has words to work with.
 */
export function useRecorder() {
  const [state, setState] = useState<'idle' | 'recording' | 'error'>('idle')
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [liveText, setLiveText] = useState('')
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState('')
  const rec = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const speech = useRef<any>(null)
  const finalText = useRef('')
  const timer = useRef<number>()

  const cleanup = () => {
    stream?.getTracks().forEach((t) => t.stop())
    rec.current?.stream.getTracks().forEach((t) => t.stop())
    try { speech.current?.stop() } catch { /* already stopped */ }
    window.clearInterval(timer.current)
    setStream(null)
  }
  useEffect(() => cleanup, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function start(kind: Kind) {
    setError('')
    setLiveText('')
    finalText.current = ''
    chunks.current = []
    try {
      const s = await navigator.mediaDevices.getUserMedia(
        kind === 'video' ? { audio: true, video: { facingMode: 'user', width: { ideal: 1280 } } } : { audio: true },
      )
      setStream(s)
      const mime = pickMime(kind)
      const r = new MediaRecorder(s, mime ? { mimeType: mime } : undefined)
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data)
      r.start(1000)
      rec.current = r
      setSeconds(0)
      timer.current = window.setInterval(() => setSeconds((x) => x + 1), 1000)
      if (SpeechRec) {
        const sr = new SpeechRec()
        sr.continuous = true
        sr.interimResults = true
        sr.lang = navigator.language || 'en-US'
        sr.onresult = (e: any) => {
          let interim = ''
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const t = e.results[i][0].transcript
            if (e.results[i].isFinal) finalText.current += t.trim() + ' '
            else interim += t
          }
          setLiveText((finalText.current + interim).trim())
        }
        // Speech recognition stops itself after a pause; keep it going while recording.
        sr.onend = () => { if (rec.current?.state === 'recording') try { sr.start() } catch { /* ignore */ } }
        try { sr.start() } catch { /* not allowed here */ }
        speech.current = sr
      }
      setState('recording')
    } catch (e: any) {
      setError(e?.name === 'NotAllowedError' ? 'Please allow the camera or microphone, then try again.' : 'Recording is not available on this device.')
      setState('error')
    }
  }

  function stop(): Promise<{ blob: Blob; transcript: string } | null> {
    return new Promise((resolve) => {
      const r = rec.current
      if (!r) return resolve(null)
      r.onstop = () => {
        const blob = new Blob(chunks.current, { type: r.mimeType || chunks.current[0]?.type || 'audio/webm' })
        const transcript = (finalText.current || liveText).trim()
        rec.current = null
        cleanup()
        setState('idle')
        resolve({ blob, transcript })
      }
      try { speech.current?.stop() } catch { /* ignore */ }
      r.stop()
    })
  }

  return { state, stream, liveText, seconds, error, start, stop }
}

export const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
