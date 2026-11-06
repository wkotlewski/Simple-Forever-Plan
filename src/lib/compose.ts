import { getSupabase } from './supabase'
import type { Answer } from './types'

export interface ComposeInput {
  chapterTitle: string
  storytellerName: string
  voice: 'first' | 'third'
  answers: Pick<Answer, 'question' | 'text'>[]
}

export interface ComposeResult {
  body: string
  usedAI: boolean
}

/**
 * Writes a chapter. With the backend connected, the `story` function asks Claude to shape the
 * answers into prose using only what was said. Without it, the answers are arranged faithfully
 * in the storyteller's own words — nothing is invented either way.
 */
export async function composeChapter(input: ComposeInput): Promise<ComposeResult> {
  const answered = input.answers.filter((a) => a.text.trim())
  if (!answered.length) return { body: '', usedAI: false }

  const sb = getSupabase()
  if (sb) {
    const { data, error } = await sb.functions.invoke('story', { body: { ...input, answers: answered } })
    if (!error && data?.body) return { body: data.body as string, usedAI: true }
    console.warn('Story writer unavailable, using faithful arrangement instead.', error)
  }
  return { body: arrange(input.storytellerName, input.voice, answered), usedAI: false }
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
