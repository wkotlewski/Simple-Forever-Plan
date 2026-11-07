import { linkPeople } from './tree'
import { uid } from './store'
import type { CollectionMap, ID, Person, Relation } from './types'
import type { FamilyDraft } from './familyParse'

export interface DraftChoices {
  /** Per person: include or not, the name as edited, years, or "same person as" another key. */
  people: Record<string, { include: boolean; name: string; born?: string; died?: string; sameAs?: string }>
  links: Set<string>
  /** When the tree has no "you" yet and the text named you by name. */
  selfKey?: string
}

type Save = <K extends 'people' | 'relations'>(c: K, item: CollectionMap[K]) => Promise<void>

/** Adds what was checked: new people, details filled in on existing people, and the connections. */
export async function applyFamilyDraft(draft: FamilyDraft, ch: DraftChoices, ctx: { people: Person[]; relations: Relation[]; save: Save; selfName: string }) {
  const ids = new Map<string, ID>()
  const finalKey = (k: string) => { let cur = k; for (let i = 0; i < 5 && ch.people[cur]?.sameAs; i++) cur = ch.people[cur].sameAs!; return cur }
  const created: Person[] = []
  let added = 0

  for (const p of draft.people) {
    const c = ch.people[p.key]
    if (!c?.include || c.sameAs) continue
    const name = c.name.trim()
    if (p.existingId) {
      const ex = ctx.people.find((x) => x.id === p.existingId)!
      const patch: Partial<Person> = {}
      if (c.born && !ex.born) patch.born = c.born
      if (c.died && !ex.died) patch.died = c.died
      if (name && name !== ex.name && name.toLowerCase().startsWith(ex.name.toLowerCase())) patch.name = name
      if (Object.keys(patch).length) await ctx.save('people', { ...ex, ...patch })
      ids.set(p.key, ex.id)
      continue
    }
    if (!name && !p.isSelf) continue
    const person: Person = {
      id: uid(), name: name || ctx.selfName, notes: '', circle: 'family',
      born: c.born || undefined, died: c.died || undefined,
      isSelf: p.isSelf || ch.selfKey === p.key || undefined,
      relation: p.unconnected ? p.label : undefined,
    }
    await ctx.save('people', person)
    created.push(person)
    ids.set(p.key, person.id)
    added++
  }

  // Connections: partners first, then parents, then brothers and sisters (who share parents).
  const order = { spouse: 0, parent: 1, sibling: 2 } as const
  const lctx = { people: [...ctx.people, ...created], relations: [...ctx.relations], save: ctx.save }
  let connected = 0
  for (const l of [...draft.links].sort((a, b) => order[a.type] - order[b.type])) {
    if (!ch.links.has(l.key)) continue
    const a = ids.get(finalKey(l.a)), b = ids.get(finalKey(l.b))
    if (!a || !b || a === b) continue
    await linkPeople(lctx, a, l.type, b)
    connected++
  }
  return { added, connected }
}
