import type { CollectionMap, ID, Person, Relation } from './types'
import { uid } from './store'

export interface Placed { person: Person; x: number; y: number; gen: number }

export const parentsOf = (id: ID, rels: Relation[]) => rels.filter((r) => r.type === 'parent' && r.to === id).map((r) => r.from)
export const childrenOf = (id: ID, rels: Relation[]) => rels.filter((r) => r.type === 'parent' && r.from === id).map((r) => r.to)
export const spousesOf = (id: ID, rels: Relation[]) =>
  rels.filter((r) => r.type === 'spouse' && (r.from === id || r.to === id)).map((r) => (r.from === id ? r.to : r.from))
export const siblingsOf = (id: ID, rels: Relation[]) => {
  const ps = parentsOf(id, rels)
  return [...new Set(ps.flatMap((p) => childrenOf(p, rels)))].filter((c) => c !== id)
}

/**
 * Lays people out in rows by generation: children one row below their parents, partners side by side,
 * and each row ordered so children sit under their parents.
 */
export function layoutTree(people: Person[], rels: Relation[], nodeW = 120, rowH = 150): { placed: Placed[]; width: number; height: number } {
  const gen = new Map<ID, number>(people.map((p) => [p.id, 0]))
  for (let pass = 0; pass < people.length + 2; pass++) {
    let changed = false
    for (const r of rels) {
      const a = gen.get(r.from), b = gen.get(r.to)
      if (a === undefined || b === undefined) continue
      if (r.type === 'parent' && b < a + 1) { gen.set(r.to, a + 1); changed = true }
      if (r.type === 'spouse' && a !== b) { const m = Math.max(a, b); gen.set(r.from, m); gen.set(r.to, m); changed = true }
    }
    // Pull parents down to sit right above their children (keeps grandparents from floating to the top).
    for (const r of rels) {
      if (r.type !== 'parent') continue
      const a = gen.get(r.from)!, b = gen.get(r.to)!
      if (a !== undefined && b !== undefined && a < b - 1 && !parentsOf(r.from, rels).length) { gen.set(r.from, b - 1); changed = true }
    }
    if (!changed) break
  }

  const rows = new Map<number, Person[]>()
  people.forEach((p) => { const g = gen.get(p.id)!; rows.set(g, [...(rows.get(g) ?? []), p]) })
  const gens = [...rows.keys()].sort((a, b) => a - b)
  const xIndex = new Map<ID, number>()

  for (const g of gens) {
    const row = rows.get(g)!
    // Order by the average position of each person's parents (or a partner's parents).
    const key = (p: Person) => {
      const ps = [...parentsOf(p.id, rels), ...spousesOf(p.id, rels).flatMap((s) => parentsOf(s, rels))].filter((x) => xIndex.has(x))
      return ps.length ? ps.reduce((s, x) => s + xIndex.get(x)!, 0) / ps.length : 1e6 + people.indexOf(p)
    }
    const sorted = [...row].sort((a, b) => key(a) - key(b))
    // Keep partners next to each other.
    const ordered: Person[] = []
    for (const p of sorted) {
      if (ordered.includes(p)) continue
      ordered.push(p)
      for (const s of spousesOf(p.id, rels)) {
        const sp = row.find((x) => x.id === s)
        if (sp && !ordered.includes(sp)) ordered.push(sp)
      }
    }
    ordered.forEach((p, i) => xIndex.set(p.id, i))
    rows.set(g, ordered)
  }

  const widest = Math.max(1, ...[...rows.values()].map((r) => r.length))
  const width = widest * nodeW
  const placed: Placed[] = []
  gens.forEach((g, gi) => {
    const row = rows.get(g)!
    const offset = (width - row.length * nodeW) / 2
    row.forEach((p, i) => placed.push({ person: p, gen: g, x: offset + i * nodeW + nodeW / 2, y: gi * rowH + 60 }))
  })
  return { placed, width, height: gens.length * rowH + 20 }
}

export type Link = 'parent' | 'child' | 'spouse' | 'sibling'

type Save = <K extends 'people' | 'relations'>(c: K, item: CollectionMap[K]) => Promise<void>

/** Connects two people: `personId` is the parent / child / partner / sibling of `otherId`. */
export async function linkPeople(ctx: { people: Person[]; relations: Relation[]; save: Save }, personId: ID, type: Link, otherId: ID) {
  const { relations, save } = ctx
  const name = (id: ID) => ctx.people.find((p) => p.id === id)?.name ?? ''
  // Records each new connection in ctx.relations too, so several connections made in a row see each other.
  const add = async (r: Omit<Relation, 'id'>) => {
    const dup = relations.some((x) => x.type === r.type && ((x.from === r.from && x.to === r.to) || (r.type === 'spouse' && x.from === r.to && x.to === r.from)))
    if (dup) return
    const rel = { id: uid(), ...r }
    relations.push(rel)
    await save('relations', rel)
  }
  if (type === 'parent') return add({ type: 'parent', from: personId, to: otherId })
  if (type === 'child') return add({ type: 'parent', from: otherId, to: personId })
  if (type === 'spouse') return add({ type: 'spouse', from: personId, to: otherId })
  // Siblings share parents. If none are known yet, add a placeholder parent that can be renamed later.
  let ps = parentsOf(otherId, relations)
  if (!ps.length) {
    const placeholder: Person = { id: uid(), name: `Parent of ${name(otherId).split(' ')[0]}`, notes: 'Tap to add their real name.', circle: 'family' }
    await save('people', placeholder)
    await add({ type: 'parent', from: placeholder.id, to: otherId })
    ps = [placeholder.id]
  }
  for (const p of ps) await add({ type: 'parent', from: p, to: personId })
}

