import { useEffect, useMemo, useState } from 'react'
import { useData } from '../lib/data'
import { shareToAi, toSpeechWav } from '../lib/aiShare'
import { docxText, parseFamilyText, parseGedcom, TREE_PICTURE_PROMPT, type FamilyDraft } from '../lib/familyParse'
import { applyFamilyDraft, type DraftChoices } from '../lib/familyApply'
import { TextField } from './TextField'
import { FileButton, Icon, Sheet } from './ui'

const EXAMPLE = 'My parents were Stanley and Helen Kowalski. I have a brother named Joe and two sisters, Anna and Mary. Joe married Linda and they have two kids, Tom and Lisa. My mom’s parents were Frank and Rose Nowak.'

/**
 * Add a whole family at once: talk or type it the way you'd tell a friend, bring in a voice recording,
 * a family tree file (from Ancestry, FamilySearch…), a Word document, or — with an AI app's help — a picture.
 * Everything is shown for checking before it's added.
 */
const RECORDING_PROMPT = `Please write out the attached recording word for word. It's me describing my family — names, who is married to whom, children, and years.

- Write only the words that are spoken — no summary or comments.
- Spell names as carefully as you can. If a word is hard to make out, write [unclear].`

export function BulkFamily({ onClose, initialText, intro, onAdded }: {
  onClose: () => void
  /** Start with this text already read (e.g. a family tree a relative filled in). */
  initialText?: string
  intro?: string
  onAdded?: () => void
}) {
  const { data, save, settings, session } = useData()
  const selfName = settings.storytellerName || session.name
  const ctx = { people: data.people, relations: data.relations, selfName }
  const [text, setText] = useState(initialText ?? '')
  const [draft, setDraft] = useState<FamilyDraft | null>(null)
  const [choices, setChoices] = useState<DraftChoices | null>(null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // A picture or recording that needs the person's AI app to turn it into words.
  const [aiFile, setAiFile] = useState<{ file: File; kind: 'picture' | 'recording' } | null>(null)
  const [aiNote, setAiNote] = useState('')
  const [copied, setCopied] = useState(false)

  function review(d: FamilyDraft) {
    if (!d.people.some((p) => !p.isSelf) && !d.links.length) {
      setError('I couldn’t find any family members in that. Try sentences like the example, with names starting with a capital letter.')
      return
    }
    setError('')
    setDraft(d)
    setChoices({
      people: Object.fromEntries(d.people.map((p) => [p.key, { include: true, name: p.name, born: p.born, died: p.died }])),
      links: new Set(d.links.map((l) => l.key)),
      selfKey: !d.usedSelf && !data.people.some((x) => x.isSelf) ? d.people.find((p) => p.name.toLowerCase() === selfName.toLowerCase())?.key : undefined,
    })
  }

  async function openFile(f: File) {
    setError(''); setStatus(''); setAiFile(null); setAiNote('')
    const n = f.name.toLowerCase()
    try {
      if (n.endsWith('.ged')) { review(parseGedcom(await f.text(), ctx)); return }
      if (n.endsWith('.docx')) {
        const body = await docxText(f)
        setText((t) => [t, body].filter(Boolean).join('\n'))
        setStatus('Text brought in from your document. Check it, then tap Read my family.')
        return
      }
      if (f.type.startsWith('text/') || /\.(txt|md|csv)$/.test(n)) {
        const body = await f.text()
        setText((t) => [t, body].filter(Boolean).join('\n'))
        setStatus('Text brought in. Check it, then tap Read my family.')
        return
      }
      if (f.type.startsWith('audio/') || f.type.startsWith('video/')) {
        setBusy(true)
        const wav = await toSpeechWav(f, f.name.replace(/\.[^.]+$/, '')).catch(() => null)
        setAiFile({ file: wav ?? f, kind: 'recording' }); return
      }
      if (f.type.startsWith('image/') || n.endsWith('.pdf')) { setAiFile({ file: f, kind: 'picture' }); return }
      setError('That kind of file can’t be read here. Try a family tree file (.ged), a Word document, or a recording.')
    } catch (e: any) {
      setError(e?.message ?? 'That file couldn’t be read.')
    } finally {
      setBusy(false)
    }
  }

  // Something to review straight away: read it once when the sheet opens.
  useEffect(() => { if (initialText?.trim()) review(parseFamilyText(initialText, ctx)) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (draft && choices) {
    return <Review draft={draft} choices={choices} setChoices={setChoices} onBack={() => { setDraft(null); setChoices(null) }}
      onAdd={async () => {
        setBusy(true)
        try {
          const r = await applyFamilyDraft(draft, choices, { people: data.people, relations: data.relations, save, selfName })
          setStatus(`Added ${r.added} ${r.added === 1 ? 'person' : 'people'} and ${r.connected} connection${r.connected === 1 ? '' : 's'}.`)
          onAdded?.()
          onClose()
        } catch (e: any) { setError(e?.message ?? 'Couldn’t add them.') }
        setBusy(false)
      }} busy={busy} onClose={onClose} intro={intro} />
  }

  return (
    <Sheet title="Add your family" onClose={onClose}>
      <div className="stack">
        <p className="muted">Tell me about your family the way you’d tell a friend — talk or type. I’ll work out who’s who, and you can check everything before it’s added.</p>
        <details className="example">
          <summary>See an example</summary>
          <p>{EXAMPLE}</p>
          <button type="button" className="link-btn" onClick={() => setText(EXAMPLE)}>Try this example</button>
        </details>
        <TextField id="bulk-family" multiline rows={7} label="Your family — tap the microphone to talk" value={text} onChange={setText}
          placeholder="My parents were… I have a brother named… My mom’s parents were…" />
        {error && <p className="error">{error}</p>}
        {status && <p className="muted small" role="status">{status}</p>}
        <button className="btn big" disabled={busy || !text.trim()} onClick={() => review(parseFamilyText(text, ctx))}>
          <Icon name="tree" size={20} /> Read my family
        </button>

        <div className="bring-in">
          <span className="field-title">Or bring it in</span>
          <div className="row wrap">
            <FileButton label="A voice recording" icon="mic" accept="audio/*,video/*" onFile={openFile} />
            <FileButton label="A family tree file or document" icon="upload" accept=".ged,.docx,.txt,.md,.csv,image/*,.pdf" onFile={openFile} />
          </div>
          <p className="muted small">Family tree files (.ged) come from Ancestry, FamilySearch, MyHeritage and most family tree apps — look for “Export” or “Download GEDCOM”.</p>
        </div>

        {aiFile && (
          <div className="card inset stack">
            <h3>{aiFile.kind === 'picture' ? 'Reading a picture of a tree' : 'Writing out your recording'}</h3>
            <p className="small">This needs your AI app’s help (ChatGPT, Gemini, Claude…). Send it with the instructions, then copy what it writes, paste it into the box above, and tap <strong>Read my family</strong>.</p>
            <div className="row wrap">
              <button className="btn small" onClick={async () => {
                const prompt = aiFile.kind === 'picture' ? TREE_PICTURE_PROMPT : RECORDING_PROMPT
                const r = await shareToAi(aiFile.file, prompt)
                if (r === 'shared') setAiNote('Sent. Now paste the instructions in the message box (they’re copied) and send.')
                if (r === 'saved') setAiNote('Saved and instructions copied. In your AI app, attach the file, paste, and send.')
              }}><Icon name="share" size={16} /> Send to my AI app</button>
              <button className="btn ghost small" onClick={async () => {
                try { await navigator.clipboard.writeText(aiFile.kind === 'picture' ? TREE_PICTURE_PROMPT : RECORDING_PROMPT); setCopied(true) } catch { setCopied(false) }
              }}><Icon name={copied ? 'check' : 'type'} size={16} /> {copied ? 'Copied' : 'Copy instructions'}</button>
            </div>
            {aiNote && <p className="muted small">{aiNote}</p>}
          </div>
        )}
      </div>
    </Sheet>
  )
}

function Review({ draft, choices, setChoices, onBack, onAdd, busy, onClose, intro }: {
  draft: FamilyDraft; choices: DraftChoices; setChoices: (c: DraftChoices) => void; onBack: () => void; onAdd: () => void; busy: boolean; onClose: () => void; intro?: string
}) {
  const { data } = useData()
  const setP = (k: string, patch: Partial<DraftChoices['people'][string]>) => setChoices({ ...choices, people: { ...choices.people, [k]: { ...choices.people[k], ...patch } } })
  const toggleLink = (k: string, on: boolean) => { const s = new Set(choices.links); on ? s.add(k) : s.delete(k); setChoices({ ...choices, links: s }) }
  const display = (k: string) => {
    const c = choices.people[k]
    if (c?.sameAs) return display(c.sameAs)
    const p = draft.people.find((x) => x.key === k)
    if (p?.isSelf || choices.selfKey === k) return 'You'
    return c?.name.trim() || p?.label || 'Someone'
  }
  const included = (k: string): boolean => { const c = choices.people[k]; return !!c?.include && (c.sameAs ? included(c.sameAs) : true) }
  const needsName = draft.people.filter((p) => p.placeholder && choices.people[p.key].include && !choices.people[p.key].sameAs && !choices.people[p.key].name.trim())
  const newCount = draft.people.filter((p) => !p.existingId && !p.isSelf && included(p.key) && !choices.people[p.key].sameAs).length
  const linkCount = draft.links.filter((l) => choices.links.has(l.key) && included(l.a) && included(l.b)).length
  const noSelfOnTree = !data.people.some((p) => p.isSelf) && !draft.usedSelf
  const others = useMemo(() => draft.people.filter((p) => !p.placeholder), [draft])

  return (
    <Sheet title="Check your family" onClose={onClose}>
      <div className="stack">
        {intro && <p className="success small">{intro}</p>}
        <p className="muted">Here’s what I understood. Fix any names or years, untick anything that’s wrong, then add.</p>

        {noSelfOnTree && (
          <label className="field">
            <span className="field-title">Which one is you?</span>
            <select value={choices.selfKey ?? ''} onChange={(e) => setChoices({ ...choices, selfKey: e.target.value || undefined })}>
              <option value="">None of these</option>
              {others.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
            </select>
          </label>
        )}

        <section className="stack">
          <h3>People</h3>
          {draft.people.map((p) => {
            const c = choices.people[p.key]
            const isYou = p.isSelf || choices.selfKey === p.key
            return (
              <div key={p.key} className={`review-person ${c.include ? '' : 'off'}`}>
                <label className="check review-include">
                  <input type="checkbox" checked={c.include} onChange={(e) => setP(p.key, { include: e.target.checked })} aria-label={`Include ${c.name || p.label}`} />
                </label>
                <div className="review-body">
                  <div className="review-tags">
                    {isYou && <span className="tag you">You</span>}
                    {p.existingId && !isYou && <span className="tag">On your tree</span>}
                    {!p.existingId && !isYou && <span className="tag new">New</span>}
                    {p.label && !isYou && <span className="tag quiet">{p.label}</span>}
                    {p.unconnected && <span className="tag warn">Not connected yet</span>}
                  </div>
                  {isYou ? <strong>{c.name}</strong> : (
                    <input aria-label="Name" value={c.name} placeholder={p.placeholder ? `${p.label}’s name` : 'Name'} onChange={(e) => setP(p.key, { name: e.target.value })} disabled={!!c.sameAs} />
                  )}
                  {p.placeholder && (
                    <label className="small same-as">
                      or the same person as{' '}
                      <select value={c.sameAs ?? ''} onChange={(e) => setP(p.key, { sameAs: e.target.value || undefined })}>
                        <option value="">—</option>
                        {others.filter((o) => !o.isSelf).map((o) => <option key={o.key} value={o.key}>{choices.people[o.key].name || o.label}</option>)}
                      </select>
                    </label>
                  )}
                  {!c.sameAs && (
                    <div className="review-years">
                      <input aria-label="Born" value={c.born ?? ''} placeholder="Born" onChange={(e) => setP(p.key, { born: e.target.value })} />
                      <input aria-label="Passed" value={c.died ?? ''} placeholder="Passed" onChange={(e) => setP(p.key, { died: e.target.value })} />
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </section>

        {draft.links.length > 0 && (
          <section className="stack">
            <h3>How they’re connected</h3>
            {draft.links.map((l) => {
              const on = choices.links.has(l.key) && included(l.a) && included(l.b)
              const text = l.type === 'parent' ? <><strong>{display(l.a)}</strong> — parent of <strong>{display(l.b)}</strong></>
                : l.type === 'spouse' ? <><strong>{display(l.a)}</strong> &amp; <strong>{display(l.b)}</strong> — partners</>
                  : <><strong>{display(l.a)}</strong> — brother or sister of <strong>{display(l.b)}</strong></>
              return (
                <label key={l.key} className={`check review-link ${included(l.a) && included(l.b) ? '' : 'off'}`}>
                  <input type="checkbox" checked={on} disabled={!included(l.a) || !included(l.b)} onChange={(e) => toggleLink(l.key, e.target.checked)} />
                  <span>{text}{l.why && <small className="muted"> · suggested because {l.why}</small>}</span>
                </label>
              )
            })}
          </section>
        )}

        {needsName.length > 0 && <p className="notice">Add a name for {needsName.map((p) => p.label?.toLowerCase()).join(', ')} — or pick who they are — or untick them.</p>}
        <button className="btn big" disabled={busy || needsName.length > 0 || (!newCount && !linkCount)} onClick={onAdd}>
          {busy ? 'Adding…' : `Add ${newCount} ${newCount === 1 ? 'person' : 'people'}${linkCount ? ` and ${linkCount} connection${linkCount === 1 ? '' : 's'}` : ''}`}
        </button>
        <button className="btn ghost" onClick={onBack}><Icon name="back" size={16} /> Back to edit</button>
      </div>
    </Sheet>
  )
}
