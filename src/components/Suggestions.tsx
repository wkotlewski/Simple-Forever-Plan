import { useEffect, useMemo, useState } from 'react'
import { useData } from '../lib/data'
import { fetchVerse, findAll, type Circle, type Suggestion } from '../lib/extract'
import { chapterById, OCCASIONS } from '../lib/questions'
import { uid } from '../lib/store'
import { linkPeople, type Link } from '../lib/tree'
import type { Answer, Person } from '../lib/types'
import { Icon, Sheet } from './ui'

const norm = (s: string) => s.toLowerCase().replace(/[^\w\s:]/g, '').replace(/\s+/g, ' ').trim()

/**
 * Suggestions found in the given answers (and relatives' memories on them) that aren't in the plan yet
 * and haven't been waved off. `only` narrows to scripture & songs or to people.
 */
export function useSuggestions(answers: Answer[], only?: 'keepsakes' | 'people') {
  const { data, settings } = useData()
  return useMemo(() => {
    const dismissed = new Set(settings.dismissed ?? [])
    const kept = new Set(data.messages.flatMap((m) => [norm(m.source ?? ''), norm(m.text)]))
    const people = new Set(data.people.map((p) => norm(p.name)))
    const seen = new Set<string>()
    const out: (Suggestion & { chapterId: string })[] = []
    for (const a of answers) {
      const texts = [a.skipped ? '' : a.text, ...(a.contributions ?? []).map((c) => c.text)]
      for (const s of texts.flatMap((t) => (t ? findAll(t) : []))) {
        if (seen.has(s.key) || dismissed.has(s.key)) continue
        if (only === 'keepsakes' && s.type === 'person') continue
        if (only === 'people' && s.type !== 'person') continue
        if (s.type === 'scripture' && kept.has(norm(s.ref))) continue
        if (s.type === 'song' && kept.has(norm(s.title))) continue
        if (s.type === 'person' && people.has(norm(s.name))) continue
        seen.add(s.key)
        out.push({ ...s, chapterId: a.chapterId })
      }
    }
    return out
  }, [answers, data.messages, data.people, settings.dismissed, only])
}

const describe = (s: Suggestion) =>
  s.type === 'scripture' ? { icon: 'book', title: s.ref, where: 'Words to Keep' }
    : s.type === 'song' ? { icon: 'speaker', title: `“${s.title}”${s.artist ? ` — ${s.artist}` : ''}`, where: 'Words to Keep' }
      : { icon: 'tree', title: `${s.name} · ${s.relation}`, where: s.circle === 'family' ? 'Family Tree' : 'People Who Mattered' }

/** A small card listing what was found, each with Add and Not now. */
export function SuggestionList({ items, title = 'Found in your story' }: { items: (Suggestion & { chapterId: string })[]; title?: string }) {
  const { save, settings } = useData()
  const [adding, setAdding] = useState<(Suggestion & { chapterId: string }) | null>(null)
  if (!items.length) return null
  return (
    <section className="suggestions" aria-label={title}>
      <p className="label"><Icon name="sparkle" size={14} /> {title}</p>
      {items.map((s) => {
        const d = describe(s)
        return (
          <div key={s.key} className="suggestion">
            <span className="suggestion-icon"><Icon name={d.icon} size={18} /></span>
            <div className="suggestion-body">
              <strong>{d.title}</strong>
              <small>Add to {d.where}?</small>
            </div>
            <div className="suggestion-actions">
              <button className="btn small" onClick={() => setAdding(s)}>Add</button>
              <button className="icon-btn" aria-label={`Not now: ${d.title}`}
                onClick={() => save('settings', { ...settings, dismissed: [...(settings.dismissed ?? []), s.key] })}>✕</button>
            </div>
          </div>
        )
      })}
      {adding && <AddSuggestion item={adding} onClose={() => setAdding(null)} />}
    </section>
  )
}

const CIRCLE_LABEL: Record<Circle, string> = { family: 'Family', mentored: 'Someone I mentored', mentor: 'A mentor to me', friend: 'A friend' }
const LINK_FROM: Record<string, Link | undefined> = { parent: 'parent', child: 'child', spouse: 'spouse', sibling: 'sibling' }

