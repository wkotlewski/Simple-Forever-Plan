import { useEffect, useState } from 'react'
import { useData } from '../lib/data'
import { OCCASIONS } from '../lib/questions'
import { canRecord, clock, useRecorder } from '../lib/recorder'
import { uid } from '../lib/store'
import type { KeepsakeMessage, MessageKind } from '../lib/types'
import { Empty, Icon, Media, ScreenHeader, Sheet } from '../components/ui'
import { SuggestionList, useSuggestions } from '../components/Suggestions'
import { TextField } from '../components/TextField'
import { findSong, readListenLink, songInfo } from '../lib/listen'
import { findVerse, looksLikeReference, TRANSLATIONS, versesFor, type TranslationId } from '../lib/scripture'
import { quotesBy, whoSaid } from '../lib/quotes'

const KINDS: Record<MessageKind, { label: string; source: string; short?: string }> = {
  memory: { label: 'Photo or video', short: 'Photo', source: 'When and where (optional)' },
  scripture: { label: 'Scripture', source: 'Book, chapter and verse (e.g. Psalm 23:4)' },
  song: { label: 'Song', source: 'Who sings it' },
  quote: { label: 'Quote', source: 'Who said it, or the book it’s from' },
  advice: { label: 'Advice', source: '' },
  letter: { label: 'Letter', source: '' },
}

