import { saveToApp } from './backup'

/**
 * Hands a file to the person's AI app. The instructions go on the clipboard and the file goes alone through the
 * share sheet — many AI apps drop the file when text comes with it, or only take the text.
 */
export async function shareToAi(file: File, prompt: string): Promise<'shared' | 'saved' | 'cancelled'> {
  navigator.clipboard?.writeText(prompt).catch(() => null)
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try { await nav.share({ files: [file] }); return 'shared' }
    catch (e: any) { if (e?.name === 'AbortError') return 'cancelled' }
  }
  const r = await saveToApp(file, { afterTap: true })
  return r === 'cancelled' ? 'cancelled' : 'saved'
}

/**
 * A recording as a plain WAV sound file (mono, 16 kHz — clear for speech and small), which every AI app that takes
 * audio can open. Phone recordings are often .mp4 or .webm, which several apps refuse or treat as video.
 */
export async function toSpeechWav(blob: Blob, name: string): Promise<File> {
  const Ctx = window.AudioContext || (window as any).webkitAudioContext
  const ctx = new Ctx()
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer())
    const rate = 16000
    const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * rate), rate)
    const src = off.createBufferSource()
    src.buffer = decoded
    src.connect(off.destination)
    src.start()
    const samples = (await off.startRendering()).getChannelData(0)
    const buf = new ArrayBuffer(44 + samples.length * 2)
    const v = new DataView(buf)
    const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
    str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE'); str(12, 'fmt ')
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true)
    v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, samples.length * 2, true)
    for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 0x7fff, true)
    return new File([buf], `${name}.wav`, { type: 'audio/wav' })
  } finally { ctx.close().catch(() => null) }
}