/** Confirm (and adjust) what gets added — the verse text, a song's meaning, or a person's place. */
function AddSuggestion({ item, onClose }: { item: Suggestion & { chapterId: string }; onClose: () => void }) {
  const { data, save, settings, session } = useData()
  const chapter = chapterById(item.chapterId)?.title ?? 'your story'
  const [text, setText] = useState(item.type === 'song' ? item.title : '')
  const [source, setSource] = useState(item.type === 'scripture' ? item.ref : item.type === 'song' ? item.artist ?? '' : '')
  const [note, setNote] = useState(item.context)
  const [occasions, setOccasions] = useState<string[]>(item.type === 'song' ? ['Anytime'] : ['Hard days'])
  const [loadingVerse, setLoadingVerse] = useState(item.type === 'scripture')
  const [name, setName] = useState(item.type === 'person' ? item.name : '')
  const [circle, setCircle] = useState<Circle>(item.type === 'person' ? item.circle : 'family')
  const [relation, setRelation] = useState(item.type === 'person' ? item.relation : '')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (item.type !== 'scripture') return
    fetchVerse(item.ref).then((v) => setText((t) => t || v)).finally(() => setLoadingVerse(false))
  }, [item])

  async function add() {
    setBusy(true)
    if (item.type === 'person') {
      const person: Person = { id: uid(), name: name.trim(), notes: note.trim() ? `From “${chapter}”: ${note.trim()}` : '', circle, relation: relation.trim() || CIRCLE_LABEL[circle] }
      await save('people', person)
      // Family with a clear link ("my brother Joe") goes straight onto the tree next to the storyteller.
      const link = item.link && LINK_FROM[item.link]
      if (circle === 'family' && link) {
        let me = data.people.find((p) => p.isSelf)
        if (!me) {
          me = { id: uid(), name: settings.storytellerName || session.name, notes: '', isSelf: true, circle: 'family' }
          await save('people', me)
        }
        // e.g. "my mother Helen": Helen is the parent of the storyteller.
        await linkPeople({ people: [...data.people, me, person], relations: data.relations, save }, person.id, link, me.id)
      }
    } else {
      await save('messages', {
        id: uid(), kind: item.type === 'scripture' ? 'scripture' : 'song', text: text.trim() || (item.type === 'scripture' ? item.ref : ''),
        source: source.trim() || undefined, note: note.trim() || undefined, occasions: occasions.length ? occasions : ['Anytime'],
        mediaIds: [], createdAt: Date.now(),
      })
    }
    setBusy(false)
    onClose()
  }

  const toggle = (o: string) => setOccasions((x) => (x.includes(o) ? x.filter((y) => y !== o) : [...x, o]))

  return (
    <Sheet title={item.type === 'person' ? 'Add to your people' : 'Add to Words to Keep'} onClose={onClose}>
      <div className="stack">
        {item.type === 'person' ? (
          <>
            <label className="field"><span>Name</span><input id="sg-name" value={name} onChange={(e) => setName(e.target.value)} /></label>
            <div className="field"><span>Who were they to you?</span>
              <div className="chips">{(Object.keys(CIRCLE_LABEL) as Circle[]).map((c) => (
                <button key={c} type="button" className={`chip ${circle === c ? 'on' : ''}`} onClick={() => setCircle(c)}>{CIRCLE_LABEL[c]}</button>
              ))}</div>
            </div>
            <label className="field"><span>In your words</span><input id="sg-relation" value={relation} onChange={(e) => setRelation(e.target.value)} placeholder="e.g. Apprentice at the shop" /></label>
            {circle === 'family' && item.link && LINK_FROM[item.link] && <p className="muted small">They’ll be placed on your family tree as your {relation.toLowerCase() || 'relative'}.</p>}
            {circle === 'family' && (!item.link || !LINK_FROM[item.link]) && <p className="muted small">They’ll be added to your family. You can connect them on the tree afterward.</p>}
            {circle !== 'family' && <p className="muted small">They’ll appear under People Who Mattered, below your family tree.</p>}
          </>
        ) : (
          <>
            <label className="field"><span>{item.type === 'scripture' ? 'The verse' : 'Song title'}</span>
              <textarea id="sg-text" rows={item.type === 'scripture' ? 4 : 1} value={text} onChange={(e) => setText(e.target.value)}
                placeholder={loadingVerse ? 'Looking up the verse…' : item.type === 'scripture' ? 'Type the verse in the words you know' : ''} />
            </label>
            {item.type === 'scripture' && !loadingVerse && <p className="muted small">Verse text from the King James Version. Change it to the translation you love.</p>}
            <label className="field"><span>{item.type === 'scripture' ? 'Reference' : 'Who sings it'}</span><input id="sg-source" value={source} onChange={(e) => setSource(e.target.value)} /></label>
            <div className="field"><span>Open when…</span>
              <div className="chips">{OCCASIONS.map((o) => <button key={o} type="button" className={`chip ${occasions.includes(o) ? 'on' : ''}`} onClick={() => toggle(o)}>{o}</button>)}</div>
            </div>
          </>
        )}
        <label className="field"><span>{item.type === 'person' ? 'Notes' : 'Why it matters'} <small className="muted">(from “{chapter}”)</small></span>
          <textarea id="sg-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <button className="btn big" disabled={busy || (item.type === 'person' ? !name.trim() : item.type === 'song' && !text.trim())} onClick={add}>
          {busy ? 'Adding…' : 'Add'}
        </button>
      </div>
    </Sheet>
  )
}
