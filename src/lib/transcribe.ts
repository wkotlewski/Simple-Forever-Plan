/**
 * Turns a saved recording into words, entirely on this phone. The speech model (about 80 MB) downloads
 * the first time and is reused after that. Nothing about the recording leaves the device.
 */

export type TranscribeProgress =
  | { stage: 'preparing' }
  | { stage: 'downloading'; percent: number }
  | { stage: 'working' }

let worker: Worker | null = null
let nextId = 1
const files = new Map<string, { loaded: number; total: number }>()

function getWorker() {
  worker ??= new Worker(new URL('./transcribeWorker.ts', import.meta.url), { type: 'module' })
  return worker
}

/** Decodes any audio or video file to the 16 kHz mono sound the model listens to. */
async function toSamples(blob: Blob): Promise<Float32Array> {
  const Ctx = window.AudioContext ?? (window as any).webkitAudioContext
  const ctx = new Ctx()
  let decoded: AudioBuffer
  try {
    decoded = await ctx.decodeAudioData(await blob.arrayBuffer())
  } catch {
    throw new Error('This phone can’t read that recording’s sound. Try playing it and typing the words instead.')
  } finally {
    ctx.close?.()
  }
  const rate = 16000
  const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * rate)), rate)
  const src = offline.createBufferSource()
  src.buffer = decoded
  src.connect(offline.destination)
  src.start()
  return (await offline.startRendering()).getChannelData(0)
}

export async function transcribeBlob(blob: Blob, onProgress?: (p: TranscribeProgress) => void): Promise<string> {
  onProgress?.({ stage: 'preparing' })
  const audio = await toSamples(blob)
  const w = getWorker()
  const id = nextId++
  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent) => {
      const m = e.data
      if (m.id !== id) return
      if (m.type === 'download') {
        files.set(m.file, { loaded: m.loaded, total: m.total })
        const all = [...files.values()]
        const percent = Math.round((all.reduce((n, f) => n + f.loaded, 0) / Math.max(1, all.reduce((n, f) => n + f.total, 0))) * 100)
        onProgress?.({ stage: 'downloading', percent })
      } else if (m.type === 'working') onProgress?.({ stage: 'working' })
      else if (m.type === 'done') { w.removeEventListener('message', onMessage); resolve(m.text) }
      else if (m.type === 'error') {
        w.removeEventListener('message', onMessage)
        reject(new Error(/fetch|network|Failed to load/i.test(m.message)
          ? 'Couldn’t download the speech model. Check your internet connection (Wi-Fi is best) and try again.'
          : 'Couldn’t write out this recording. You can type or say the words instead.'))
      }
    }
    w.addEventListener('message', onMessage)
    w.postMessage({ id, audio }, [audio.buffer])
  })
}
