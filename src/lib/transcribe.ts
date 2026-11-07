/**
 * Turns a saved recording into words, entirely on this device. The speech model downloads the first time
 * and is reused after that. Nothing about the recording leaves the device.
 *
 * Phones get a smaller model, the sound is decoded straight to 16 kHz mono, and the recording is sent to the
 * model in short pieces — all to keep memory low, since phones close pages that use too much.
 */

export type TranscribeProgress =
  | { stage: 'preparing' }
  | { stage: 'downloading'; percent: number }
  | { stage: 'working'; piece: number; pieces: number; soFar: string }

const RATE = 16000
const PIECE = 12 * RATE // a few sentences at a time
const RUNNING = 'sfp-transcribe-running'
const LIGHT = 'sfp-transcribe-light'

const isPhone = /iPhone|iPad|iPod|Android|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent))
const storage = { get: (k: string) => { try { return localStorage.getItem(k) } catch { return null } }, set: (k: string, v: string | null) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v) } catch { /* private mode */ } } }

// If a previous try never finished (the page was closed for using too much memory), stay on the lightest setting.
if (storage.get(RUNNING)) { storage.set(LIGHT, '1'); storage.set(RUNNING, null) }

const model = () => (isPhone || storage.get(LIGHT) ? 'Xenova/whisper-tiny' : 'Xenova/whisper-base')

let worker: Worker | null = null
let nextId = 1
const files = new Map<string, { loaded: number; total: number }>()

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./transcribeWorker.ts', import.meta.url), { type: 'module' })
    worker.onerror = () => { worker?.terminate(); worker = null }
  }
  return worker
}

/** Decodes any audio or video file straight to 16 kHz mono (much less memory than the phone's usual rate). */
async function toSamples(blob: Blob): Promise<Float32Array> {
  const Ctx = window.AudioContext ?? (window as any).webkitAudioContext
  let ctx: AudioContext
  try { ctx = new Ctx({ sampleRate: RATE }) } catch { ctx = new Ctx() }
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer())
    if (decoded.sampleRate === RATE && decoded.numberOfChannels === 1) return decoded.getChannelData(0)
    const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * RATE)), RATE)
    const src = offline.createBufferSource()
    src.buffer = decoded
    src.connect(offline.destination)
    src.start()
    return (await offline.startRendering()).getChannelData(0)
  } catch {
    throw new Error('This phone can’t read that recording’s sound. You can type or say the words instead.')
  } finally {
    ctx.close?.()
  }
}

/** Splits the sound into pieces of a few sentences (~12 seconds), cutting at the quietest moment near each boundary so words aren't split. */
function pieces(audio: Float32Array): Float32Array[] {
  const out: Float32Array[] = []
  let start = 0
  while (start < audio.length) {
    let end = Math.min(audio.length, start + PIECE)
    if (end < audio.length) {
      const win = Math.floor(0.05 * RATE)
      let best = end, quietest = Infinity
      for (let i = end - 2 * RATE; i < end; i += win) {
        let e = 0
        for (let j = i; j < i + win; j++) e += audio[j] * audio[j]
        if (e < quietest) { quietest = e; best = i + Math.floor(win / 2) }
      }
      end = best
    }
    out.push(audio.slice(start, end))
    start = end
  }
  return out
}

function runPiece(audio: Float32Array, onProgress: (p: TranscribeProgress) => void): Promise<string> {
  const w = getWorker()
  const id = nextId++
  return new Promise((resolve, reject) => {
    const cleanup = () => { w.removeEventListener('message', onMessage); w.removeEventListener('error', onError) }
    const onError = () => { cleanup(); reject(new Error('The speech tool stopped. Try again, or type the words instead.')) }
    const onMessage = (e: MessageEvent) => {
      const m = e.data
      if (m.id !== id) return
      if (m.type === 'download') {
        files.set(m.file, { loaded: m.loaded, total: m.total })
        const all = [...files.values()]
        onProgress({ stage: 'downloading', percent: Math.round((all.reduce((n, f) => n + f.loaded, 0) / Math.max(1, all.reduce((n, f) => n + f.total, 0))) * 100) })
      } else if (m.type === 'done') { cleanup(); resolve(m.text) }
      else if (m.type === 'error') {
        cleanup()
        reject(new Error(/fetch|network|Failed to load/i.test(m.message)
          ? 'Couldn’t download the speech tool. Check your internet connection (Wi-Fi is best) and try again.'
          : 'Couldn’t write out this recording. You can type or say the words instead.'))
      }
    }
    w.addEventListener('message', onMessage)
    w.addEventListener('error', onError)
    w.postMessage({ id, model: model(), audio }, [audio.buffer])
  })
}

export async function transcribeBlob(blob: Blob, onProgress: (p: TranscribeProgress) => void = () => {}): Promise<string> {
  onProgress({ stage: 'preparing' })
  const all = pieces(await toSamples(blob))
  storage.set(RUNNING, '1')
  try {
    const words: string[] = []
    const soFar = () => words.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
    for (let i = 0; i < all.length; i++) {
      onProgress({ stage: 'working', piece: i + 1, pieces: all.length, soFar: soFar() })
      // Each piece is written out on its own, so the words appear a few lines at a time.
      words.push(await runPiece(all[i], (p) => onProgress(p.stage === 'downloading' ? p : { stage: 'working', piece: i + 1, pieces: all.length, soFar: soFar() })))
      all[i] = new Float32Array(0) // let the finished piece go
    }
    return soFar()
  } finally {
    storage.set(RUNNING, null)
  }
}
