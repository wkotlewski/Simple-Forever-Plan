import { useEffect, useMemo, useState } from 'react'
import { useData } from '../lib/data'
import { uid } from '../lib/store'
import { childrenOf, layoutTree, linkPeople, parentsOf, siblingsOf, spousesOf, suggestForNew, suggestGaps, type Link, type LinkSuggestion } from '../lib/tree'
import type { ID, Person, Relation } from '../lib/types'
import { Empty, FileButton, Icon, Media, ScreenHeader, Sheet } from '../components/ui'
import { SuggestionList, useSuggestions } from '../components/Suggestions'
import { TextField } from '../components/TextField'
import { AskSheet, Contributions, Waiting } from '../components/AskSheet'
import { personDrafts } from '../lib/drafts'
import { BulkFamily } from '../components/BulkFamily'
import { StoryMentions } from '../components/StoryMentions'

const NODE_W = 116
const CIRCLE_NAME = { family: 'Family', mentored: 'Someone I mentored', mentor: 'A mentor to me', friend: 'A friend' } as const
const R = 30

const LINK_LABEL: Record<Link, string> = { parent: 'Parent of', child: 'Child of', spouse: 'Spouse / partner of', sibling: 'Brother or sister of' }

export default function FamilyTree() {
  const { data, isOwner, session } = useData()
  const [open, setOpen] = useState<ID | 'new' | null>(null)
  const [bulk, setBulk] = useState(false)
  // The tree shows family; mentees, mentors and friends are listed under People Who Mattered.
  const family = useMemo(() => data.people.filter((p) => !p.circle || p.circle === 'family'), [data.people])
  const others = data.people.filter((p) => p.circle && p.circle !== 'family')
  const found = useSuggestions(data.answers, 'people')
  const { placed, width, height } = useMemo(() => layoutTree(family, data.relations, NODE_W), [family, data.relations])
  const pos = new Map(placed.map((p) => [p.person.id, p]))

  // One connector per child: from the middle of their parents (or the one parent) down to them.
  const childLines = family.flatMap((c) => {
    const ps = parentsOf(c.id, data.relations).map((p) => pos.get(p)).filter(Boolean) as typeof placed
    const me = pos.get(c.id)
    if (!ps.length || !me) return []
    const px = ps.reduce((s, p) => s + p.x, 0) / ps.length
    const py = Math.max(...ps.map((p) => p.y)) + R
    const midY = (py + me.y - R) / 2 + 6
    return [`M${px},${py} V${midY} H${me.x} V${me.y - R - 4}`]
  })
  const spouseLines = data.relations.filter((r) => r.type === 'spouse').flatMap((r) => {
    const a = pos.get(r.from), b = pos.get(r.to)
    return a && b ? [`M${Math.min(a.x, b.x) + R},${a.y} H${Math.max(a.x, b.x) - R}`] : []
  })

  return (
    <div className="screen">
      <ScreenHeader title="Family Tree" sub={isOwner ? 'Add people, photos and notes, then connect who is related to who.' : 'Tap anyone to see their photo and notes.'}
        action={isOwner && data.people.length > 0 ? <button className="icon-btn ring" onClick={() => setOpen('new')} aria-label="Add a person"><Icon name="plus" /></button> : undefined} />

      {isOwner && <SuggestionList items={found} title="People from your stories" />}
      {isOwner && <GapSuggestions />}
      {isOwner && data.people.length > 0 && (
        <button className="card bulk-card" onClick={() => setBulk(true)}>
          <Icon name="mic" />
          <span><strong>Add more family by talking or typing</strong><small className="muted">Or bring in a family tree file, document or recording</small></span>
        </button>
      )}

      {!family.length ? (
        <Empty icon="tree" title={isOwner ? 'Start your family tree' : 'No family tree yet'}>
          {isOwner && (
            <div className="stack center-buttons">
              <button className="btn big" onClick={() => setBulk(true)}><Icon name="mic" size={20} /> Tell me about your family</button>
              <button className="btn ghost" onClick={() => setOpen('new')}><Icon name="plus" size={18} /> Add one person at a time</button>
            </div>
          )}
        </Empty>
      ) : (
        <div className="tree-wrap">
          <svg className="tree" width={Math.max(width, 320)} height={height} viewBox={`0 0 ${Math.max(width, 320)} ${height}`} role="img" aria-label="Family tree">
            {childLines.map((d, i) => <path key={`c${i}`} d={d} className="tree-line" />)}
            {spouseLines.map((d, i) => <path key={`s${i}`} d={d} className="tree-line spouse" />)}
            {placed.map((p) => (
              <TreeNode key={p.person.id} person={p.person} x={p.x} y={p.y} me={p.person.isSelf} onClick={() => setOpen(p.person.id)} />
            ))}
          </svg>
        </div>
      )}

      {family.length > 0 && (
        <ul className="people-list">
          {[...family].sort((a, b) => Number(!!b.isSelf) - Number(!!a.isSelf) || a.name.localeCompare(b.name)).map((p) => (
            <li key={p.id}><button onClick={() => setOpen(p.id)}><strong>{p.name}</strong><span>{describe(p, data.people, data.relations, session.name)}</span></button></li>
          ))}
        </ul>
      )}

      {others.length > 0 && (
        <section className="stack">
          <h3 className="section-title">People Who Mattered</h3>
          <p className="muted small">People you mentored, mentors, and friends who were like family.</p>
          <div className="mattered">
            {[...others].sort((a, b) => (a.circle ?? '').localeCompare(b.circle ?? '') || a.name.localeCompare(b.name)).map((p) => (
              <button key={p.id} className="card mattered-card" onClick={() => setOpen(p.id)}>
                {p.photoId ? <Media id={p.photoId} className="avatar-sm" /> : <span className="avatar-sm empty-avatar">{p.name[0]}</span>}
                <span><strong>{p.name}</strong><small className={`circle-${p.circle}`}>{p.relation || CIRCLE_NAME[p.circle!]}</small></span>
              </button>
            ))}
          </div>
        </section>
      )}

      {bulk && <BulkFamily onClose={() => setBulk(false)} />}

      {open && (
        <PersonSheet
          person={open === 'new' ? null : data.people.find((p) => p.id === open) ?? null}
          onClose={() => setOpen(null)}
          onOpen={(id) => setOpen(id)}
        />
      )}
    </div>
  )
}

