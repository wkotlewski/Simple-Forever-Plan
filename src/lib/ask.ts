/**
 * "Ask someone who knows": a question travels to a relative inside a link, and their answer travels
 * back inside a reply link. No server is involved — everything rides in the text messages themselves.
 */

/** What the relative's link carries. */
export interface AskPayload {
  v: 1
  id: string        // the ask's id in the storyteller's plan
  q: string         // the question
  from: string      // storyteller's name
  to: string        // relative's name
  note?: string     // optional personal note from the storyteller
  reply?: string    // storyteller's number to text the answer back to
  box?: string      // storyteller's answer mailbox, so the relative can just tap Send
}

/** What the reply link carries back. */
export interface ReplyPayload {
  v: 1
  id: string
  q: string
  from: string      // who answered
  text: string
  audio?: boolean   // they also sent a voice recording as an attachment
}

const enc = (o: object) => {
  const bytes = new TextEncoder().encode(JSON.stringify(o))
  let bin = ''
  bytes.forEach((b) => { bin += String.fromCharCode(b) })
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const dec = <T,>(s: string): T | null => {
  try {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))) as T
  } catch {
    return null
  }
}

const appUrl = () => window.location.origin + window.location.pathname

export const askLink = (p: AskPayload) => `${appUrl()}#ask=${enc(p)}`
export const replyLink = (p: ReplyPayload) => `${appUrl()}#reply=${enc(p)}`

export function readHash(hash = window.location.hash): { ask?: AskPayload; reply?: ReplyPayload } {
  const m = hash.match(/#(ask|reply)=([\w-]+)/)
  if (!m) return {}
  const data = dec<any>(m[2])
  if (!data || data.v !== 1 || !data.id || !data.q) return {}
  return m[1] === 'ask' ? { ask: data } : { reply: data }
}

/** Finds a reply link anywhere in pasted text (for when a link opens in a different browser). */
export const findReply = (text: string) => readHash(text.slice(text.indexOf('#reply=')))?.reply ?? null

export const clearHash = () => history.replaceState(null, '', window.location.pathname + window.location.search)

/** A text-message link. iPhone and Android both understand `sms:number?&body=`. */
export const smsLink = (phone: string, body: string) => `sms:${phone.replace(/[^\d+]/g, '')}?&body=${encodeURIComponent(body)}`

export function askMessage(p: AskPayload) {
  const from = p.from.split(' ')[0]
  return [
    `Hi ${p.to}! ${from} is writing down family stories and could use your memory on one question:`,
    `“${p.q}”`,
    p.note ? p.note : '',
    `You can type or just talk — tap here to answer: ${askLink(p)}`,
  ].filter(Boolean).join('\n\n')
}

export function replyMessage(p: ReplyPayload) {
  return [
    `Here’s my answer to “${p.q}”:`,
    p.text,
    `Tap to add it to your story: ${replyLink(p)}`,
  ].filter(Boolean).join('\n\n')
}

/** Shares through the phone's share sheet when possible (lets a voice recording ride along). */
export async function shareMessage(text: string, file?: File): Promise<boolean> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  const data: ShareData = file ? { text, files: [file] } : { text }
  if (nav.share && (!file || nav.canShare?.(data))) {
    try { await nav.share(data); return true } catch (e: any) { if (e?.name === 'AbortError') return true }
  }
  return false
}

/** Lets any screen hand over a pasted reply; the app shell listens and shows it. */
export const offerReply = (r: ReplyPayload) => window.dispatchEvent(new CustomEvent('sfp-reply', { detail: r }))
