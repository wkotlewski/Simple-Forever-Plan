/** A song link someone pasted (YouTube, Spotify, Apple Music…): where it goes and how to play it in the page. */
export interface Listen { url: string; service: string; embed?: string; tall?: boolean }

export function readListenLink(raw?: string): Listen | null {
  const text = raw?.trim()
  if (!text) return null
  let u: URL
  try { u = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`) } catch { return null }
  const host = u.hostname.replace(/^www\.|^m\./, '')
  if (host === 'youtu.be' || host.endsWith('youtube.com')) {
    const id = host === 'youtu.be' ? u.pathname.slice(1).split('/')[0]
      : u.searchParams.get('v') ?? u.pathname.match(/\/(?:shorts|embed|live)\/([\w-]{6,})/)?.[1]
    const service = host.startsWith('music.') ? 'YouTube Music' : 'YouTube'
    return { url: u.href, service, embed: id ? `https://www.youtube-nocookie.com/embed/${id}` : undefined }
  }
  if (host === 'open.spotify.com' || host === 'spotify.link') {
    const m = u.pathname.match(/\/(track|album|playlist|episode|artist)\/(\w+)/)
    return { url: u.href, service: 'Spotify', embed: m ? `https://open.spotify.com/embed/${m[1]}/${m[2]}` : undefined, tall: !!m && m[1] !== 'track' && m[1] !== 'episode' }
  }
  if (host === 'music.apple.com') return { url: u.href, service: 'Apple Music', embed: `https://embed.music.apple.com${u.pathname}${u.search}` }
  if (host.endsWith('soundcloud.com')) return { url: u.href, service: 'SoundCloud', embed: `https://w.soundcloud.com/player/?url=${encodeURIComponent(u.href)}` }
  return { url: u.href, service: host }
}

/** Search links for when there's no link yet. */
export const findSong = (title: string, artist?: string) => {
  const q = encodeURIComponent([title, artist].filter(Boolean).join(' '))
  return { youtube: `https://www.youtube.com/results?search_query=${q}`, spotify: `https://open.spotify.com/search/${q}` }
}

const NOISE = /\s*[([](official( music| lyric)?( video| audio| visualizer)?|lyrics?( video)?|audio|hd|hq|4k( remaster(ed)?)?|remaster(ed)?( \d{4})?|music video|video oficial|live)[)\]]/gi

/**
 * Looks up the song's title (and singer, when the service says) from its link, so it doesn't have to be typed.
 * Uses the services' public "oEmbed" lookups — only the link is sent.
 */
export async function songInfo(raw: string): Promise<{ title?: string; artist?: string } | null> {
  const l = readListenLink(raw)
  if (!l) return null
  const service = l.service.startsWith('YouTube') ? 'youtube' : l.service === 'Spotify' ? 'spotify' : 'other'
  const endpoint = service === 'youtube' ? `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(l.url)}`
    : service === 'spotify' ? `https://open.spotify.com/oembed?url=${encodeURIComponent(l.url)}`
    : `https://noembed.com/embed?url=${encodeURIComponent(l.url)}`
  try {
    const r = await fetch(endpoint)
    if (!r.ok) return null
    const j = await r.json()
    let title: string = (j.title ?? '').replace(NOISE, '').replace(NOISE, '').trim()
    let artist: string | undefined
    if (service === 'youtube') {
      // "Artist - Song" is how most music videos are named; otherwise the channel is usually the singer.
      const m = title.match(/^(.+?)\s+[-–—|]\s+(.+)$/)
      if (m) { artist = m[1].trim(); title = m[2].trim() }
      else artist = (j.author_name ?? '').replace(/\s*-\s*Topic$|VEVO$|\s*Official$/i, '').trim() || undefined
      title = title.replace(/\s*\b(ft|feat)\.?\s.+$/i, (x) => x).trim()
    } else if (service === 'other' && j.author_name) artist = j.author_name
    return title ? { title, artist } : null
  } catch { return null }
}