function describe(p: Person, people: Person[], rels: Relation[], _me: string) {
  const name = (id: ID) => people.find((x) => x.id === id)?.name.split(' ')[0]
  const bits: string[] = []
  if (p.isSelf) bits.push('You')
  const sp = spousesOf(p.id, rels).map(name).filter(Boolean)
  if (sp.length) bits.push(`partner of ${sp.join(', ')}`)
  const pa = parentsOf(p.id, rels).map(name).filter(Boolean)
  if (pa.length) bits.push(`child of ${pa.join(' & ')}`)
  if (p.born || p.died) bits.push([p.born, p.died].filter(Boolean).join('–'))
  return bits.join(' · ')
}

function TreeNode({ person, x, y, me, onClick }: { person: Person; x: number; y: number; me?: boolean; onClick: () => void }) {
  const { store } = useData()
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => { if (person.photoId) store.mediaUrl(person.photoId).then(setUrl); else setUrl(null) }, [person.photoId, store])
  const initials = person.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()
  const clip = `clip-${person.id}`
  const first = person.name.split(' ')[0]
  return (
    <g className={`tree-node ${me ? 'me' : ''}`} transform={`translate(${x},${y})`} onClick={onClick} role="button" tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onClick()}>
      <clipPath id={clip}><circle r={R} /></clipPath>
      <circle r={R + 3} className="node-ring" />
      {url ? <image href={url} x={-R} y={-R} width={R * 2} height={R * 2} clipPath={`url(#${clip})`} preserveAspectRatio="xMidYMid slice" />
        : <><circle r={R} className="node-fill" /><text className="node-initials" dy="0.35em">{initials}</text></>}
      <text className="node-name" y={R + 20}>{first.length > 13 ? first.slice(0, 12) + '…' : first}</text>
      {person.born && <text className="node-years" y={R + 36}>{person.born}{person.died ? `–${person.died}` : ''}</text>}
    </g>
  )
}

