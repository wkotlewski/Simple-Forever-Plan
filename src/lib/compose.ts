import { cloudEnabled, getSupabase, supabaseConfigured } from './supabase'
import type { Answer, LifeSummary, Settings } from './types'

export interface ComposeInput {
  chapterTitle: string
  storytellerName: string
  voice: 'first' | 'third'
  answers: Pick<Answer, 'question' | 'text'>[]
  /** Things the storyteller corrected or clarified on "Your story so far". */
  corrections?: string[]
}

export interface ComposeResult {
  body: string
  usedAI: boolean
  /** Why the writer wasn't used, when it wasn't. */
  note?: string
}

/** The writer is available once Supabase is connected (it checks the storyteller's private key). */
export const writerAvailable = supabaseConfigured

const creds = (s: Settings) => (s.inboxId && s.inboxKey ? { inbox: s.inboxId, secret: s.inboxKey } : {})

async function callWriter(body: object): Promise<any> {
  const { data, error } = await getSupabase()!.functions.invoke('story', { body })
  if (error) {
    let msg = ''
    try { msg = (await (error as any).context?.json?.())?.error ?? '' } catch { /* no body */ }
    throw new Error(msg || 'The story writer isn’t reachable right now.')
  }
  if (data?.error) throw new Error(data.error)
  return data
}

/** Everything the storyteller confirmed or fixed, as plain statements the writer must follow. */
export function correctionsFrom(summary?: LifeSummary): string[] {
  if (!summary) return []
  return [
    ...summary.facts.filter((f) => f.status === 'fixed' && f.correction?.trim()).map((f) => `Not "${f.text}" — correct: ${f.correction!.trim()}`),
    ...summary.unclear.filter((u) => u.answer?.trim()).map((u) => `${u.question} ${u.answer!.trim()}`),
  ]
}

/**
 * Writes a chapter. With the writer connected, Claude shapes the answers into warm, clear prose using
 * only what was said. Without it, the answers are arranged faithfully in the storyteller's own words.
 */
export async function composeChapter(input: ComposeInput, settings: Settings): Promise<ComposeResult> {
  const answered = input.answers.filter((a) => a.text.trim())
  if (!answered.length) return { body: '', usedAI: false }

  if (writerAvailable && (cloudEnabled || settings.inboxId)) {
    try {
      const data = await callWriter({ ...input, answers: answered, ...creds(settings) })
      if (data?.body) return { body: data.body as string, usedAI: true }
    } catch (e: any) {
      return { body: arrange(input.storytellerName, input.voice, answered), usedAI: false, note: e?.message }
    }
  }
  return { body: arrange(input.storytellerName, input.voice, answered), usedAI: false }
}

/** "Your story so far": an overview plus the facts it understood and questions it has. */
export async function summarizeLife(input: {
  storytellerName: string
  chapters: { title: string; answers: Pick<Answer, 'question' | 'text'>[] }[]
  corrections: string[]
}, settings: Settings): Promise<{ overview: string; facts: string[]; unclear: string[] }> {
  if (!writerAvailable) throw new Error('The story writer isn’t connected yet.')
  const data = await callWriter({ mode: 'summary', ...input, ...creds(settings) })
  return { overview: data.overview ?? '', facts: data.facts ?? [], unclear: data.unclear ?? [] }
}

const tidy = (s: string) => {
  const t = s.trim().replace(/\s+/g, ' ')
  const cap = t.charAt(0).toUpperCase() + t.slice(1)
  return /[.!?"”]$/.test(cap) ? cap : `${cap}.`
}

function arrange(name: string, voice: 'first' | 'third', answers: Pick<Answer, 'question' | 'text'>[]) {
  const credited = (a: Pick<Answer, 'question'>) => a.question.match(/\(as remembered by (.+)\)$/)?.[1]
  if (voice === 'first') {
    return answers.map((a) => (credited(a) ? `${credited(a)} remembers: “${tidy(a.text)}”` : tidy(a.text))).join('\n\n')
  }
  const first = name.split(' ')[0] || 'They'
  return answers
    .map((a, i) => {
      if (credited(a)) return `${credited(a)} remembers: “${tidy(a.text)}”`
      const lead = i === 0 ? `Asked "${a.question.replace(/\?$/, '')}," ${first} said:` : `On "${a.question.replace(/\?$/, '').toLowerCase()}":`
      return `${lead} “${tidy(a.text)}”`
    })
    .join('\n\n')
}