// ---------- Suggested connections ----------

export interface LinkSuggestion {
  key: string
  /** `person` is the {type} of `other`, e.g. Helen is the parent of Rose. */
  person: ID
  type: Link
  other: ID
  /** Why it's suggested, using names, e.g. "Helen is Stanley's partner". */
  reason: string
  /** Suggested but not assumed (e.g. a partner's children may be step-children). */
  optional?: boolean
}

const first = (people: Person[], id: ID) => people.find((p) => p.id === id)?.name.split(' ')[0] ?? ''
const isParent = (rels: Relation[], parent: ID, child: ID) => rels.some((r) => r.type === 'parent' && r.from === parent && r.to === child)
const arePartners = (rels: Relation[], a: ID, b: ID) => rels.some((r) => r.type === 'spouse' && ((r.from === a && r.to === b) || (r.from === b && r.to === a)))

/** For someone being added with these connections, other connections that probably also apply. */
export function suggestForNew(people: Person[], rels: Relation[], newId: ID, links: { type: Link; to: ID }[]): LinkSuggestion[] {
  const out: LinkSuggestion[] = []
  const chosen = new Set(links.map((l) => `${l.type}:${l.to}`))
  const add = (s: Omit<LinkSuggestion, 'key' | 'person'>) => {
    const key = `${s.type}:${s.other}`
    if (chosen.has(key) || out.some((o) => o.key === key)) return
    out.push({ ...s, key, person: newId })
  }
  for (const l of links) {
    const n = first(people, l.to)
    if (l.type === 'child') {
      // A child of Dad is usually also a child of Dad's partner.
      for (const sp of spousesOf(l.to, rels)) add({ type: 'child', other: sp, reason: `${first(people, sp)} is ${n}’s partner` })
    }
    if (l.type === 'parent') {
      // A parent of Rose is usually also a parent of Rose's brothers and sisters, and the partner of Rose's other parent.
      for (const sib of siblingsOf(l.to, rels)) add({ type: 'parent', other: sib, reason: `${first(people, sib)} is ${n}’s brother or sister` })
      for (const p of parentsOf(l.to, rels)) add({ type: 'spouse', other: p, reason: `${first(people, p)} is also ${n}’s parent` })
    }
    if (l.type === 'spouse') {
      for (const c of childrenOf(l.to, rels)) add({ type: 'parent', other: c, reason: `${first(people, c)} is ${n}’s child`, optional: true })
    }
  }
  return out
}

/** Connections that look missing from the tree as it stands. */
export function suggestGaps(people: Person[], rels: Relation[]): LinkSuggestion[] {
  const out: LinkSuggestion[] = []
  const add = (s: Omit<LinkSuggestion, 'key'>) => {
    const key = `gap:${s.person}:${s.type}:${s.other}`
    const mirror = s.type === 'spouse' ? `gap:${s.other}:spouse:${s.person}` : ''
    if (!out.some((o) => o.key === key || o.key === mirror)) out.push({ ...s, key })
  }
  const family = new Set(people.filter((p) => !p.circle || p.circle === 'family').map((p) => p.id))
  for (const c of family) {
    const ps = parentsOf(c, rels)
    // Rule 1: Dad is Rose's parent and Mom is Dad's partner → Mom is probably Rose's parent too.
    if (ps.length === 1) {
      for (const sp of spousesOf(ps[0], rels)) {
        if (!isParent(rels, sp, c)) add({ person: sp, type: 'parent', other: c, reason: `${first(people, sp)} is ${first(people, ps[0])}’s partner` })
      }
    }
    // Rule 2: two parents of the same child who aren't connected → probably partners.
    if (ps.length === 2 && !arePartners(rels, ps[0], ps[1])) {
      add({ person: ps[0], type: 'spouse', other: ps[1], reason: `both are ${first(people, c)}’s parents`, optional: true })
    }
    // Rule 3: brothers and sisters usually share both parents.
    if (ps.length === 1) {
      for (const sib of siblingsOf(c, rels)) {
        for (const other of parentsOf(sib, rels)) {
          if (!ps.includes(other)) add({ person: other, type: 'parent', other: c, reason: `${first(people, other)} is the parent of ${first(people, sib)}, ${first(people, c)}’s brother or sister` })
        }
      }
    }
  }
  return out
}
