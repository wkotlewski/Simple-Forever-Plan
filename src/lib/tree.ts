import type { ID, Person, Relation } from './types'

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
