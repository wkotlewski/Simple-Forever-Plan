import { useState } from 'react'
import type { AskPayload } from '../lib/ask'
import { smsLink } from '../lib/ask'
import { inboxAvailable, sendAnswer } from '../lib/inbox'
import { countPeople, RELATIONS, TREE_MARK, treeSentences, type TreePerson, type TreeSurveyAnswers } from '../lib/treeSurvey'
import { Icon } from '../components/ui'
import { TextField } from '../components/TextField'

const blank = (): TreePerson => ({ name: '' })
const first = (p: TreePerson, fallback: string) => p.name.trim().split(' ')[0] || fallback

/** One person: name, plus optional years. Every box takes typing or the microphone. */
function PersonRow({ id, label, p, onChange, onRemove }: { id: string; label: string; p: TreePerson; onChange: (p: TreePerson) => void; onRemove?: () => void }) {
  const [years, setYears] = useState(!!(p.born || p.died))
  return (
    <div className="tree-person">
      <div className="row between">
        <span className="field-title">{label}</span>
        {onRemove && <button type="button" className="icon-btn small" aria-label={`Remove ${p.name || 'this person'}`} onClick={onRemove}>✕</button>}
      </div>
      <TextField id={`${id}-name`} label="" value={p.name} onChange={(v) => onChange({ ...p, name: v })} placeholder="First and last name" />
      {years ? (
        <div className="grid2">
          <input id={`${id}-born`} inputMode="numeric" placeholder="Year born" value={p.born ?? ''} onChange={(e) => onChange({ ...p, born: e.target.value.replace(/[^\d]/g, '').slice(0, 4) })} />
          <input id={`${id}-died`} inputMode="numeric" placeholder="Year passed (if so)" value={p.died ?? ''} onChange={(e) => onChange({ ...p, died: e.target.value.replace(/[^\d]/g, '').slice(0, 4) })} />
        </div>
      ) : p.name.trim() ? <button type="button" className="link-btn small" onClick={() => setYears(true)}>+ Add years (optional)</button> : null}
    </div>
  )
}

/** A list where they can add as many people as they like. */
function PeopleList({ id, noun, people, onChange }: { id: string; noun: string; people: TreePerson[]; onChange: (p: TreePerson[]) => void }) {
  const list = people.length ? people : [blank()]
  return (
    <div className="stack">
      {list.map((p, i) => (
        <PersonRow key={i} id={`${id}-${i}`} label={`${noun} ${list.length > 1 ? i + 1 : ''}`.trim()} p={p}
          onChange={(np) => onChange(list.map((x, j) => (j === i ? np : x)))}
          onRemove={list.length > 1 ? () => onChange(list.filter((_, j) => j !== i)) : undefined} />
      ))}
      <button type="button" className="btn ghost small" onClick={() => onChange([...list, blank()])}><Icon name="plus" size={16} /> Add another</button>
    </div>
  )
}

/**
 * A relative helps fill in the family tree, a few names at a time: who they are, their parents, partner and kids,
 * brothers and sisters, and grandparents. Every step can be skipped. Tap Send once and it all goes to the storyteller,
 * who checks it before anything is added.
 */