export default function Keepsakes() {
  const { data, isOwner, settings, save } = useData()
  const [occasion, setOccasion] = useState<string | null>(null)
  // Songs saved with a link but no singer (or title): fill them in once, without changing anything already typed.
  useEffect(() => {
    if (!isOwner) return
    const todo = data.messages.filter((m) => m.kind === 'song' && readListenLink(m.link) && (!m.source?.trim() || !m.text.trim()))
    todo.forEach(async (m) => {
      const info = await songInfo(m.link!)
      if (!info) return
      const next = { ...m, text: m.text.trim() || info.title || m.text, source: m.source?.trim() || info.artist || m.source }
      if (next.text !== m.text || next.source !== m.source) await save('messages', next)
    })
  }, [isOwner, data.messages.length]) // eslint-disable-line react-hooks/exhaustive-deps
  const [editing, setEditing] = useState<KeepsakeMessage | 'new' | null>(null)
  const list = data.messages
    .filter((m) => !occasion || m.occasions.includes(occasion) || m.occasions.includes('Anytime'))
    .sort((a, b) => b.createdAt - a.createdAt)
  const used = OCCASIONS.filter((o) => data.messages.some((m) => m.occasions.includes(o)))
  const who = settings.storytellerName.split(' ')[0]
  const found = useSuggestions(data.answers, 'keepsakes')

  return (
    <div className="screen">
      <ScreenHeader title="Words to Keep"
        sub={isOwner ? 'Scripture, quotes and messages your family can open when life calls for them.' : `Open these when you need ${who ? `${who}'s` : 'their'} words.`}
        action={isOwner ? <button className="icon-btn ring" onClick={() => setEditing('new')} aria-label="Add a message"><Icon name="plus" /></button> : undefined} />

      {isOwner && <SuggestionList items={found} title="Scripture & songs from your stories" />}

      {data.messages.length > 0 && (
        <div className="occasions" role="tablist" aria-label="Open when">
          <span className="label">Open when…</span>
          <div className="chips">
            <button className={`chip ${!occasion ? 'on' : ''}`} onClick={() => setOccasion(null)}>All</button>
            {(isOwner ? OCCASIONS : used).filter((o) => o !== 'Anytime').map((o) => (
              <button key={o} className={`chip ${occasion === o ? 'on' : ''}`} onClick={() => setOccasion(o)}>{o}</button>
            ))}
          </div>
        </div>
      )}

      {!data.messages.length && (
        <Empty icon="quote" title={isOwner ? 'Leave words for the road ahead' : 'No messages yet'}>
          {isOwner && <>
            <p>A favorite verse for hard days, a quote you live by, a letter for a wedding or a new baby — or a photo or video with the story behind it.</p>
            <button className="btn" onClick={() => setEditing('new')}><Icon name="plus" size={18} /> Add a message</button>
          </>}
        </Empty>
      )}

      <div className="keepsakes">
        {list.map((m) => (
          <article key={m.id} className={`card keepsake kind-${m.kind}`} onClick={() => isOwner && setEditing(m)} role={isOwner ? 'button' : undefined}>
            <span className="label">{KINDS[m.kind].label}{m.forWhom ? ` · for ${m.forWhom}` : ''}</span>
            {m.kind === 'memory' && m.mediaIds.length > 0 && (
              <div className="memory-media" onClick={(e) => e.stopPropagation()}>{m.mediaIds.map((id) => <Media key={id} id={id} />)}</div>
            )}
            {m.kind === 'memory' && !!m.people?.length && (
              <p className="small muted">With {m.people.map((id) => data.people.find((p) => p.id === id)?.name).filter(Boolean).join(', ')}</p>
            )}
            <p className={`keepsake-text ${m.kind === 'memory' ? 'memory-story' : ''}`}>{m.text}</p>
            {m.source && <p className="keepsake-source">— {m.source}</p>}
            {m.note && <p className="keepsake-note">{m.note}</p>}
            {m.kind === 'song' && <SongPlayer title={m.text} artist={m.source} link={m.link} />}
            {m.kind !== 'memory' && m.mediaIds.length > 0 && <div className="media-stack" onClick={(e) => e.stopPropagation()}>{m.mediaIds.map((id) => <Media key={id} id={id} />)}</div>}
            <div className="chips small">{m.occasions.map((o) => <span key={o} className="chip quiet">{o}</span>)}</div>
          </article>
        ))}
        {occasion && !list.length && <p className="muted">Nothing for this moment yet.</p>}
      </div>

      {editing && <MessageSheet item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

/** Listen to a song: open it in YouTube or Spotify, or play it right on the page. */
function SongPlayer({ title, artist, link }: { title: string; artist?: string; link?: string }) {
  const [open, setOpen] = useState(false)
  const l = readListenLink(link)
  const find = findSong(title, artist)
  return (
    <div className="song-player stack tight" onClick={(e) => e.stopPropagation()}>
      {l ? (
        <>
          <div className="row wrap">
            {l.embed && <button className="btn small" onClick={() => setOpen(!open)}><Icon name={open ? 'stop' : 'play'} size={16} /> {open ? 'Hide player' : 'Play here'}</button>}
            <a className={`btn small ${l.embed ? 'secondary' : ''}`} href={l.url} target="_blank" rel="noreferrer">Listen on {l.service}</a>
          </div>
          {open && l.embed && (
            <iframe className={`song-embed ${l.service === 'Spotify' ? (l.tall ? 'spotify tall' : 'spotify') : l.service === 'Apple Music' ? 'apple' : l.service === 'SoundCloud' ? 'spotify' : 'video'}`}
              src={l.embed} title={`${title}${artist ? ` by ${artist}` : ''}`} loading="lazy"
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" allowFullScreen />
          )}
        </>
      ) : title.trim() ? (
        <p className="muted small">Listen: <a href={find.youtube} target="_blank" rel="noreferrer">find on YouTube</a> · <a href={find.spotify} target="_blank" rel="noreferrer">find on Spotify</a></p>
      ) : null}
    </div>
  )
}

type Fill = { f: KeepsakeMessage; setF: React.Dispatch<React.SetStateAction<KeepsakeMessage>> }

/** Runs a lookup a moment after typing stops; the latest one wins. */
function useLookup<T>(key: string | null, run: () => Promise<T>): { result: T | null; busy: boolean } {
  const [state, setState] = useState<{ key: string | null; result: T | null; busy: boolean }>({ key: null, result: null, busy: false })
  useEffect(() => {
    if (!key) { setState({ key: null, result: null, busy: false }); return }
    let live = true
    const t = setTimeout(async () => {
      setState((s) => ({ ...s, busy: true }))
      const result = await run().catch(() => null)
      if (live) setState({ key, result, busy: false })
    }, 700)
    return () => { live = false; clearTimeout(t) }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return { result: state.key === key ? state.result : null, busy: state.busy }
}

const sameWords = (a: string, b: string) => a.toLowerCase().replace(/[^a-z]/g, '') === b.toLowerCase().replace(/[^a-z]/g, '')

/** Scripture: type the reference to see the words, or type (or say) the words you remember to find the verse. */
function VerseHelp({ f, setF }: Fill) {
  const [tr, setTr] = useState<TranslationId>('kjv')
  const ref = looksLikeReference(f.source) ? f.source!.trim() : null
  const words = !ref && f.text.trim().split(/\s+/).length >= 3 ? f.text.trim() : null
  const verse = useLookup(ref ? `${ref}|${tr}` : null, () => versesFor(ref!, tr))
  const found = useLookup(words ? `${words}|${tr}` : null, () => findVerse(words!, tr))
  // A reference with an empty verse box: fill the words in.
  useEffect(() => {
    if (verse.result && !f.text.trim()) setF((cur) => (cur.text.trim() ? cur : { ...cur, text: verse.result!.text }))
  }, [verse.result]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!ref && !words) return <p className="muted small lookup-hint">Know the reference? Type it (like Psalm 23:4) and the words appear. Only remember some of the words? Type or say them above and I’ll find the verse.</p>
  return (
    <div className="lookup card inset stack tight">
      <div className="row between wrap">
        <span className="label">{ref ? 'The words' : 'Is it one of these?'}</span>
        <span className="chips small">{TRANSLATIONS.map((t) => (
          <button type="button" key={t.id} className={`chip ${tr === t.id ? 'on' : ''}`} onClick={() => setTr(t.id)}>{t.id.toUpperCase()}</button>
        ))}</span>
      </div>
      {(verse.busy || found.busy) && <p className="muted small">Looking it up…</p>}
      {ref && verse.result && (
        <>
          <p className="lookup-verse">“{verse.result.text}”<small className="muted"> — {verse.result.reference} ({tr.toUpperCase()})</small></p>
          {f.text.trim() && !sameWords(f.text, verse.result.text) && (
            <button type="button" className="btn secondary small" onClick={() => setF((cur) => ({ ...cur, text: verse.result!.text, source: verse.result!.reference }))}>Use these exact words</button>
          )}
          {sameWords(f.text, verse.result.text) && <p className="success small"><Icon name="check" size={14} /> Matches what’s above.</p>}
        </>
      )}
      {ref && !verse.busy && !verse.result && <p className="muted small">Couldn’t find {ref}. Check the book name and numbers (like John 3:16).</p>}
      {words && found.result?.map((v) => (
        <button type="button" key={v.reference} className="lookup-option" onClick={() => setF((cur) => ({ ...cur, source: v.reference, text: v.text }))}>
          <strong>{v.reference}</strong><span>{v.text}</span>
        </button>
      ))}
      {words && !found.busy && found.result && !found.result.length && <p className="muted small">No verse found with those words yet — try a few more, or the reference if you know it.</p>}
    </div>
  )
}

/** Quotes: type the words to see who may have said them, or a name to pick from their quotes. */
function QuoteHelp({ f, setF }: Fill) {
  const words = !f.source?.trim() && f.text.trim().split(/\s+/).length >= 4 ? f.text.trim() : null
  const person = f.source?.trim() && !f.text.trim() ? f.source.trim() : null
  const who = useLookup(words, () => whoSaid(words!))
  const theirs = useLookup(person, () => quotesBy(person!))
  if (!words && !person) return <p className="muted small lookup-hint">Type or say the quote and I’ll look up who said it — or type a name and pick from their quotes.</p>
  return (
    <div className="lookup card inset stack tight">
      <span className="label">{words ? 'Who may have said it' : `Quotes by ${person}`}</span>
      {(who.busy || theirs.busy) && <p className="muted small">Looking it up…</p>}
      {words && who.result?.map((w) => (
        <button type="button" key={w.who} className="lookup-option" onClick={() => setF((cur) => ({ ...cur, source: w.who }))}>
          <strong>{w.who}</strong>{w.snippet && <span>…{w.snippet}…</span>}
        </button>
      ))}
      {words && !who.busy && who.result && !who.result.length && <p className="muted small">Couldn’t find who said it. If you know, type their name.</p>}
      {words && !!who.result?.length && <p className="muted small">Quotes are often credited to the wrong person — pick the one that fits.</p>}
      {person && theirs.result?.quotes.map((q) => (
        <button type="button" key={q} className="lookup-option" onClick={() => setF((cur) => ({ ...cur, text: q }))}><span>“{q}”</span></button>
      ))}
      {person && !theirs.busy && theirs.result === null && <p className="muted small">No quotes found for that name. Check the spelling, or type the quote yourself.</p>}
      {person && theirs.result && <a className="small" href={theirs.result.page} target="_blank" rel="noreferrer">See more of their quotes</a>}
    </div>
  )
}

function MessageSheet({ item, onClose }: { item: KeepsakeMessage | null; onClose: () => void }) {
  const { data, save, remove, store } = useData()
  const [f, setF] = useState<KeepsakeMessage>(item ?? { id: uid(), kind: 'scripture', text: '', occasions: ['Hard days'], mediaIds: [], createdAt: Date.now() })
  // Paste a song link and the title and singer fill in (only empty boxes — nothing typed is replaced).
  const [filling, setFilling] = useState(false)
  const [filled, setFilled] = useState(false)
  useEffect(() => {
    if (f.kind !== 'song' || !readListenLink(f.link) || (f.text.trim() && f.source?.trim())) return
    let live = true
    const t = setTimeout(async () => {
      setFilling(true)
      const info = await songInfo(f.link!)
      if (!live) return
      setFilling(false)
      if (!info) return
      setF((cur) => ({ ...cur, text: cur.text.trim() ? cur.text : info.title ?? cur.text, source: cur.source?.trim() ? cur.source : info.artist ?? cur.source }))
      setFilled(true)
    }, 400)
    return () => { live = false; clearTimeout(t) }
  }, [f.link, f.kind]) // eslint-disable-line react-hooks/exhaustive-deps
  const rec = useRecorder()
  const [adding, setAdding] = useState(false)
  const toggle = (o: string) => setF((x) => ({ ...x, occasions: x.occasions.includes(o) ? x.occasions.filter((y) => y !== o) : [...x.occasions, o] }))

  return (
    <Sheet title={item ? 'Edit message' : 'Add a message'} onClose={onClose}>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault()
        if (!f.text.trim() && !f.mediaIds.length) return
        await save('messages', { ...f, text: f.text.trim(), occasions: f.occasions.length ? f.occasions : ['Anytime'], people: f.kind === 'memory' ? f.people : undefined })
        onClose()
      }}>
        <div className="segmented full">
          {(Object.keys(KINDS) as MessageKind[]).map((k) => (
            <button type="button" key={k} className={f.kind === k ? 'on' : ''} onClick={() => setF({ ...f, kind: k })}>{KINDS[k].short ?? KINDS[k].label}</button>
          ))}
        </div>
        {f.kind === 'song' && (
          <div className="stack tight">
            <TextField id="keep-link" type="url" label="Link to listen (optional)" value={f.link ?? ''} onChange={(v) => setF({ ...f, link: v })}
              placeholder="Paste a YouTube, Spotify or Apple Music link" hint="Paste the link first and the song and singer fill in for you." />
            {filling && <p className="muted small">Looking up the song…</p>}
            {filled && <p className="success small"><Icon name="check" size={14} /> Filled in from the link — change anything you like.</p>}
            {f.link?.trim() && !readListenLink(f.link) && <p className="error small">That doesn’t look like a link. Copy it from the Share button in YouTube or Spotify.</p>}
            {!f.link?.trim() && f.text.trim() && (
              <p className="muted small">Find it: <a href={findSong(f.text, f.source).youtube} target="_blank" rel="noreferrer">YouTube</a> · <a href={findSong(f.text, f.source).spotify} target="_blank" rel="noreferrer">Spotify</a> — then tap Share → Copy link, and paste it here.</p>
            )}
          </div>
        )}
        {f.kind === 'memory' && (
          <div className="stack tight">
            {f.mediaIds.length > 0 && (
              <div className="memory-grid">
                {f.mediaIds.map((m) => (
                  <div key={m} className="memory-thumb">
                    <Media id={m} />
                    <button type="button" className="icon-btn small" aria-label="Remove this photo or video" onClick={() => setF((x) => ({ ...x, mediaIds: x.mediaIds.filter((y) => y !== m) }))}>✕</button>
                  </div>
                ))}
              </div>
            )}
            <label className={`btn ${f.mediaIds.length ? 'secondary' : ''}`}>
              <Icon name="upload" size={20} /> {adding ? 'Adding…' : f.mediaIds.length ? 'Add more photos or videos' : 'Choose photos or videos'}
              <input type="file" accept="image/*,video/*" multiple hidden onChange={async (e) => {
                const files = [...(e.target.files ?? [])]
                e.target.value = ''
                if (!files.length) return
                setAdding(true)
                const ids: string[] = []
                for (const file of files) ids.push(await store.putMedia(file))
                setF((x) => ({ ...x, mediaIds: [...x.mediaIds, ...ids] }))
                setAdding(false)
              }} />
            </label>
          </div>
        )}
        <TextField id="keep-text" multiline rows={f.kind === 'song' ? 1 : 5} autoFocus={f.kind !== 'memory'} label={f.kind === 'memory' ? 'The story behind it' : f.kind === 'scripture' ? 'The verse' : f.kind === 'song' ? 'Song title' : f.kind === 'quote' ? 'The quote' : 'Your message'}
          placeholder={f.kind === 'memory' ? 'What was happening, who was there, why it matters — type, or tap the microphone and tell it.' : undefined}
          value={f.text} onChange={(v) => setF({ ...f, text: v })} />
        {KINDS[f.kind].source && (
          <TextField id="keep-source" label={KINDS[f.kind].source} value={f.source ?? ''} onChange={(v) => setF({ ...f, source: v })} placeholder={f.kind === 'memory' ? 'e.g. Summer 1978, Lake Michigan' : undefined} />
        )}
        {f.kind === 'memory' && data.people.length > 0 && (
          <div className="field"><span>Who’s in it? <small className="muted">(optional)</small></span>
            <div className="chips">{data.people.map((p) => {
              const on = f.people?.includes(p.id)
              return <button type="button" key={p.id} className={`chip ${on ? 'on' : ''}`} onClick={() => setF((x) => ({ ...x, people: on ? (x.people ?? []).filter((y) => y !== p.id) : [...(x.people ?? []), p.id] }))}>{p.name}{p.isSelf ? ' (you)' : ''}</button>
            })}</div>
          </div>
        )}
        {f.kind === 'scripture' && <VerseHelp f={f} setF={setF} />}
        {f.kind === 'quote' && <QuoteHelp f={f} setF={setF} />}
        {(f.kind === 'song' || f.kind === 'scripture' || f.note) && (
          <TextField id="keep-note" multiline rows={3} label="Why it matters (optional)" value={f.note ?? ''} onChange={(v) => setF({ ...f, note: v })} placeholder="When it came into your life, what it means to you…" />
        )}
        <TextField id="keep-for" label="For someone special? (optional)" value={f.forWhom ?? ''} onChange={(v) => setF({ ...f, forWhom: v })} placeholder="Everyone" />
        <div className="field"><span>Open when…</span>
          <div className="chips">{OCCASIONS.map((o) => (
            <button type="button" key={o} className={`chip ${f.occasions.includes(o) ? 'on' : ''}`} onClick={() => toggle(o)}>{o}</button>
          ))}</div>
        </div>
        {canRecord && (
          <div className="row">
            {f.kind === 'memory' && <span className="muted small">Or tell the story out loud:</span>}
            {rec.state === 'recording'
              ? <button type="button" className="btn danger" onClick={async () => { const out = await rec.stop(); if (out) { const id = await store.putMedia(out.blob); setF((x) => ({ ...x, mediaIds: [...x.mediaIds, id], text: x.text || out.transcript })) } }}><Icon name="stop" size={18} /> Stop {clock(rec.seconds)}</button>
              : <button type="button" className="btn secondary" onClick={() => rec.start('audio')}><Icon name="mic" size={18} /> Say it in your voice</button>}
          </div>
        )}
        {f.kind !== 'memory' && f.mediaIds.length > 0 && <div className="media-stack">{f.mediaIds.map((m) => <Media key={m} id={m} />)}</div>}
        <div className="row between">
          <button className="btn">Save</button>
          {item && <button type="button" className="btn ghost danger-text" onClick={async () => { await remove('messages', item.id); onClose() }}><Icon name="trash" size={18} /> Delete</button>}
        </div>
      </form>
    </Sheet>
  )
}
