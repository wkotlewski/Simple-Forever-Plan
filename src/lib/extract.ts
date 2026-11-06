/**
 * Notices things in a story answer that belong elsewhere in the plan:
 * scripture references → Words to Keep, songs that mattered → Words to Keep,
 * people (family, mentees, mentors, friends) → the Family Tree / People Who Mattered.
 * These are only suggestions; nothing is added until the storyteller confirms.
 */

export type Circle = 'family' | 'mentored' | 'mentor' | 'friend'

export type Suggestion =
  | { type: 'scripture'; key: string; ref: string; context: string }
  | { type: 'song'; key: string; title: string; artist?: string; context: string }
  | { type: 'person'; key: string; name: string; circle: Circle; relation: string; link?: FamilyLink; context: string }

/** How a family member connects to the storyteller, so they can be placed on the tree. */
export type FamilyLink = 'parent' | 'child' | 'spouse' | 'sibling' | 'grandparent' | 'grandchild' | 'other'

// ---------- Scripture ----------

const BOOKS: [string, string[]][] = [
  ['Genesis', ['gen']], ['Exodus', ['exod', 'ex']], ['Leviticus', ['lev']], ['Numbers', ['num']], ['Deuteronomy', ['deut']],
  ['Joshua', ['josh']], ['Judges', ['judg']], ['Ruth', []], ['1 Samuel', ['1 sam']], ['2 Samuel', ['2 sam']],
  ['1 Kings', []], ['2 Kings', []], ['1 Chronicles', ['1 chron']], ['2 Chronicles', ['2 chron']], ['Ezra', []],
  ['Nehemiah', ['neh']], ['Esther', ['esth']], ['Job', []], ['Psalm', ['psalms', 'ps', 'psa']], ['Proverbs', ['prov', 'proverb']],
  ['Ecclesiastes', ['eccl', 'eccles']], ['Song of Solomon', ['song of songs']], ['Isaiah', ['isa']], ['Jeremiah', ['jer']],
  ['Lamentations', ['lam']], ['Ezekiel', ['ezek']], ['Daniel', ['dan']], ['Hosea', ['hos']], ['Joel', []], ['Amos', []],
  ['Obadiah', ['obad']], ['Jonah', []], ['Micah', ['mic']], ['Nahum', ['nah']], ['Habakkuk', ['hab']], ['Zephaniah', ['zeph']],
  ['Haggai', ['hag']], ['Zechariah', ['zech']], ['Malachi', ['mal']], ['Matthew', ['matt', 'mt']], ['Mark', ['mk']],
  ['Luke', ['lk']], ['John', ['jn']], ['Acts', []], ['Romans', ['rom']], ['1 Corinthians', ['1 cor']], ['2 Corinthians', ['2 cor']],
  ['Galatians', ['gal']], ['Ephesians', ['eph']], ['Philippians', ['phil']], ['Colossians', ['col']],
  ['1 Thessalonians', ['1 thess']], ['2 Thessalonians', ['2 thess']], ['1 Timothy', ['1 tim']], ['2 Timothy', ['2 tim']],
  ['Titus', []], ['Philemon', ['philem']], ['Hebrews', ['heb']], ['James', ['jas']], ['1 Peter', ['1 pet']], ['2 Peter', ['2 pet']],
  ['1 John', []], ['2 John', []], ['3 John', []], ['Jude', []], ['Revelation', ['revelations', 'rev']],
]
const ORDINALS: Record<string, string> = { first: '1', second: '2', third: '3', i: '1', ii: '2', iii: '3' }
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const bookAlternatives = BOOKS.flatMap(([name, alts]) => [name, ...alts])
  .sort((a, b) => b.length - a.length)
  .map((b) => esc(b).replace(/^([123]) /, '(?:$1|first|second|third|i{1,3})\\s*'))
// e.g. "Psalm 23", "Psalm 23:4", "John 3:16-17", "1 Cor. 13:4-7", "Philippians 4 verse 13"
const SCRIPTURE = new RegExp(`\\b(${bookAlternatives.join('|')})\\.?\\s+(\\d{1,3})(?:\\s*(?::|,?\\s*verses?\\s*)\\s*(\\d{1,3})(?:\\s*[-–]\\s*(\\d{1,3}))?)?`, 'gi')

function canonicalBook(raw: string) {
  const norm = raw.toLowerCase().replace(/\./g, '').replace(/^(first|second|third|iii|ii|i)\s*/, (m) => `${ORDINALS[m.trim()]} `).replace(/\s+/g, ' ').trim()
  const hit = BOOKS.find(([name, alts]) => name.toLowerCase() === norm || alts.includes(norm))
  return hit?.[0]
}

