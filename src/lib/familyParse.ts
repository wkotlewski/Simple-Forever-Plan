/**
 * Reads a description of a family — said or typed the way you'd tell a friend — and works out the people
 * and how they're connected. Runs on the phone; nothing is sent anywhere. The result is only a draft:
 * the storyteller checks and edits it before anything is added to the tree.
 *
 *   "My parents were Stanley and Helen Kowalski. I have a brother named Joe and two sisters, Anna and Mary.
 *    Joe married Linda and they have two kids, Tom and Lisa. My mom's parents were Frank and Rose Nowak."
 */
import { childrenOf, parentsOf, spousesOf } from './tree'
import type { ID, Person, Relation } from './types'

export type Rel = 'parent' | 'child' | 'sibling' | 'spouse' | 'grandparent' | 'grandchild' | 'auntuncle' | 'cousin' | 'niecenephew' | 'parentinlaw' | 'siblinginlaw' | 'childinlaw' | 'other'

export interface DraftPerson {
  key: string
  name: string
  born?: string
  died?: string
  existingId?: ID
  isSelf?: boolean
  /** How they relate to the storyteller, in words (Mother, Brother, Aunt…). */
  label?: string
  /** Mentioned only by role ("my mom") without a name. */
  placeholder?: boolean
  /** Has no connection on the tree yet (e.g. "my aunt Ruth"). */
  unconnected?: boolean
}
export interface DraftLink { key: string; a: string; type: 'parent' | 'spouse' | 'sibling'; b: string; why?: string }
export interface FamilyDraft { people: DraftPerson[]; links: DraftLink[]; selfKey: string; usedSelf: boolean }

// ---------- Words ----------

