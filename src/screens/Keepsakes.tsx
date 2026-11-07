import { useState } from 'react'
import { useData } from '../lib/data'
import { OCCASIONS } from '../lib/questions'
import { canRecord, clock, useRecorder } from '../lib/recorder'
import { uid } from '../lib/store'
import type { KeepsakeMessage, MessageKind } from '../lib/types'
import { Empty, Icon, Media, ScreenHeader, Sheet } from '../components/ui'
import { SuggestionList, useSuggestions } from '../components/Suggestions'
import { TextField } from '../components/TextField'

const KINDS: Record<MessageKind, { label: string; source: string }> = {
  scripture: { label: 'Scripture', source: 'Book, chapter and verse (e.g. Psalm 23:4)' },
  song: { label: 'Song', source: 'Who sings it' },
  quote: { label: 'Quote', source: 'Who said it, or the book it’s from' },
  advice: { label: 'Advice', source: '' },
  letter: { label: 'Letter', source: '' },
}

export default function Keepsakes() {
  const { data, isOwner, settings } = useData()
  const [occasion, setOccasion] = useState<string | null>(null)
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
            <p>A favorite verse for hard days, a quote you live by, or a letter for a wedding or a new baby.</p>
            <button className="btn" onClick={() => setEditing('new')}><Icon name="plus" size={18} /> Add a message</button>
          </>}
        </Empty>
      )}

      <div className="keepsakes">
        {list.map((m) => (
          <article key={m.id} className={`card keepsake kind-${m.kind}`} onClick={() => isOwner && setEditing(m)} role={isOwner ? 'button' : undefined}>
            <span className="label">{KINDS[m.kind].label}{m.forWhom ? ` · for ${m.forWhom}` : ''}</span>
            <p className="keepsake-text">{m.text}</p>
            {m.source && <p className="keepsake-source">— {m.source}</p>}
            {m.note && <p className="keepsake-note">{m.note}</p>}
            {m.mediaIds.length > 0 && <div className="media-stack" onClick={(e) => e.stopPropagation()}>{m.mediaIds.map((id) => <Media key={id} id={id} />)}</div>}
            <div className="chips small">{m.occasions.map((o) => <span key={o} className="chip quiet">{o}</span>)}</div>
          </article>
        ))}
        {occasion && !list.length && <p className="muted">Nothing for this moment yet.</p>}
      </div>

      {editing && <MessageSheet item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function MessageSheet({ item, onClose }: { item: KeepsakeMessage | null; onClose: () => void }) {
  const { save, remove, store } = useData()
  const [f, setF] = useState<KeepsakeMessage>(item ?? { id: uid(), kind: 'scripture', text: '', occasions: ['Hard days'], mediaIds: [], createdAt: Date.now() })
  const rec = useRecorder()
  const toggle = (o: string) => setF((x) => ({ ...x, occasions: x.occasions.includes(o) ? x.occasions.filter((y) => y !== o) : [...x.occasions, o] }))

  return (
    <Sheet title={item ? 'Edit message' : 'Add a message'} onClose={onClose}>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault()
        if (!f.text.trim() && !f.mediaIds.length) return
        await save('messages', { ...f, text: f.text.trim(), occasions: f.occasions.length ? f.occasions : ['Anytime'] })
        onClose()
      }}>
        <div className="segmented full">
          {(Object.keys(KINDS) as MessageKind[]).map((k) => (
            <button type="button" key={k} className={f.kind === k ? 'on' : ''} onClick={() => setF({ ...f, kind: k })}>{KINDS[k].label}</button>
          ))}
        </div>
        <TextField id="keep-text" multiline rows={f.kind === 'song' ? 1 : 5} autoFocus label={f.kind === 'scripture' ? 'The verse' : f.kind === 'song' ? 'Song title' : f.kind === 'quote' ? 'The quote' : 'Your message'}
          value={f.text} onChange={(v) => setF({ ...f, text: v })} />
        {KINDS[f.kind].source && (
          <TextField id="keep-source" label={KINDS[f.kind].source} value={f.source ?? ''} onChange={(v) => setF({ ...f, source: v })} />
        )}
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
            {rec.state === 'recording'
              ? <button type="button" className="btn danger" onClick={async () => { const out = await rec.stop(); if (out) { const id = await store.putMedia(out.blob); setF((x) => ({ ...x, mediaIds: [...x.mediaIds, id], text: x.text || out.transcript })) } }}><Icon name="stop" size={18} /> Stop {clock(rec.seconds)}</button>
              : <button type="button" className="btn secondary" onClick={() => rec.start('audio')}><Icon name="mic" size={18} /> Say it in your voice</button>}
          </div>
        )}
        {f.mediaIds.length > 0 && <div className="media-stack">{f.mediaIds.map((m) => <Media key={m} id={m} />)}</div>}
        <div className="row between">
          <button className="btn">Save</button>
          {item && <button type="button" className="btn ghost danger-text" onClick={async () => { await remove('messages', item.id); onClose() }}><Icon name="trash" size={18} /> Delete</button>}
        </div>
      </form>
    </Sheet>
  )
}