// Single-word books that are also everyday names or words need more evidence than a number after them.
const AMBIGUOUS = new Set(['Mark', 'John', 'Job', 'Acts', 'James', 'Jude', 'Ruth', 'Daniel', 'Joel', 'Amos', 'Jonah', 'Titus', 'Luke', 'Numbers'])

export function findScriptures(text: string): Suggestion[] {
  const out: Suggestion[] = []
  for (const m of text.matchAll(SCRIPTURE)) {
    const book = canonicalBook(m[1])
    if (!book) continue
    const [, , ch, v1, v2] = m
    if (AMBIGUOUS.has(book) && !v1) continue // "John 3" alone could be anything; "John 3:16" is scripture
    if (Number(ch) > 150) continue
    const ref = `${book} ${ch}${v1 ? `:${v1}${v2 ? `–${v2}` : ''}` : ''}`
    out.push({ type: 'scripture', key: `scripture:${ref.toLowerCase()}`, ref, context: sentenceAround(text, m.index ?? 0) })
  }
  return out
}

/** Verse text from a public-domain translation (KJV) so it can be kept in Words to Keep. */
export async function fetchVerse(ref: string): Promise<string> {
  try {
    const q = encodeURIComponent(ref.replace('–', '-'))
    const res = await fetch(`https://bible-api.com/${q}?translation=kjv`)
    if (!res.ok) return ''
    const data = await res.json()
    return String(data.text ?? '').replace(/\s+/g, ' ').trim()
  } catch {
    return ''
  }
}

// ---------- Songs ----------

const QUOTED = /["“]([^"”\n]{2,80})["”]/g
const SONG_WORDS = /\b(song|songs|hymn|hymns|sang|sing|singing|sung|music|tune|played|record|album|radio|danced|dance|choir|lullaby)\b/i

export function findSongs(text: string): Suggestion[] {
  const out: Suggestion[] = []
  const add = (title: string, artist: string | undefined, at: number) => {
    const t = title.trim().replace(/[.,!?]$/, '')
    if (t.split(/\s+/).length > 12 || t.length < 2) return
    out.push({ type: 'song', key: `song:${t.toLowerCase()}`, title: t, artist: artist?.trim(), context: sentenceAround(text, at) })
  }
  // A quoted title near a song word: …our song was "Unchained Melody" by the Righteous Brothers
  for (const m of text.matchAll(QUOTED)) {
    const at = m.index ?? 0
    const near = text.slice(Math.max(0, at - 60), at + m[0].length + 40)
    if (!SONG_WORDS.test(near)) continue
    const after = text.slice(at + m[0].length, at + m[0].length + 50).match(/^\s*by\s+((?:the\s+)?[A-Z][\w'&.]*(?:\s+(?:[A-Z][\w'&.]*|the|and|&)){0,4})/)
    add(m[1], after?.[1], at)
  }
  // Unquoted: "the hymn Amazing Grace", "our song was Moon River", "she sang How Great Thou Art"
  const UNQUOTED = /\b(?:the\s+)?(?:hymn|song|lullaby)\s+(?:was\s+|called\s+)?([A-Z][\w']*(?:\s+(?:[A-Z][\w']*|of|the|a|in|on|my|to|and|is|thou|art)){0,6})/g
  for (const m of text.matchAll(UNQUOTED)) {
    const title = m[1].replace(/\s+(?:of|the|a|in|on|my|to|and|is)$/i, '')
    if (title.split(/\s+/).length >= 2) add(title, undefined, m.index ?? 0)
  }
  return out
}

// ---------- People ----------