const ROLE_TABLE: [string[], Rel, string][] = [
  [['great-grandmother', 'great-grandma', 'great-grandfather', 'great-grandpa', 'great-grandparents', 'great-aunt', 'great-uncle', 'great-grandson', 'great-granddaughter', 'great-grandchildren'], 'other', 'Great-grandparent'],
  [['mother-in-law', 'father-in-law', 'in-laws', 'parents-in-law'], 'parentinlaw', 'Parent-in-law'],
  [['brother-in-law', 'sister-in-law', 'brothers-in-law', 'sisters-in-law'], 'siblinginlaw', 'In-law'],
  [['son-in-law', 'daughter-in-law'], 'childinlaw', 'Child-in-law'],
  [['stepmother', 'stepmom', 'step-mother', 'step-mom'], 'parent', 'Stepmother'],
  [['stepfather', 'stepdad', 'step-father', 'step-dad'], 'parent', 'Stepfather'],
  [['mother', 'mom', 'mama', 'mommy', 'momma', 'mum'], 'parent', 'Mother'],
  [['father', 'dad', 'daddy', 'papa'], 'parent', 'Father'],
  [['parents', 'folks'], 'parent', 'Parent'],
  [['half-brother', 'stepbrother', 'brother', 'brothers'], 'sibling', 'Brother'],
  [['half-sister', 'stepsister', 'sister', 'sisters'], 'sibling', 'Sister'],
  [['siblings', 'sibling'], 'sibling', 'Sibling'],
  [['stepson', 'son', 'sons'], 'child', 'Son'],
  [['stepdaughter', 'daughter', 'daughters'], 'child', 'Daughter'],
  [['children', 'child', 'kids', 'kid'], 'child', 'Child'],
  [['husband'], 'spouse', 'Husband'],
  [['wife'], 'spouse', 'Wife'],
  [['spouse', 'partner', 'fiance', 'fiancé', 'fiancée'], 'spouse', 'Partner'],
  [['grandmother', 'grandma', 'granny', 'nana', 'grandmom'], 'grandparent', 'Grandmother'],
  [['grandfather', 'grandpa', 'granddad', 'grandad', 'granddaddy'], 'grandparent', 'Grandfather'],
  [['grandparents'], 'grandparent', 'Grandparent'],
  [['grandson', 'grandsons'], 'grandchild', 'Grandson'],
  [['granddaughter', 'granddaughters'], 'grandchild', 'Granddaughter'],
  [['grandchildren', 'grandchild', 'grandkids', 'grandkid'], 'grandchild', 'Grandchild'],
  [['aunt', 'aunts', 'auntie'], 'auntuncle', 'Aunt'],
  [['uncle', 'uncles'], 'auntuncle', 'Uncle'],
  [['cousin', 'cousins'], 'cousin', 'Cousin'],
  [['niece', 'nieces'], 'niecenephew', 'Niece'],
  [['nephew', 'nephews'], 'niecenephew', 'Nephew'],
]
const squash = (w: string) => w.toLowerCase().replace(/[\s\-’']+/g, '')
const ROLE_FORMS = new Map<string, { rel: Rel; label: string }>()
for (const [forms, rel, label] of ROLE_TABLE) for (const f of forms) ROLE_FORMS.set(squash(f), { rel, label })
const roleInfo = (w: string) => ROLE_FORMS.get(squash(w))

/** Words that stand for a person by role when used like a name ("Mom and Dad married in 1940"). */
const BARE = new Map<string, string>([['mom', 'mother'], ['mother', 'mother'], ['mama', 'mother'], ['mommy', 'mother'], ['momma', 'mother'], ['dad', 'father'], ['father', 'father'], ['daddy', 'father'], ['papa', 'father']])

// Case-insensitive piece of pattern for a word ("in-law" also matches "in law" and "inlaw").
const ci = (w: string) => w.split('').map((c) => (/[a-z]/i.test(c) ? `[${c.toLowerCase()}${c.toUpperCase()}]` : c === ' ' || c === '-' ? '[\\s-]?' : c === "'" ? "['’]" : c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('')
const KW = (ws: string[]) => `(?:${ws.map(ci).join('|')})(?![a-zA-Z])`
const ROLE = `(?:${[...ROLE_TABLE.flatMap(([f]) => f)].sort((a, b) => b.length - a.length).map(ci).join('|')})(?![a-zA-Z])`

const NAME_WORD = "[A-Z][a-zA-Z'’\\-]+"
const NAME = `${NAME_WORD}(?:\\s+(?:${NAME_WORD}|Jr\\.?|Sr\\.?|III|II|IV)){0,3}(?![a-zA-Z'’\\-])`
const ITEM = `${NAME}(?:\\s*\\([^()]{0,40}\\))?`
const LIST = `${ITEM}(?:\\s*,\\s*${ITEM})*(?:\\s*,?\\s*(?:and|&)\\s+${ITEM})?`

const NOT_NAMES = new Set(['I', 'My', 'Our', 'The', 'And', 'Also', 'Both', 'We', 'They', 'He', 'She', 'His', 'Her', 'Their', 'Then', 'Later', 'When', 'After', 'Before', 'So', 'But', 'Well', 'Oh', 'Yes', 'No', 'In', 'On', 'At', 'Of', 'From', 'With', 'This', 'That', 'There', 'Here', 'Now', 'Today', 'Years', 'God', 'Lord', 'Jesus', 'Christ', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Christmas', 'Easter', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'Mr', 'Mrs', 'Ms', 'Aunt', 'Uncle', 'Grandma', 'Grandpa', 'Cousin', 'Brother', 'Sister'])

// ---------- Pass 1: sentences → facts ----------

type Ref = { k: 'self' } | { k: 'name'; name: string } | { k: 'role'; of: Ref[]; rel: Rel; label: string; soft?: boolean }
interface Fact { subject: Ref[]; rel: Rel; label: string; people: Ref[] }
interface YearFact { who: Ref[]; born?: string; died?: string }
interface State { facts: Fact[]; years: YearFact[]; lastPerson: Ref[]; lastGroup: Ref[] }

const SELF: Ref = { k: 'self' }
const partnerOf = (of: Ref[]): Ref => ({ k: 'role', of, rel: 'spouse', label: 'Partner', soft: true })

function cleanName(raw: string) {
  const words = raw.replace(/['’]s$/, '').trim().split(/\s+/).filter(Boolean)
  while (words.length && NOT_NAMES.has(words[0].replace(/[.,]$/, ''))) words.shift()
  while (words.length && NOT_NAMES.has(words[words.length - 1].replace(/[.,]$/, ''))) words.pop()
  return words.join(' ')
}

function parseYears(t: string): { born?: string; died?: string } {
  const ys = t.match(/\d{4}/g) ?? []
  if (!ys.length) return {}
  if (ys.length === 1 && /\b(d\.|died|passed|death)/i.test(t)) return { died: ys[0] }
  return { born: ys[0], died: ys[1] }
}

function refFor(name: string): Ref {
  const bare = BARE.get(name.toLowerCase())
  if (bare) { const r = roleInfo(bare)!; return { k: 'role', of: [SELF], rel: r.rel, label: r.label } }
  return { k: 'name', name }
}

const COUNTS: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }

/** "Frank and Rose Nowak (1890–1960)" → refs, plus any years given in parentheses. `expect` is a count that was said ("three kids"). */
function listRefs(src: string, st: State, expect = 0): Ref[] {
  const safe = src.replace(/\(([^()]*)\)/g, (m) => m.replace(/,/g, ';'))
  const items: { name: string; years?: string }[] = []
  for (const raw of safe.split(/\s*,\s*(?:and\s+|&\s+)?|\s+(?:and|&)\s+/)) {
    const m = raw.match(/^(.*?)\s*\(([^()]*)\)\s*$/)
    const name = cleanName(m ? m[1] : raw)
    if (name) items.push({ name, years: m?.[2] })
  }
  // Said without commas ("three kids Tom Lisa and Mark"): split names until the count matches.
  while (expect > items.length && items.some((it) => it.name.includes(' '))) {
    const i = items.findIndex((it) => it.name.includes(' '))
    const [firstWord, ...rest] = items[i].name.split(' ')
    items.splice(i, 1, { name: firstWord }, { name: rest.join(' '), years: items[i].years })
  }
  // Shared family name: "Frank and Rose Nowak" → Frank Nowak and Rose Nowak.
  const last = items[items.length - 1]
  if (items.length >= 2 && last && last.name.split(' ').length >= 2 && !BARE.has(last.name.toLowerCase())) {
    const surname = last.name.split(' ').slice(-1)[0]
    for (const it of items.slice(0, -1)) if (it.name.split(' ').length === 1 && !BARE.has(it.name.toLowerCase())) it.name = `${it.name} ${surname}`
  }
  return items.map((it) => {
    const ref = refFor(it.name)
    if (it.years) st.years.push({ who: [ref], ...parseYears(it.years) })
    return ref
  })
}

function possessor(word: string, st: State): Ref[] {
  const w = word.toLowerCase()
  if (w === 'my') return [SELF]
  if (w === 'our') return [SELF, partnerOf([SELF])]
  if (w === 'his' || w === 'her') return st.lastPerson
  if (w === 'their') return st.lastGroup
  return []
}

function subjectRefs(txt: string, st: State): Ref[] {
  const t = txt.trim()
  const low = t.toLowerCase()
  if (low === 'i' || low === 'me') return [SELF]
  if (low === 'we') return [SELF, partnerOf([SELF])]
  if (low === 'they') return st.lastGroup
  if (low === 'he' || low === 'she') return st.lastPerson
  const m = t.match(/^(my|our)\s+(.+)$/i)
  if (m) { const r = roleInfo(m[2]); return r ? [{ k: 'role', of: possessor(m[1], st), rel: r.rel, label: r.label }] : [] }
  const refs = listRefs(t, st)
  if (!refs.length && /^(he|she)$/i.test(t)) return st.lastPerson
  return refs
}

function addFact(st: State, subject: Ref[], roleWord: string, people: Ref[]) {
  const r = roleInfo(roleWord)
  if (!r || !subject.length || !people.length) return
  st.facts.push({ subject, rel: r.rel, label: r.label, people })
  st.lastPerson = people.length === 1 ? people : subject.length === 1 ? subject : st.lastPerson
  st.lastGroup = people.length > 1 ? people : subject.length > 1 ? subject : st.lastGroup
}

const P = {
  poss: new RegExp(
    `(?:\\b(?<poss>${KW(['my', 'our', 'his', 'her', 'their'])})\\s+(?:(?<chain>${ROLE})(?:['’]s|s)\\s+)?|\\b(?<owner>${NAME})['’]s\\s+)` +
    `(?<role>${ROLE})(?:\\s*,\\s*(?<lista>${LIST})(?![a-zA-Z'’\\-])(?!\\s+${KW(['is', 'was', 'were', 'are'])}\\s+${KW(['my', 'our', 'the'])})` +
    `|\\s*(?::|-|\\b${KW(['is', 'are', 'was', 'were', 'named', 'called', 'include', 'includes', 'included'])}|(?:['’]s\\s+)?\\b${KW(['name', 'names'])}\\s+${KW(['is', 'are', 'was', 'were'])})?\\s*(?<listb>${LIST}))`, 'g'),
  have: new RegExp(`(?:^|[,;:]\\s*|\\s(?:${KW(['and', 'but', 'so'])})\\s+)(?<subj>\\b${KW(['I', 'we', 'they', 'he', 'she'])}|\\b${KW(['my', 'our'])}\\s+${ROLE}|${LIST})\\s+(?:${KW(['also', 'both', 'still'])}\\s+)?\\b${KW(['have', 'has', 'had'])}`, 'g'),
  item: new RegExp(`(?:\\b(?<count>${KW(['a', 'an', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'twin'])}|\\d+)\\s+)?\\b(?<role>${ROLE})\\s*(?:,|:|-|\\b${KW(['named', 'called'])}|\\b(?:${KW(['who'])}\\s+)?${KW(['are', 'is', 'were', 'was'])}(?:\\s+${KW(['named', 'called'])})?)?\\s*(?<list>${LIST})`, 'g'),
  reverse: new RegExp(
    `(?<who>${LIST}|\\b${KW(['I'])})\\s*(?:,\\s*)?(?:\\b${KW(['is', 'are', 'was', 'were', 'am'])}|['’]m|,)\\s+(?:${KW(['also', 'both'])}\\s+)?` +
    `(?:\\b(?<poss>${KW(['my', 'our'])})|(?<owner>${NAME})['’]s|\\b(?<the>${KW(['the'])}))\\s+` +
    `(?:${KW(['only', 'oldest', 'youngest', 'eldest', 'older', 'younger', 'middle', 'first', 'second', 'third', 'late', 'beloved', 'baby', 'big', 'little'])}\\s+)?` +
    `(?<role>${ROLE})(?!['’]s)(?!\\s+[A-Z][a-z])(?:\\s+${KW(['of'])}\\s+(?<of>${LIST}|\\b${KW(['me'])}))?`, 'g'),
  married: new RegExp(
    `(?<subj>\\b${KW(['I', 'we', 'they', 'he', 'she'])}|\\b${KW(['my'])}\\s+${ROLE}|${LIST})(?:['’]m)?\\s+` +
    `(?:${KW(['am', 'is', 'was', 'were', 'are', 'got', 'have', 'has', 'had', 'been', 'also', 'later', 'eventually', 'then', 'both'])}\\s+)*` +
    `\\b${KW(['married', 'wed', 'marry'])}(?:\\s+${KW(['to', 'with'])})?(?:\\s+(?<obj>\\b${KW(['my'])}\\s+${ROLE}|${LIST}))?`, 'g'),
  childrenOf: new RegExp(`\\b(?:${KW(['the'])}\\s+)?(?<role>${ROLE})\\s+${KW(['of'])}\\s+(?<of>${LIST})\\s*(?:\\b${KW(['are', 'were', 'is', 'was', 'include', 'included'])}|:|,)\\s*(?<list>${LIST})`, 'g'),
  side: new RegExp(
    `\\b(?:${KW(['my'])}\\s+)?(?:(?<mp>${KW(['maternal', 'paternal'])})\\s+(?<role1>${ROLE})|(?<role2>${ROLE})\\s+${KW(['on'])}\\s+(?:${KW(['my'])}\\s+)?(?<side>${ROLE})(?:['’]s|s)?\\s+${KW(['side'])})` +
    `\\s*(?:,|:|-|\\b${KW(['are', 'were', 'is', 'was', 'named'])})?\\s*(?<list>${LIST})`, 'g'),
  born: new RegExp(`(?:(?<subj>${NAME}|\\b${KW(['I'])}|\\b${KW(['my'])}\\s+${ROLE}|\\b${KW(['he', 'she'])})\\s*,?\\s+(?:${KW(['who'])}\\s+)?(?:${KW(['was', 'is'])}\\s+)?|\\b${KW(['and'])}\\s+(?:${KW(['was'])}\\s+)?)${KW(['born'])}\\s+(?:${KW(['on', 'in', 'around', 'about'])}\\s+)?(?<when>[^,.;()]*?\\d{4})`, 'g'),
  died: new RegExp(`(?:(?<subj>${NAME}|\\b${KW(['my'])}\\s+${ROLE}|\\b${KW(['he', 'she'])})\\s*,?\\s+(?:${KW(['who'])}\\s+)?|\\b${KW(['and'])}\\s+)(?:${KW(['died', 'passed away', 'passed on', 'passed'])})\\s+(?:${KW(['on', 'in', 'around', 'about'])}\\s+)?(?<when>[^,.;()]*?\\d{4})`, 'g'),
}

function parseSentence(s: string, st: State) {
  type M = { at: number; run: () => void }
  const ms: M[] = []
  const each = (re: RegExp, fn: (g: Record<string, string | undefined>, m: RegExpExecArray) => void) => {
    re.lastIndex = 0
    for (let m = re.exec(s); m; m = re.exec(s)) { const mm = m; ms.push({ at: m.index, run: () => fn(mm.groups ?? {}, mm) }); if (m[0].length === 0) re.lastIndex++ }
  }

  each(P.poss, (g) => {
    const owner = g.owner ? listRefs(g.owner, st) : possessor(g.poss!, st)
    const base = g.chain ? (() => { const r = roleInfo(g.chain!)!; return [{ k: 'role', of: owner, rel: r.rel, label: r.label } as Ref] })() : owner
    addFact(st, base, g.role!, listRefs((g.lista ?? g.listb)!, st))
  })

  // "I have a brother named Joe and two sisters, Anna and Mary" — every item belongs to the same subject.
  P.have.lastIndex = 0
  const anchors: RegExpExecArray[] = []
  for (let m = P.have.exec(s); m; m = P.have.exec(s)) anchors.push(m)
  anchors.forEach((a, i) => {
    const start = a.index + a[0].length
    const rest = s.slice(start, anchors[i + 1]?.index ?? s.length)
    const subjTxt = a.groups!.subj!
    P.item.lastIndex = 0
    for (let m = P.item.exec(rest); m; m = P.item.exec(rest)) {
      const g = m.groups!
      ms.push({ at: start + m.index, run: () => addFact(st, subjectRefs(subjTxt, st), g.role!, listRefs(g.list!, st, COUNTS[g.count?.toLowerCase() ?? ''] ?? Number(g.count) ?? 0)) })
    }
  })

  each(P.reverse, (g) => {
    const who = g.who!.trim().toLowerCase() === 'i' ? [SELF] : listRefs(g.who!, st)
    let subject: Ref[] = []
    if (g.of) subject = g.of.trim().toLowerCase() === 'me' ? [SELF] : listRefs(g.of, st)
    else if (g.poss) subject = possessor(g.poss, st)
    else if (g.owner) subject = listRefs(g.owner, st)
    addFact(st, subject, g.role!, who)
  })

  each(P.married, (g) => {
    const subj = subjectRefs(g.subj!, st)
    const obj = g.obj ? subjectRefs(g.obj, st) : []
    if (obj.length) { st.facts.push({ subject: subj, rel: 'spouse', label: 'Partner', people: obj }); st.lastGroup = [...subj, ...obj]; st.lastPerson = subj }
    else if (subj.length === 2) { st.facts.push({ subject: [subj[0]], rel: 'spouse', label: 'Partner', people: [subj[1]] }); st.lastGroup = subj }
  })

  each(P.childrenOf, (g) => addFact(st, listRefs(g.of!, st), g.role!, listRefs(g.list!, st)))

  each(P.side, (g) => {
    const sideWord = g.mp ? (g.mp.toLowerCase() === 'maternal' ? 'mother' : 'father') : g.side!
    const sr = roleInfo(sideWord)
    if (!sr || sr.rel !== 'parent') return
    const parent: Ref = { k: 'role', of: [SELF], rel: 'parent', label: sr.label }
    const people = listRefs(g.list!, st)
    if (people.length) { st.facts.push({ subject: [parent], rel: 'parent', label: 'Parent', people }); st.lastGroup = people.length > 1 ? people : st.lastGroup; st.lastPerson = people.length === 1 ? people : st.lastPerson }
  })

  const yearFor = (field: 'born' | 'died') => (g: Record<string, string | undefined>) => {
    const who = g.subj ? subjectRefs(g.subj, st) : st.lastPerson
    const when = g.when!.trim().replace(/^(on|in)\s+/i, '')
    if (who.length) { st.years.push({ who, [field]: when }); st.lastPerson = who }
  }
  each(P.born, yearFor('born'))
  each(P.died, yearFor('died'))

  ms.sort((a, b) => a.at - b.at).forEach((m) => m.run())
}

// ---------- Pass 2: facts → people and connections ----------

const lc = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

export function parseFamilyText(text: string, ctx: { people: Person[]; relations: Relation[]; selfName: string }): FamilyDraft {
  const st: State = { facts: [], years: [], lastPerson: [], lastGroup: [] }
  const sentences = text.replace(/\r/g, '').split(/(?<=[.!?;])\s+|\n+/).map((x) => x.trim()).filter(Boolean)
  for (const s of sentences) parseSentence(s.replace(/[.!?;]+$/, ''), st)
  return buildDraft(st.facts, st.years, ctx)
}

function buildDraft(facts: Fact[], years: YearFact[], ctx: { people: Person[]; relations: Relation[]; selfName: string }): FamilyDraft {
  const people = new Map<string, DraftPerson>()
  const existingSelf = ctx.people.find((p) => p.isSelf)
  const selfKey = existingSelf ? `p:${existingSelf.id}` : 'self'
  people.set(selfKey, { key: selfKey, name: existingSelf?.name ?? ctx.selfName, isSelf: true, existingId: existingSelf?.id })
  let usedSelf = false

  // Names → one key per person. "Joe" and "Joe Kowalski" are the same person when that's the only Joe.
  const allNames = new Set<string>()
  const walk = (r: Ref) => { if (r.k === 'name') allNames.add(r.name); if (r.k === 'role') r.of.forEach(walk) }
  facts.forEach((f) => [...f.subject, ...f.people].forEach(walk))
  years.forEach((y) => y.who.forEach(walk))
  const full = [...allNames].filter((n) => n.split(' ').length > 1)
  const existing = ctx.people.filter((p) => !p.circle || p.circle === 'family')
  const keyOfName = new Map<string, string>()
  const canonical = (n: string) => {
    if (n.split(' ').length > 1) return n
    const same = full.filter((f) => lc(f.split(' ')[0]) === lc(n))
    return same.length === 1 ? same[0] : n
  }
  const keyFor = (raw: string): string => {
    const name = canonical(raw)
    const k0 = keyOfName.get(lc(name))
    if (k0) return k0
    if (lc(name) === lc(ctx.selfName) || (existingSelf && lc(name) === lc(existingSelf.name))) { keyOfName.set(lc(name), selfKey); return selfKey }
    const words = name.split(' ')
    const ex = existing.find((p) => lc(p.name) === lc(name))
      ?? (words.length === 1 ? (() => { const c = existing.filter((p) => lc(p.name.split(' ')[0]) === lc(name)); return c.length === 1 ? c[0] : undefined })()
        : (() => { const c = existing.filter((p) => p.name.split(' ').length === 1 && lc(p.name) === lc(words[0])); return c.length === 1 ? c[0] : undefined })())
    const key = ex ? (ex.isSelf ? selfKey : `p:${ex.id}`) : `n:${lc(name)}`
    if (!people.has(key)) people.set(key, { key, name: ex && ex.name.split(' ').length >= words.length ? ex.name : name, existingId: ex?.id })
    keyOfName.set(lc(name), key)
    return key
  }

  const links = new Map<string, DraftLink>()
  const has = (type: DraftLink['type'], a: string, b: string) => links.has(linkKey(type, a, b))
  const linkKey = (type: DraftLink['type'], a: string, b: string) => (type === 'parent' ? `parent:${a}>${b}` : `${type}:${[a, b].sort().join('|')}`)
  const addLink = (type: DraftLink['type'], a: string, b: string, why?: string) => {
    if (a === b) return
    const key = linkKey(type, a, b)
    if (!links.has(key)) links.set(key, { key, a, type, b, why })
  }

  // Keys → existing ids, so tree connections count too.
  const idOf = (k: string) => people.get(k)?.existingId
  const treeParents = (k: string) => { const id = idOf(k); return id ? parentsOf(id, ctx.relations).map((x) => (ctx.people.find((p) => p.id === x)?.isSelf ? selfKey : `p:${x}`)) : [] }
  const treeSpouses = (k: string) => { const id = idOf(k); return id ? spousesOf(id, ctx.relations).map((x) => `p:${x}`) : [] }
  const treeChildren = (k: string) => { const id = idOf(k); return id ? childrenOf(id, ctx.relations).map((x) => `p:${x}`) : [] }
  const ensureExisting = (k: string) => { if (!people.has(k)) { const p = ctx.people.find((x) => `p:${x.id}` === k); if (p) people.set(k, { key: k, name: p.name, existingId: p.id, isSelf: p.isSelf }) } return k }
  const parentsNow = (k: string) => [...new Set([...[...links.values()].filter((l) => l.type === 'parent' && l.b === k).map((l) => l.a), ...treeParents(k)])]
  const spousesNow = (k: string) => [...new Set([...[...links.values()].filter((l) => l.type === 'spouse' && (l.a === k || l.b === k)).map((l) => (l.a === k ? l.b : l.a)), ...treeSpouses(k)])]
  const childrenNow = (k: string) => [...new Set([...[...links.values()].filter((l) => l.type === 'parent' && l.a === k).map((l) => l.b), ...treeChildren(k)])]

  // Role references ("my mom") → the person named in that role, or a placeholder to be named.
  const resolving = new Set<Ref>()
  const resolve = (r: Ref): string[] => {
    if (r.k === 'self') { usedSelf = true; return [selfKey] }
    if (r.k === 'name') return [keyFor(r.name)]
    if (resolving.has(r)) return []
    resolving.add(r)
    const of = r.of.flatMap(resolve)
    resolving.delete(r)
    if (!of.length) return []
    const found = new Set<string>()
    for (const f of facts) {
      if (f.rel !== r.rel) continue
      const labelOk = r.label === f.label || r.label === 'Partner' || r.label === 'Parent' || (r.rel === 'sibling' && r.label === 'Sibling')
      if (!labelOk) continue
      if (f.subject.some((s) => s !== r && resolveShallow(s).some((k) => of.includes(k)))) f.people.forEach((p) => { if (p.k === 'name') found.add(keyFor(p.name)) })
    }
    if (r.rel === 'spouse') for (const o of of) spousesNow(o).forEach((k) => found.add(ensureExisting(k)))
    if (found.size) return [...found]
    if (r.soft || !['parent', 'child', 'sibling', 'spouse'].includes(r.rel)) return []
    // Not named anywhere: a placeholder the storyteller can name (or match to someone) before adding.
    const key = `ph:${r.label}:${of.join(',')}`
    if (!people.has(key)) {
      const ofName = of[0] === selfKey ? 'Your' : `${people.get(of[0])?.name.split(' ')[0] || 'Their'}’s`
      people.set(key, { key, name: '', placeholder: true, label: `${ofName} ${r.label.toLowerCase()}` })
      for (const o of of) {
        if (r.rel === 'parent') addLink('parent', key, o)
        if (r.rel === 'child') addLink('parent', o, key)
        if (r.rel === 'spouse') addLink('spouse', key, o)
        if (r.rel === 'sibling') addLink('sibling', key, o)
      }
    }
    return [key]
  }
  const resolveShallow = (r: Ref): string[] => (r.k === 'self' ? [selfKey] : r.k === 'name' ? [keyFor(r.name)] : resolve(r))

  const whose = (s: string) => { const sp = people.get(s); return s === selfKey ? '' : sp?.name ? sp.name.split(' ')[0] : (sp?.label ?? '').toLowerCase() }
  const labelFor = (k: string, label: string, s: string) => {
    const p = people.get(k)
    if (p && !p.label && !p.isSelf) p.label = s === selfKey ? label : `${label} of ${whose(s)}`
  }

  const childFacts: { s: string; c: string; single: boolean }[] = []
  const later: [Fact, string[], string[]][] = []
  for (const f of facts) {
    const S = [...new Set(f.subject.flatMap(resolve))]
    const Pp = [...new Set(f.people.flatMap(resolve))]
    for (const p of Pp) for (const s of S) {
      if (f.rel === 'parent') { addLink('parent', p, s); labelFor(p, f.label, s) }
      else if (f.rel === 'child') { addLink('parent', s, p); labelFor(p, f.label, s); childFacts.push({ s, c: p, single: S.length === 1 }) }
      else if (f.rel === 'sibling') { addLink('sibling', p, s); labelFor(p, f.label, s) }
      else if (f.rel === 'spouse') { addLink('spouse', p, s); labelFor(p, f.label, s) }
    }
    // "My parents were Stanley and Helen" — the two named parents are partners.
    if (f.rel === 'parent' && f.label === 'Parent' && Pp.length === 2) addLink('spouse', Pp[0], Pp[1])
    if (!['parent', 'child', 'sibling', 'spouse'].includes(f.rel)) later.push([f, S, Pp])
  }
  // In-laws and relatives that can't be placed without more detail.
  for (const [f, S, Pp] of later) for (const p of Pp) for (const s of S) {
    if (f.rel === 'parentinlaw' && spousesNow(s).length === 1) { addLink('parent', p, ensureExisting(spousesNow(s)[0])); labelFor(p, f.label, s) }
    else if (f.rel === 'childinlaw' && childrenNow(s).length === 1) { addLink('spouse', p, ensureExisting(childrenNow(s)[0])); labelFor(p, f.label, s) }
    else { labelFor(p, f.label, s); const d = people.get(p); if (d && !d.existingId) d.unconnected = true }
  }

  // Likely extras, offered as tickable suggestions.
  const name = (k: string) => k === selfKey ? 'you' : people.get(k)?.name.split(' ')[0] || (people.get(k)?.label ?? 'them').toLowerCase()
  const poss = (k: string) => (k === selfKey ? 'your' : `${name(k)}’s`)
  for (const k of people.keys()) {
    const ps = parentsNow(k)
    if (ps.length === 2 && !has('spouse', ps[0], ps[1]) && !treeSpouses(ps[0]).includes(ps[1])) addLink('spouse', ps[0], ps[1], `both are ${poss(k)} parents`)
  }
  for (const { s, c, single } of childFacts) {
    if (!single) continue
    const sp = spousesNow(s)
    if (sp.length === 1 && !parentsNow(c).includes(sp[0])) addLink('parent', ensureExisting(sp[0]), c, `${name(sp[0])} is ${poss(s)} partner`)
  }

  // Years.
  for (const y of years) for (const k of y.who.flatMap(resolveShallow)) {
    const p = people.get(k)
    if (!p) continue
    if (y.born) p.born = y.born
    if (y.died) p.died = y.died
  }

  // Leave out connections the tree already has.
  const exists = (l: DraftLink) => {
    const a = idOf(l.a), b = idOf(l.b)
    if (!a || !b) return false
    return ctx.relations.some((r) => (l.type === 'parent' ? r.type === 'parent' && r.from === a && r.to === b : r.type === l.type && ((r.from === a && r.to === b) || (r.from === b && r.to === a))))
      || (l.type === 'sibling' && parentsOf(a, ctx.relations).some((x) => parentsOf(b, ctx.relations).includes(x)))
  }
  const finalLinks = [...links.values()].filter((l) => !exists(l))
  const used = new Set(finalLinks.flatMap((l) => [l.a, l.b]))
  const finalPeople = [...people.values()].filter((p) => p.isSelf ? usedSelf || used.has(p.key) : true)
    .filter((p) => !p.isSelf || used.has(p.key) || usedSelf)
  // Put the storyteller first, then people in the order they were mentioned.
  finalPeople.sort((a, b) => Number(!!b.isSelf) - Number(!!a.isSelf))
  return { people: finalPeople, links: finalLinks, selfKey, usedSelf }
}

// ---------- Family tree files (GEDCOM, from Ancestry, FamilySearch, MyHeritage…) ----------

const MONTHS: Record<string, string> = { JAN: 'Jan', FEB: 'Feb', MAR: 'Mar', APR: 'Apr', MAY: 'May', JUN: 'Jun', JUL: 'Jul', AUG: 'Aug', SEP: 'Sep', OCT: 'Oct', NOV: 'Nov', DEC: 'Dec' }
const gedDate = (d: string) => d.replace(/\b(ABT|EST|CAL)\b/g, 'about').replace(/\bBEF\b/g, 'before').replace(/\bAFT\b/g, 'after').replace(/\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\b/g, (m) => MONTHS[m]).trim()

export function parseGedcom(text: string, ctx: { people: Person[]; relations: Relation[]; selfName: string }): FamilyDraft {
  const indi = new Map<string, { name: string; born?: string; died?: string }>()
  const fams: { husb?: string; wife?: string; kids: string[] }[] = []
  let cur: { kind: 'indi' | 'fam' | 'other'; id: string } = { kind: 'other', id: '' }
  let sub = ''
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.trim().match(/^(\d+)\s+(@[^@]+@)?\s*(\w+)\s*(.*)$/)
    if (!m) continue
    const [, lvl, xref, tag, val] = m
    if (lvl === '0') {
      if (tag === 'INDI' && xref) { cur = { kind: 'indi', id: xref }; indi.set(xref, { name: '' }) }
      else if (tag === 'FAM') { cur = { kind: 'fam', id: String(fams.length) }; fams.push({ kids: [] }) }
      else cur = { kind: 'other', id: '' }
      continue
    }
    if (lvl === '1') sub = tag
    if (cur.kind === 'indi') {
      const p = indi.get(cur.id)!
      if (lvl === '1' && tag === 'NAME' && !p.name) p.name = val.replace(/\//g, ' ').replace(/\s+/g, ' ').trim()
      if (lvl === '2' && tag === 'DATE' && sub === 'BIRT') p.born = gedDate(val)
      if (lvl === '2' && tag === 'DATE' && sub === 'DEAT') p.died = gedDate(val)
    } else if (cur.kind === 'fam' && lvl === '1') {
      const f = fams[Number(cur.id)]
      if (tag === 'HUSB') f.husb = val.trim()
      if (tag === 'WIFE') f.wife = val.trim()
      if (tag === 'CHIL') f.kids.push(val.trim())
    }
  }
  const facts: Fact[] = []
  const years: YearFact[] = []
  const ref = (x?: string): Ref | null => { const n = x && indi.get(x)?.name; return n ? { k: 'name', name: n } : null }
  for (const [id, p] of indi) if (p.name && (p.born || p.died)) years.push({ who: [ref(id)!], born: p.born, died: p.died })
  for (const f of fams) {
    const parents = [ref(f.husb), ref(f.wife)].filter(Boolean) as Ref[]
    if (parents.length === 2) facts.push({ subject: [parents[0]], rel: 'spouse', label: 'Partner', people: [parents[1]] })
    const kids = f.kids.map(ref).filter(Boolean) as Ref[]
    for (const k of kids) if (parents.length) facts.push({ subject: [k], rel: 'parent', label: 'Parent', people: parents })
  }
  // Everyone in the file appears, even people without a family record.
  const lone = [...indi.values()].filter((p) => p.name)
  const draft = buildDraft(facts, years, ctx)
  const named = new Set(draft.people.map((p) => lc(p.name)))
  for (const p of lone) if (!named.has(lc(p.name))) draft.people.push({ key: `n:${lc(p.name)}`, name: p.name, born: p.born, died: p.died, unconnected: true })
  return draft
}

/** Plain text from a Word document (.docx). */
export async function docxText(file: File): Promise<string> {
  const { unzipSync, strFromU8 } = await import('fflate')
  const xml = unzipSync(new Uint8Array(await file.arrayBuffer()))['word/document.xml']
  if (!xml) throw new Error('This Word file couldn’t be read.')
  return strFromU8(xml).replace(/<\/w:p>/g, '\n').replace(/<w:tab\/>/g, ' ').replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
}

/** Instructions to paste into an AI app along with a picture or PDF of a family tree. */
export const TREE_PICTURE_PROMPT = `I'm attaching a picture of my family tree. Please write it out as simple sentences, one per line, using everyone's full name, with birth and death years in parentheses when the picture shows them. Use only these kinds of sentences:

NAME (YEAR–YEAR) is married to NAME (YEAR–YEAR).
The children of NAME and NAME are NAME (YEAR), NAME (YEAR) and NAME (YEAR).
The children of NAME are NAME and NAME.

Only write what the picture shows. Don't add anyone who isn't in it.`
