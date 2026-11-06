import { getSupabase, supabaseConfigured } from './supabase'
import type { Settings } from './types'

/**
 * The answer mailbox (see supabase/inbox.sql). The storyteller's phone keeps a private key; relatives
 * with a question link can drop answers in but never read them. Answers are deleted once saved.
 */

export const inboxAvailable = supabaseConfigured

export interface InboxAnswer {
  id: string
  askId: string
  question: string
  from: string
  text: string
  audio?: File
}

const randomKey = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' }[c]!))
}

/** Creates this storyteller's mailbox the first time they ask someone. Returns updated settings. */
export async function ensureInbox(settings: Settings): Promise<Settings | null> {
  if (!inboxAvailable) return null
  if (settings.inboxId && settings.inboxKey) return settings
  const key = randomKey()
  const { data, error } = await getSupabase()!.rpc('create_inbox', { secret: key })
  if (error || !data) return null
  return { ...settings, inboxId: data as string, inboxKey: key }
}

const toBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const r = new FileReader()
  r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
  r.onerror = () => reject(r.error)
  r.readAsDataURL(blob)
})

/** Relative's side: drop an answer (and voice recording) into the storyteller's mailbox. */
export async function sendAnswer(box: string, askId: string, question: string, from: string, text: string, audio?: File | null) {
  const sb = getSupabase()
  if (!sb) throw new Error('Sending isn’t set up yet — please text your answer instead.')
  const { error } = await sb.rpc('send_answer', {
    inbox: box, ask: askId, q: question, sender: from, body: text,
    audio_type: audio?.type ?? null, audio: audio ? await toBase64(audio) : null,
  })
  if (error) throw new Error(error.message.includes('no longer active') ? 'This question link is no longer active.' : 'Couldn’t send just now. Check your connection and try again.')
}

/** Storyteller's side: collect answers waiting in the mailbox. */
export async function readInbox(settings: Settings): Promise<InboxAnswer[]> {
  if (!inboxAvailable || !settings.inboxId || !settings.inboxKey) return []
  const { data, error } = await getSupabase()!.rpc('read_inbox', { inbox: settings.inboxId, secret: settings.inboxKey })
  if (error || !Array.isArray(data)) return []
  return data.map((r: any) => {
    let audio: File | undefined
    if (r.audio_base64) {
      const bin = atob(r.audio_base64)
      const type = r.audio_type || 'audio/webm'
      const ext = (type.split('/')[1] ?? 'webm').split(';')[0]
      audio = new File([Uint8Array.from(bin, (c) => c.charCodeAt(0))], `${r.from_name} - voice answer.${ext}`, { type })
    }
    return { id: r.id, askId: r.ask_id, question: r.question, from: r.from_name, text: r.answer ?? '', audio }
  })
}

export async function clearAnswers(settings: Settings, ids: string[]) {
  if (!settings.inboxId || !settings.inboxKey || !ids.length) return
  await getSupabase()!.rpc('clear_answers', { inbox: settings.inboxId, secret: settings.inboxKey, ids })
}
