/// <reference lib="webworker" />
// Runs a Whisper speech-recognition model on the device itself (nothing is uploaded).
// The model downloads once and is then kept by the browser for next time.
import { pipeline, env } from '@huggingface/transformers'

env.allowLocalModels = false
if (env.backends.onnx.wasm) {
  // The speech engine's large files load from jsDelivr (matching the bundled version) instead of being shipped with the app.
  env.backends.onnx.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0-dev.20250409-89f8206ba4/dist/'
  // One thread and no extra proxy worker: slower, but far gentler on a phone's memory.
  env.backends.onnx.wasm.numThreads = 1
  env.backends.onnx.wasm.proxy = false
}

const pipes = new Map<string, Promise<any>>()

function load(model: string, post: (m: object) => void) {
  if (!pipes.has(model)) {
    pipes.set(model, pipeline('automatic-speech-recognition', model, {
      dtype: 'q8',
      device: 'wasm',
      progress_callback: (p: any) => {
        if (p.status === 'progress' && p.total) post({ type: 'download', file: p.file, loaded: p.loaded, total: p.total })
      },
    }).catch((e) => { pipes.delete(model); throw e }))
  }
  return pipes.get(model)!
}

// One short piece of audio at a time (the page sends the recording in ~25-second pieces).
self.onmessage = async (e: MessageEvent<{ id: number; model: string; audio: Float32Array }>) => {
  const { id, model, audio } = e.data
  const post = (m: object) => (self as unknown as Worker).postMessage({ id, ...m })
  try {
    const run = await load(model, post)
    post({ type: 'working' })
    // Telling it the language (instead of letting it guess from a few seconds) makes the words noticeably more accurate.
    const out = await run(audio, { task: 'transcribe', language: 'english' })
    post({ type: 'done', text: String(out?.text ?? '').replace(/\s+/g, ' ').trim() })
  } catch (err: any) {
    post({ type: 'error', message: String(err?.message ?? err) })
  }
}
