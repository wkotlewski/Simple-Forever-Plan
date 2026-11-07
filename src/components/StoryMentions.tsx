import { useMemo, useState } from 'react'
import { useData } from '../lib/data'
import { CHAPTERS } from '../lib/questions'
import type { Person } from '../lib/types'

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Everything said about this person in the story answers (and relatives' memories), found by name.
 * Always up to date: new answers that mention them show up here automatically.
 */
export function StoryMentions({ person }: { person: Person }) {
  const { data, save } = useData()
  const [added, setAdded] = useState<Set<string>>(new Set())

  const mentions = useMemo(() => {
    const first = person.name.split(' ')[0]
    // Use the first name only when no one else on the tree shares it.
    const firstIsUnique = first.length > 1 && data.people.filter((p) => p.name.split(' ')[0].toLowerCase() === first.toLowerCase()).length === 1
    const patterns = [person.name, ...(firstIsUnique ? [first] : [])].map((n) => new RegExp(`(^|[^A-Za-z])${esc(n)}(?![A-Za-z])`))
    const out: { key: string; chapter: string; who?: string; text: string }[] = []
    for (const a of data.answers) {
      const chapter = CHAPTERS.find((c) => c.id === a.chapterId)?.title ?? 'Story'
      const sources = [{ who: undefined as string | undefined, text: a.skipped ? '' : a.text }, ...(a.contributions ?? []).map((c) => ({ who: c.from, text: c.text }))]
      for (const src of sources) {
        for (const sentence of src.text.split(/(?<=[.!?])\s+|\n+/)) {
          if (patterns.some((re) => re.test(sentence))) out.push({ key: `${a.id}:${sentence}`, chapter, who: src.who, text: sentence.trim() })
        }
      }
    }
    return out
  }, [data.answers, data.people, person.name])

  if (!mentions.length) return null
  const inNotes = (t: string) => person.notes.includes(t)

  return (
    <section className="mentions stack">
      <p className="label">In your stories</p>
      {mentions.slice(0, 12).map((m) => (
        <div key={m.key} className="mention">
          <p>“{m.text}”</p>
          <div className="row between wrap">
            <small className="muted">{m.who ? `${m.who}, in ` : ''}{m.chapter}</small>
            {inNotes(m.text) || added.has(m.key)
              ? <small className="muted">In their notes</small>
              : <button className="link-btn small" onClick={async () => {
                  await save('people', { ...person, notes: [person.notes.trim(), m.text].filter(Boolean).join('\n') })
                  setAdded((s) => new Set(s).add(m.key))
                }}>Add to their notes</button>}
          </div>
        </div>
      ))}
      {mentions.length > 12 && <p className="muted small">And {mentions.length - 12} more mentions.</p>}
    </section>
  )
}
