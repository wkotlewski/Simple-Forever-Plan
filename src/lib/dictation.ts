import { useEffect, useRef, useState } from 'react'

const SpeechRec: any =
  typeof window !== 'undefined' ? (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition : null

export const dictationSupported = Boolean(SpeechRec)

/**
 * Talk instead of type: listens and adds what was said to a field as you speak.
 * Only one field listens at a time.
 */
let active: { stop: () => void } | null = null

export function useDictation(onText: (spoken: string, final: boolean) => void) {
  const [listening, setListening] = useState(false)
  const rec = useRef<any>(null)
  const cb = useRef(onText)
  cb.current = onText

  useEffect(() => () => { try { rec.current?.stop() } catch { /* already stopped */ } }, [])

  function start() {
    if (!SpeechRec) return
    active?.stop()
    const r = new SpeechRec()
    r.continuous = true
    r.interimResults = true
    r.lang = navigator.language || 'en-US'
    r.onresult = (e: any) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (e.results[i].isFinal) cb.current(t.trim(), true)
        else interim += t
      }
      if (interim) cb.current(interim.trim(), false)
    }
    r.onend = () => { setListening(false); if (active === handle) active = null }
    r.onerror = () => setListening(false)
    const handle = { stop: () => { try { r.stop() } catch { /* ignore */ } } }
    try { r.start(); rec.current = r; active = handle; setListening(true) } catch { setListening(false) }
  }

  const stop = () => { try { rec.current?.stop() } catch { /* ignore */ } setListening(false) }
  return { listening, start, stop, supported: dictationSupported }
}