function PersonSheet({ person, onClose, onOpen }: { person: Person | null; onClose: () => void; onOpen: (id: ID) => void }) {
  const { data, isOwner, save, remove, store } = useData()
  const isNew = !person
  const [f, setF] = useState<Person>(person ?? { id: uid(), name: '', notes: '', isSelf: !data.people.length })
  // Someone new can be connected to several people at once (e.g. child of Stanley and of Helen).
  const [links, setLinks] = useState<{ type: Link; to: ID }[]>([{ type: 'child', to: data.people.find((p) => p.isSelf)?.id ?? data.people[0]?.id ?? '' }])
  const [unticked, setUnticked] = useState<Set<string>>(new Set())
  const setLink = (i: number, patch: Partial<{ type: Link; to: ID }>) => setLinks((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  const suggested = useMemo(() => (isNew ? suggestForNew(data.people, data.relations, f.id, links.filter((l) => l.to)) : []), [isNew, data.people, data.relations, f.id, links])
  const isTicked = (sg: LinkSuggestion) => (sg.optional ? !unticked.has(`off:${sg.key}`) && unticked.has(`on:${sg.key}`) : !unticked.has(`off:${sg.key}`))
  const tick = (sg: LinkSuggestion, on: boolean) => setUnticked((u) => {
    const n = new Set(u); n.delete(`on:${sg.key}`); n.delete(`off:${sg.key}`); n.add(`${on ? 'on' : 'off'}:${sg.key}`); return n
  })
  const [editing, setEditing] = useState(isNew)
  const [asking, setAsking] = useState<boolean | string>(false)
  const drafts = personDrafts(f, data.people, data.relations)
  const others = data.people.filter((p) => p.id !== f.id)
  const name = (id: ID) => data.people.find((p) => p.id === id)?.name ?? ''

  const connect = (personId: ID, type: Link, otherId: ID) => linkPeople({ people: data.people, relations: data.relations, save }, personId, type, otherId)

  async function submit() {
    if (!f.name.trim()) return
    await save('people', { ...f, name: f.name.trim() })
    if (isNew && others.length && (!f.circle || f.circle === 'family')) {
      const ctx = { people: [...data.people, f], relations: [...data.relations], save }
      for (const l of links.filter((l) => l.to)) await linkPeople(ctx, f.id, l.type, l.to)
      for (const sg of suggested.filter(isTicked)) await linkPeople(ctx, f.id, sg.type, sg.other)
    }
    if (isNew) onClose(); else setEditing(false)
  }

  async function del() {
    if (!person) return
    for (const r of data.relations.filter((r) => r.from === person.id || r.to === person.id)) await remove('relations', r.id)
    await remove('people', person.id)
    onClose()
  }

  const rel = person && {
    Parents: parentsOf(person.id, data.relations), Partner: spousesOf(person.id, data.relations),
    Children: childrenOf(person.id, data.relations), Siblings: siblingsOf(person.id, data.relations),
  }

  return (
    <Sheet title={isNew ? (f.isSelf ? 'Add yourself' : 'Add a family member') : f.name} onClose={onClose}>
      {editing ? (
        <form className="stack" onSubmit={(e) => { e.preventDefault(); submit() }}>
          <div className="person-photo-row">
            {f.photoId ? <Media id={f.photoId} className="avatar-lg" /> : <div className="avatar-lg empty-avatar"><Icon name="camera" size={28} /></div>}
            <FileButton label={f.photoId ? 'Change photo' : 'Add photo'} accept="image/*" icon="camera"
              onFile={async (file) => { const id = await store.putMedia(file); setF((x) => ({ ...x, photoId: id })) }} />
          </div>
          <TextField id="person-name" label="Full name" autoFocus value={f.name} onChange={(v) => setF({ ...f, name: v })} />
          <div className="grid2">
            <TextField id="person-born" label="Born" value={f.born ?? ''} onChange={(v) => setF({ ...f, born: v })} placeholder="Year or date"
              onAsk={!isNew && f.name.trim() ? async () => { await save('people', { ...f, name: f.name.trim() }); setAsking(`What year and day was ${f.name.split(' ')[0]}’s birthday?`) } : undefined} />
            <TextField id="person-died" label="Passed" value={f.died ?? ''} onChange={(v) => setF({ ...f, died: v })} placeholder="If applicable" />
          </div>
          <div className="field"><span>Who are they to you?</span>
            <div className="chips">{(Object.keys(CIRCLE_NAME) as (keyof typeof CIRCLE_NAME)[]).map((c) => (
              <button type="button" key={c} className={`chip ${(f.circle ?? 'family') === c ? 'on' : ''}`} onClick={() => setF({ ...f, circle: c })}>{CIRCLE_NAME[c]}</button>
            ))}</div>
          </div>
          {f.circle && f.circle !== 'family' && (
            <TextField id="person-relation" label="In your words" value={f.relation ?? ''} onChange={(v) => setF({ ...f, relation: v })} placeholder="e.g. Apprentice at the shop" />
          )}
          {isNew && others.length > 0 && (!f.circle || f.circle === 'family') && (
            <div className="stack connections">
              <span className="field-title">How are they connected?</span>
              {links.map((l, i) => (
                <div key={i} className="connection-row">
                  <select aria-label="They are the…" value={l.type} onChange={(e) => setLink(i, { type: e.target.value as Link })}>
                    {(Object.keys(LINK_LABEL) as Link[]).map((k) => <option key={k} value={k}>{LINK_LABEL[k]}</option>)}
                  </select>
                  <select aria-label="…of" value={l.to} onChange={(e) => setLink(i, { to: e.target.value })}>
                    <option value="">Choose someone</option>
                    {others.map((p) => <option key={p.id} value={p.id}>{p.name}{p.isSelf ? ' (you)' : ''}</option>)}
                  </select>
                  {links.length > 1 && <button type="button" className="icon-btn" aria-label="Remove this connection" onClick={() => setLinks((ls) => ls.filter((_, j) => j !== i))}>✕</button>}
                </div>
              ))}
              <button type="button" className="link-btn" onClick={() => setLinks((ls) => [...ls, { type: ls[ls.length - 1]?.type ?? 'child', to: '' }])}>+ Connect to someone else too</button>
              {suggested.length > 0 && (
                <div className="link-suggestions">
                  <p className="label"><Icon name="sparkle" size={14} /> Based on your tree</p>
                  {suggested.map((sg) => (
                    <label key={sg.key} className="check">
                      <input type="checkbox" checked={isTicked(sg)} onChange={(e) => tick(sg, e.target.checked)} />
                      <span>Also {LINK_LABEL[sg.type].toLowerCase()} <strong>{data.people.find((p) => p.id === sg.other)?.name}</strong> <small className="muted">({sg.reason})</small></span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
          <TextField id="person-notes" multiline label="Notes" value={f.notes} onChange={(v) => setF({ ...f, notes: v })} placeholder="Where they lived, what they were like, a story about them…"
            onAsk={!isNew && f.name.trim() ? async () => { await save('people', { ...f, name: f.name.trim() }); setAsking(true) } : undefined} />
          <div className="row between">
            <button className="btn" disabled={!f.name.trim()}>Save</button>
            {!isNew && <button type="button" className="btn ghost danger-text" onClick={del}><Icon name="trash" size={18} /> Remove</button>}
          </div>
        </form>
      ) : (
        <div className="stack">
          <div className="person-photo-row">
            {f.photoId ? <Media id={f.photoId} className="avatar-lg" /> : <div className="avatar-lg empty-avatar">{f.name[0]}</div>}
            <div>
              <h3>{f.name}</h3>
              {f.circle && f.circle !== 'family' && <p className={`circle-${f.circle} small`}>{f.relation || CIRCLE_NAME[f.circle]}</p>}
              {(f.born || f.died) && <p className="muted">{[f.born, f.died].filter(Boolean).join(' – ')}</p>}
            </div>
          </div>
          {f.notes && <p className="notes">{f.notes}</p>}
          <Contributions items={person?.contributions} label="remembers" />
          {person && !person.isSelf && <StoryMentions person={person} />}
          {isOwner && person && <Waiting asks={data.asks.filter((a) => !a.answeredAt && a.target?.kind === 'person' && a.target.personId === person.id)} />}
          {rel && Object.entries(rel).filter(([, ids]) => ids.length).map(([label, ids]) => (
            <div key={label} className="rel-row">
              <span className="label">{label}</span>
              <div className="row wrap">{ids.map((id) => <button key={id} className="chip" onClick={() => onOpen(id)}>{name(id)}</button>)}</div>
            </div>
          ))}
          {isOwner && (
            <>
              <ConnectRow person={f} others={others} onConnect={connect} />
              <div className="row wrap">
                <button className="btn secondary" onClick={() => setEditing(true)}>Edit</button>
                {!f.isSelf && <button className="btn ghost" onClick={() => setAsking(true)}><Icon name="share" size={16} /> Ask family about {f.name.split(' ')[0]}</button>}
              </div>
              {!f.isSelf && (
                <div className="quick-asks">
                  <span className="label">Quick questions to send</span>
                  <div className="chips">{drafts.slice(0, 4).map((d) => (
                    <button key={d.text} className="chip" onClick={() => setAsking(d.text)}>{d.text}</button>
                  ))}</div>
                </div>
              )}
              <div>
              </div>
            </>
          )}
        </div>
      )}
      {asking && (
        <AskSheet question={(typeof asking === 'string' ? asking : drafts[0]?.text) ?? `What do you remember about ${f.name.trim()}?`} suggestions={drafts}
          target={{ kind: 'person', personId: f.id }} onClose={() => setAsking(false)} />
      )}
    </Sheet>
  )
}

function ConnectRow({ person, others, onConnect }: { person: Person; others: Person[]; onConnect: (id: ID, t: Link, other: ID) => Promise<void> }) {
  const [type, setType] = useState<Link>('child')
  const [other, setOther] = useState(others[0]?.id ?? '')
  const [done, setDone] = useState(false)
  if (!others.length) return null
  return (
    <div className="connect card inset">
      <p className="label">Connect {person.name.split(' ')[0]} to someone</p>
      <div className="grid2">
        <select value={type} onChange={(e) => setType(e.target.value as Link)}>{(Object.keys(LINK_LABEL) as Link[]).map((k) => <option key={k} value={k}>{LINK_LABEL[k]}</option>)}</select>
        <select value={other} onChange={(e) => setOther(e.target.value)}>{others.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      </div>
      <button className="btn secondary small" onClick={async () => { await onConnect(person.id, type, other); setDone(true); setTimeout(() => setDone(false), 1500) }}>
        {done ? <><Icon name="check" size={16} /> Connected</> : 'Connect'}
      </button>
    </div>
  )
}

/** Connections that look missing on the tree, e.g. Mom is Dad's partner but isn't yet Rose's parent. */
function GapSuggestions() {
  const { data, save, settings } = useData()
  const hidden = new Set(settings.dismissed ?? [])
  const gaps = suggestGaps(data.people, data.relations).filter((g) => !hidden.has(g.key))
  if (!gaps.length) return null
  const name = (id: ID) => data.people.find((p) => p.id === id)?.name ?? ''
  return (
    <section className="suggestions" aria-label="Suggested connections">
      <p className="label"><Icon name="tree" size={14} /> Suggested connections</p>
      {gaps.slice(0, 6).map((g) => (
        <div key={g.key} className="suggestion">
          <div className="suggestion-body">
            <strong>{name(g.person)} — {LINK_LABEL[g.type].toLowerCase()} {name(g.other)}?</strong>
            <small>Because {g.reason}.</small>
          </div>
          <div className="suggestion-actions">
            <button className="btn small" onClick={() => linkPeople({ people: data.people, relations: [...data.relations], save }, g.person, g.type, g.other)}>Yes</button>
            <button className="icon-btn" aria-label={`Not right: ${name(g.person)} and ${name(g.other)}`}
              onClick={() => save('settings', { ...settings, dismissed: [...(settings.dismissed ?? []), g.key] })}>✕</button>
          </div>
        </div>
      ))}
    </section>
  )
}
