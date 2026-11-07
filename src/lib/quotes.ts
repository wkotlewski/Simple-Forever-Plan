/**
 * Quote lookups for Words to Keep, using Wikiquote (only the typed words or name are sent):
 * - words someone remembers → who may have said them;
 * - a person's name → some of their best-known quotes.
 */
const API = 'https://en.wikiquote.org/w/api.php?format=json&origin=*'
const strip = (t: string) => t.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&#039;/g, '’').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()

export async function whoSaid(words: string): Promise<{ who: string; snippet: string }[]> {
  const q = words.replace(/[“”"]/g, '').replace(/\s+/g, ' ').trim()
  if (q.split(' ').length < 4) return []
  const search = async (s: string) => {
    const r = await fetch(`${API}&action=query&list=search&srnamespace=0&srlimit=8&srsearch=${encodeURIComponent(s)}`)
    if (!r.ok) return []
    const j = await r.json()
    return (j.query?.search ?? [])
      .filter((x: any) => !/^(List of|Proverbs|English proverbs)|disambiguation/i.test(x.title))
      .map((x: any) => ({ who: x.title as string, snippet: strip(x.snippet ?? '') }))
  }
  try {
    let found = await search(`"${q}"`)
    if (!found.length) found = await search(q)
    return found.slice(0, 4)
  } catch { return [] }
}

/** A few quotes from the person's Wikiquote page. */
export async function quotesBy(name: string): Promise<{ page: string; quotes: string[] } | null> {
  const title = name.trim()
  if (title.length < 3) return null
  try {
    const r = await fetch(`${API}&action=parse&redirects=1&prop=wikitext&section=1&page=${encodeURIComponent(title)}`)
    if (!r.ok) return null
    const j = await r.json()
    const text: string = j.parse?.wikitext?.['*'] ?? ''
    const quotes = text.split('\n')
      .filter((l) => /^\*\s*[^*:]/.test(l))
      .map((l) => strip(l.replace(/^\*\s*/, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>|<ref[^>]*\/>/g, '').replace(/\{\{[^}]*\}\}/g, '')
        .replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1').replace(/\[https?:[^\s\]]+\s?([^\]]*)\]/g, '$1').replace(/'{2,}/g, '')))
      .filter((q) => q.length > 15 && q.length < 320)
      .slice(0, 8)
    return quotes.length ? { page: `https://en.wikiquote.org/wiki/${encodeURIComponent((j.parse?.title ?? title).replace(/ /g, '_'))}`, quotes } : null
  } catch { return null }
}
