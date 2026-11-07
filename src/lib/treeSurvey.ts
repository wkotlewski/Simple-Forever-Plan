/**
 * The family tree survey a relative fills in, and how their answers become sentences the family reader
 * understands — so they land in the same "check, then add" review as typing the family in yourself.
 */
export interface TreePerson { name: string; born?: string; died?: string }
export interface TreeSurveyAnswers {
  /** How the relative is related to the storyteller, from the storyteller's side ("mother", "uncle"…). */
  rel: string
  me: TreePerson
  partner?: TreePerson
  parents: [TreePerson, TreePerson]
  siblings: TreePerson[]
  children: TreePerson[]
  /** Mother's mother, mother's father, father's mother, father's father. */
  grandparents: [TreePerson, TreePerson, TreePerson, TreePerson]
  more?: string
}

export const TREE_MARK = 'SFP-TREE1 '

/** Choices for "How are you related to Whitney?" — the word is from the storyteller's side. */
export const RELATIONS: { label: string; rel: string }[] = [
  { label: 'Mom', rel: 'mother' }, { label: 'Dad', rel: 'father' }, { label: 'Sister', rel: 'sister' }, { label: 'Brother', rel: 'brother' },
  { label: 'Grandma', rel: 'grandmother' }, { label: 'Grandpa', rel: 'grandfather' }, { label: 'Aunt', rel: 'aunt' }, { label: 'Uncle', rel: 'uncle' },
  { label: 'Cousin', rel: 'cousin' }, { label: 'Daughter', rel: 'daughter' }, { label: 'Son', rel: 'son' }, { label: 'Husband / wife', rel: 'spouse' },
]

const has = (p?: TreePerson) => !!p?.name.trim()
const who = (p: TreePerson) => {
  const b = p.born?.trim(), d = p.died?.trim()
  const years = b && d ? ` (${b}–${d})` : b ? ` (${b})` : d ? ` (died ${d})` : ''
  return p.name.trim() + years
}
const list = (ps: TreePerson[]) => {
  const n = ps.filter(has).map(who)
  return n.length > 1 ? `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}` : n[0] ?? ''
}

/** Sentences in the storyteller's words: "My mother is Helen Kowalski (1950). The children of …" */
export function treeSentences(a: TreeSurveyAnswers): string {
  const out: string[] = []
  const me = a.me
  if (!has(me)) return ''
  const rel = a.rel === 'spouse' ? 'husband' : a.rel
  out.push(rel && rel !== 'other' ? `My ${rel} is ${who(me)}.` : `${who(me)} is family.`)
  if (has(a.partner)) out.push(`${who(me)} is married to ${who(a.partner!)}.`)
  const [mom, dad] = a.parents
  const kids = [me, ...a.siblings].filter(has)
  if (has(mom) && has(dad)) out.push(`${who(mom)} is married to ${who(dad)}.`)
  const parents = [mom, dad].filter(has)
  if (parents.length) out.push(`The children of ${parents.map(who).join(' and ')} are ${list(kids)}.`)
  else if (a.siblings.some(has)) out.push(`The children of ${who(me)}’s parents are ${list(kids)}.`)
  if (a.children.some(has)) out.push(`The children of ${[me, a.partner].filter(has).map((p) => who(p!)).join(' and ')} are ${list(a.children)}.`)
  const [mm, mf, fm, ff] = a.grandparents
  for (const [g1, g2, child] of [[mm, mf, mom], [fm, ff, dad]] as const) {
    const gp = [g1, g2].filter(has)
    if (!gp.length || !has(child)) continue
    if (gp.length === 2) out.push(`${who(g1)} is married to ${who(g2)}.`)
    out.push(`The children of ${gp.map(who).join(' and ')} are ${who(child)}.`)
  }
  return out.join('\n')
}

export const countPeople = (a: TreeSurveyAnswers) =>
  [a.me, a.partner, ...a.parents, ...a.siblings, ...a.children, ...a.grandparents].filter(has).length

export function readTreeAnswer(body: string): TreeSurveyAnswers | null {
  if (!body.startsWith(TREE_MARK)) return null
  try { return JSON.parse(body.slice(TREE_MARK.length)) } catch { return null }
}
