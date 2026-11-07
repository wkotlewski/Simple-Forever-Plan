/// <reference lib="webworker" />
// Runs a Whisper speech-recognition model on the phone itself (nothing is uploaded).
// The model downloads once and is then kept by the browser for next time.
import { pipeline, env } from '@huggingface/transformers'

env.allowLocalModels = false
// The speech engine's large files load from jsDelivr (matching the bundled version) instead of being shipped with the app.
if (env.backends.onnx.wasm) env.backends.onnx.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0-dev.20250409-89f8206ba4/dist/'

const MODEL = 'Xenova/whisper-base'
let asr: Promise<any> | null = null

function load(post: (m: object) => void) {
  asr ??= pipeline('automatic-speech-recognition', MODEL, {
    dtype: 'q8',
    device: 'wasm',
    progress_callback: (p: any) => {
      if (p.status === 'progress' && p.total) post({ type: 'download', file: p.file, loaded: p.loaded, total: p.total })
    },
  }).catch((e) => { asr = null; throw e })
  return asr
}

self.onmessage = async (e: MessageEvent<{ id: number; audio: Float32Array }>) => {
  const { id, audio } = e.data
  const post = (m: object) => (self as unknown as Worker).postMessage({ id, ...m })
  try {
    const run = await load(post)
    post({ type: 'working' })
    const out = await run(audio, { chunk_length_s: 30, stride_length_s: 5, task: 'transcribe' })
    const text = (Array.isArray(out) ? out.map((o: any) => o.text).join(' ') : out.text) as string
    post({ type: 'done', text: text.replace(/\s+/g, ' ').trim() })
  } catch (err: any) {
    post({ type: 'error', message: String(err?.message ?? err) })
  }
}