export default function TreeSurvey({ ask, onDone, Brand, Footer }: { ask: AskPayload; onDone: () => void; Brand: () => JSX.Element; Footer: (p: { from: string }) => JSX.Element }) {
  const from = ask.from.split(' ')[0]
  const [a, setA] = useState<TreeSurveyAnswers>({
    rel: '', me: { name: ask.to === 'everyone' ? '' : '' }, parents: [blank(), blank()], siblings: [], children: [], grandparents: [blank(), blank(), blank(), blank()],
  })
  const [step, setStep] = useState(0)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const canSend = inboxAvailable && Boolean(ask.box)
  const me = first(a.me, 'you')
  const mom = first(a.parents[0], 'your mom'), dad = first(a.parents[1], 'your dad')

  const steps: { title: string; hint?: string; body: JSX.Element; ready?: boolean }[] = [
    {
      title: `How are you related to ${from}?`,
      ready: !!a.me.name.trim(),
      body: (
        <div className="stack">
          <div className="chips">{RELATIONS.map((r) => (
            <button type="button" key={r.rel} className={`chip ${a.rel === r.rel ? 'on' : ''}`} onClick={() => setA({ ...a, rel: r.rel })}>{r.label}</button>
          ))}</div>
          <PersonRow id="me" label="Your name" p={a.me} onChange={(p) => setA({ ...a, me: p })} />
        </div>
      ),
    },
    {
      title: 'Your parents',
      hint: 'Use maiden names if you know them.',
      body: (
        <div className="stack">
          <PersonRow id="mom" label="Your mother" p={a.parents[0]} onChange={(p) => setA({ ...a, parents: [p, a.parents[1]] })} />
          <PersonRow id="dad" label="Your father" p={a.parents[1]} onChange={(p) => setA({ ...a, parents: [a.parents[0], p] })} />
        </div>
      ),
    },
    {
      title: 'Your brothers and sisters',
      body: <PeopleList id="sib" noun="Brother or sister" people={a.siblings} onChange={(siblings) => setA({ ...a, siblings })} />,
    },
    {
      title: 'Your husband or wife, and your children',
      body: (
        <div className="stack">
          <PersonRow id="partner" label="Husband, wife or partner" p={a.partner ?? blank()} onChange={(p) => setA({ ...a, partner: p })} />
          <PeopleList id="kid" noun="Child" people={a.children} onChange={(children) => setA({ ...a, children })} />
        </div>
      ),
    },
    {
      title: 'Your grandparents',
      hint: 'Whatever you remember — even just first names help.',
      body: (
        <div className="stack">
          <p className="label">{mom === 'your mom' ? 'Your mom’s parents' : `${mom}’s parents`}</p>
          <PersonRow id="gp0" label="Grandmother" p={a.grandparents[0]} onChange={(p) => setA({ ...a, grandparents: [p, a.grandparents[1], a.grandparents[2], a.grandparents[3]] })} />
          <PersonRow id="gp1" label="Grandfather" p={a.grandparents[1]} onChange={(p) => setA({ ...a, grandparents: [a.grandparents[0], p, a.grandparents[2], a.grandparents[3]] })} />
          <p className="label">{dad === 'your dad' ? 'Your dad’s parents' : `${dad}’s parents`}</p>
          <PersonRow id="gp2" label="Grandmother" p={a.grandparents[2]} onChange={(p) => setA({ ...a, grandparents: [a.grandparents[0], a.grandparents[1], p, a.grandparents[3]] })} />
          <PersonRow id="gp3" label="Grandfather" p={a.grandparents[3]} onChange={(p) => setA({ ...a, grandparents: [a.grandparents[0], a.grandparents[1], a.grandparents[2], p] })} />
        </div>
      ),
    },
    {
      title: 'Anyone else?',
      hint: 'Aunts, uncles, cousins, step-family — tell it however you like, or skip.',
      body: <TextField id="tree-more" multiline rows={4} label="" value={a.more ?? ''} onChange={(v) => setA({ ...a, more: v })}
        placeholder={`e.g. My aunt Ruth married Bill Carter; their kids are Amy and Dan.`} />,
    },
  ]

  const n = countPeople(a)
  const sentences = treeSentences(a)
  const summary = [`Family tree for ${from}, from ${a.me.name.trim()}:`, sentences, a.more?.trim() ? `Also: ${a.more.trim()}` : ''].filter(Boolean).join('\n\n')

  async function send() {
    setSending(true); setError('')
    try { await sendAnswer(ask.box!, ask.id, 'Family tree', a.me.name.trim(), TREE_MARK + JSON.stringify(a)); setSent(true) }
    catch (e: any) { setError(`${e?.message ?? 'Couldn’t send.'} Your answers are still here — try again.`) }
    setSending(false)
  }

  const s = steps[step]
  const last = step === steps.length - 1

  return (
    <div className="welcome ask-page">
      <Brand />
      <div className="welcome-hero">
        <p className="eyebrow">{ask.from} is asking for your help</p>
        <h1 className="ask-question">Help fill in our family tree</h1>
        {!sent && <p className="ask-note">A few quick steps. Skip anything you don’t know — even a couple of names help.</p>}
        {ask.note && <p className="ask-note">{ask.note}</p>}
      </div>

      {sent ? (
        <div className="card stack center-text">
          <Icon name="heart" size={34} />
          <h2>Thank you, {me}.</h2>
          <p className="muted">{n} {n === 1 ? 'name is' : 'names are'} on the way to {from}, who’ll check them before adding them to the family tree.</p>
          <button className="btn secondary" onClick={() => { setSent(false); setStep(0) }}>Remembered more? Add to it</button>
          <p className="muted small">You can open this same link again any time.</p>
          <button className="link-btn" onClick={onDone}>Start a story of my own</button>
        </div>
      ) : (
        <div className="card stack">
          <div className="tree-progress" aria-label={`Step ${step + 1} of ${steps.length}`}>
            {steps.map((_, i) => <span key={i} className={i <= step ? 'on' : ''} />)}
          </div>
          <h2>{s.title}</h2>
          {s.hint && <p className="muted small">{s.hint}</p>}
          {s.body}
          {error && <p className="error">{error}</p>}
          {!last ? (
            <div className="row wrap">
              {step > 0 && <button className="btn ghost" onClick={() => setStep(step - 1)}><Icon name="back" size={16} /> Back</button>}
              <button className="btn" disabled={step === 0 && !s.ready} onClick={() => setStep(step + 1)}>{step === 0 ? 'Next' : 'Next — or skip'}</button>
            </div>
          ) : (
            <div className="stack">
              <p className="muted small">Ready: {n} {n === 1 ? 'name' : 'names'}{a.more?.trim() ? ' and your notes' : ''}.</p>
              {canSend ? (
                <button className="btn big" disabled={sending || !a.me.name.trim()} onClick={send}><Icon name="share" size={20} /> {sending ? 'Sending…' : `Finish and send to ${from}`}</button>
              ) : (
                <a className="btn big" href={smsLink(ask.reply ?? '', summary)}><Icon name="share" size={20} /> Text it to {from}</a>
              )}
              <button className="btn ghost" onClick={() => setStep(step - 1)}><Icon name="back" size={16} /> Back</button>
            </div>
          )}
        </div>
      )}
      <Footer from={ask.from} />
    </div>
  )
}