const NAME = "((?:(?:Mr|Mrs|Ms|Miss|Dr|Pastor|Rev|Coach|Father|Sister|Brother|Aunt|Uncle|Grandma|Grandpa|Nana|Papa)\\.?\\s+)?[A-Z][a-z'’]+(?:\\s+[A-Z][a-z'’]+){0,2})"
const FAMILY: [RegExp, string, FamilyLink][] = [
  [/\bmy (?:mother|mom|mama|ma)\b/i, 'Mother', 'parent'], [/\bmy (?:father|dad|daddy|papa|pa)\b/i, 'Father', 'parent'],
  [/\bmy (?:husband)\b/i, 'Husband', 'spouse'], [/\bmy (?:wife)\b/i, 'Wife', 'spouse'],
  [/\bmy (?:son)\b/i, 'Son', 'child'], [/\bmy (?:daughter)\b/i, 'Daughter', 'child'],
  [/\bmy (?:brother)\b/i, 'Brother', 'sibling'], [/\bmy (?:sister)\b/i, 'Sister', 'sibling'],
  [/\bmy (?:grandmother|grandma|nana|granny)\b/i, 'Grandmother', 'grandparent'], [/\bmy (?:grandfather|grandpa|granddad)\b/i, 'Grandfather', 'grandparent'],
  [/\bmy (?:grandson)\b/i, 'Grandson', 'grandchild'], [/\bmy (?:granddaughter)\b/i, 'Granddaughter', 'grandchild'],
  [/\bmy (?:aunt|auntie)\b/i, 'Aunt', 'other'], [/\bmy (?:uncle)\b/i, 'Uncle', 'other'], [/\bmy (?:cousin)\b/i, 'Cousin', 'other'],
]
// Phrases that name someone outside the family who mattered.
const CIRCLES: [RegExp, Circle, string][] = [
  [new RegExp(`\\b(?:I|we)\\s+(?:mentored|coached|taught|trained|discipled|sponsored|took in|raised)\\s+(?:a\\s+(?:young\\s+)?(?:man|woman|boy|girl|kid)\\s+(?:named|called)\\s+)?${NAME}`, 'g'), 'mentored', 'Someone I mentored'],
  [new RegExp(`\\b[Mm]y\\s+(?:mentee|apprentice|student|protégé|protege)\\s*,?\\s+${NAME}`, 'g'), 'mentored', 'Someone I mentored'],
  [new RegExp(`\\b${NAME}\\s*,?\\s+(?:who|whom)\\s+I\\s+(?:mentored|coached|taught|trained|discipled)`, 'g'), 'mentored', 'Someone I mentored'],
  [new RegExp(`\\b[Mm]y\\s+(?:mentor|teacher|coach|pastor|boss|foreman|role model)\\s*,?\\s+${NAME}`, 'g'), 'mentor', 'My mentor'],
  [new RegExp(`\\b${NAME}\\s*,?\\s+(?:who\\s+)?(?:mentored|coached|taught)\\s+me\\b`, 'g'), 'mentor', 'My mentor'],
  [new RegExp(`\\b[Mm]y\\s+(?:best\\s+)?friend\\s*,?\\s+${NAME}`, 'g'), 'friend', 'Friend'],
]
const NOT_NAMES = new Set(['I', 'We', 'He', 'She', 'They', 'The', 'And', 'But', 'When', 'Then', 'God', 'Lord', 'Jesus', 'Christ', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Christmas', 'Easter', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'])

const cleanName = (n: string) => {
  const words = n.trim().split(/\s+/)
  while (words.length && NOT_NAMES.has(words[words.length - 1])) words.pop()
  return words.length && !NOT_NAMES.has(words[0]) ? words.join(' ') : ''
}

export function findPeople(text: string): Suggestion[] {
  const out: Suggestion[] = []
  for (const [re, circle, relation] of CIRCLES) {
    for (const m of text.matchAll(re)) {
      const name = cleanName(m[1])
      if (name) out.push({ type: 'person', key: `person:${name.toLowerCase()}`, name, circle, relation, context: sentenceAround(text, m.index ?? 0) })
    }
  }
  // Family: "my mother, Helen", "my brother Joe", "my wife Anna Marie"
  for (const [cue, relation, link] of FAMILY) {
    const re = new RegExp(`${cue.source.replace('\\bmy', '\\b[Mm]y')}\\s*,?\\s+${NAME}`, 'g')
    for (const m of text.matchAll(re)) {
      const name = cleanName(m[1])
      if (name) out.push({ type: 'person', key: `person:${name.toLowerCase()}`, name, circle: 'family', relation, link, context: sentenceAround(text, m.index ?? 0) })
    }
  }
  return out
}

// ---------- Shared ----------

function sentenceAround(text: string, at: number) {
  const start = Math.max(text.lastIndexOf('.', at - 1), text.lastIndexOf('!', at - 1), text.lastIndexOf('?', at - 1), text.lastIndexOf('\n', at - 1)) + 1
  const ends = ['.', '!', '?', '\n'].map((c) => text.indexOf(c, at)).filter((i) => i >= 0)
  const end = ends.length ? Math.min(...ends) + 1 : text.length
  return text.slice(start, end).trim().slice(0, 280)
}

/** Everything worth suggesting in one piece of text, without duplicates. */
export function findAll(text: string): Suggestion[] {
  const seen = new Set<string>()
  return [...findScriptures(text), ...findSongs(text), ...findPeople(text)].filter((s) => (seen.has(s.key) ? false : (seen.add(s.key), true)))
}
