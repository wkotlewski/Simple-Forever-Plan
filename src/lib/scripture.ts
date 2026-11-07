/**
 * Scripture lookups for Words to Keep:
 * - a reference ("Psalm 23:4") → the words, from bible-api.com (public-domain translations);
 * - remembered words ("walk through the valley") → which verse it is, from bolls.life's search.
 * Only the reference or the words typed are sent.
 */

export const BOOKS = ['Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy', 'Joshua', 'Judges', 'Ruth', '1 Samuel', '2 Samuel', '1 Kings', '2 Kings',
  '1 Chronicles', '2 Chronicles', 'Ezra', 'Nehemiah', 'Esther', 'Job', 'Psalm', 'Proverbs', 'Ecclesiastes', 'Song of Solomon', 'Isaiah', 'Jeremiah',
  'Lamentations', 'Ezekiel', 'Daniel', 'Hosea', 'Joel', 'Amos', 'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah',
  'Malachi', 'Matthew', 'Mark', 'Luke', 'John', 'Acts', 'Romans', '1 Corinthians', '2 Corinthians', 'Galatians', 'Ephesians', 'Philippians',
  'Colossians', '1 Thessalonians', '2 Thessalonians', '1 Timothy', '2 Timothy', 'Titus', 'Philemon', 'Hebrews', 'James', '1 Peter', '2 Peter',
  '1 John', '2 John', '3 John', 'Jude', 'Revelation']

export const TRANSLATIONS = [
  { id: 'kjv', label: 'King James (KJV)', search: 'KJV' },
  { id: 'web', label: 'World English (WEB)', search: 'WEB' },
] as const
export type TranslationId = typeof TRANSLATIONS[number]['id']

/** Does this look like a verse reference (book + chapter, optionally verses)? */
export const looksLikeReference = (s?: string) => !!s && /^\s*([1-3]\s*)?[A-Za-z][A-Za-z .]+\s+\d+(\s*[:.]\s*\d+(\s*[-–]\s*\d+)?)?\s*$/.test(s)

const clean = (t: string) => t.replace(/<S>\d+<\/S>/g, '').replace(/<\/?[a-z]+[^>]*>/gi, '').replace(/\s+/g, ' ').trim()

/** The words of a verse or passage. */
export async function versesFor(reference: string, translation: TranslationId = 'kjv'): Promise<{ reference: string; text: string } | null> {
  try {
    const r = await fetch(`https://bible-api.com/${encodeURIComponent(reference.trim().replace(/\s*[–]\s*/g, '-'))}?translation=${translation}`)
    if (!r.ok) return null
    const j = await r.json()
    const text = clean((j.verses ?? []).map((v: any) => v.text).join(' ') || j.text || '')
    return text ? { reference: String(j.reference ?? reference).replace(/^Psalms /, 'Psalm '), text } : null
  } catch { return null }
}

/** Verses that contain the words someone remembers, best matches first. */
export async function findVerse(words: string, translation: TranslationId = 'kjv'): Promise<{ reference: string; text: string }[]> {
  const q = words.replace(/[“”"‘’.,;:!?]/g, ' ').replace(/\s+/g, ' ').trim()
  if (q.split(' ').length < 3) return []
  const code = TRANSLATIONS.find((t) => t.id === translation)?.search ?? 'KJV'
  const search = async (text: string) => {
    const r = await fetch(`https://bolls.life/v2/find/${code}?search=${encodeURIComponent(text)}&match_case=false&match_whole=false&limit=5&page=1`)
    if (!r.ok) return []
    const j = await r.json()
    return (j.results ?? []).map((v: any) => ({ reference: `${BOOKS[v.book - 1] ?? 'Book ' + v.book} ${v.chapter}:${v.verse}`, text: clean(v.text) }))
  }
  try {
    let found = await search(q)
    // Remembered a little differently? Try the most distinctive part.
    if (!found.length) {
      const longest = q.split(' ').sort((a, b) => b.length - a.length).slice(0, 4).join(' ')
      found = await search(longest)
    }
    return found.slice(0, 5)
  } catch { return [] }
}
