import { useState } from 'react'
import { useData } from '../lib/data'
import { useRecorder, clock, canRecord } from '../lib/recorder'
import { uid } from '../lib/store'
import type { MedicalCategory, MedicalItem } from '../lib/types'
import { Empty, FileButton, Icon, Media, ScreenHeader, Sheet } from '../components/ui'
import { TextField } from '../components/TextField'
import { ItemDocs, SummarizeSheet } from '../components/DocSummary'
import { listDocuments, type DocRef } from '../lib/docSummary'
import { FAMILY_HISTORY } from '../lib/familyHistory'
import { AskSheet, Contributions, Waiting } from '../components/AskSheet'
import { medicalDrafts, type Draft } from '../lib/drafts'

export const MED_CATS: Record<MedicalCategory, { label: string; one: string; hint: string; tone: string }> = {
  allergy: { label: 'Allergies', one: 'Allergy', hint: 'What it is and what happens (e.g. penicillin — hives).', tone: 'red' },
  medication: { label: 'Medications', one: 'Medication', hint: 'Snap a photo of the bottle label — it has the name, dose and pharmacy.', tone: 'blue' },
  condition: { label: 'Conditions', one: 'Condition', hint: 'Diagnoses and ongoing health issues, in plain words.', tone: 'amber' },
  doctor: { label: 'Doctors & Care Team', one: 'Doctor or contact', hint: 'Doctors, pharmacy, home care, and who to call.', tone: 'green' },
  history: { label: 'Medical History', one: 'History item', hint: 'Surgeries, hospital stays, doctor’s notes and test results.', tone: 'violet' },
  insurance: { label: 'Insurance & Documents', one: 'Document', hint: 'Insurance cards, Medicare, power of attorney. Keep this plan private.', tone: 'slate' },
  wishes: { label: 'Care Wishes', one: 'Care wish', hint: 'Advance directive, end-of-life wishes, what comforts you.', tone: 'rose' },
  family: { label: 'Family Health History', one: 'Family history', hint: 'Conditions that run in the family — who had them and about what age. Doctors often ask.', tone: 'violet' },
}
const ORDER: MedicalCategory[] = ['allergy', 'medication', 'condition', 'doctor', 'history', 'insurance', 'wishes', 'family']

const askAbout = (i: Pick<MedicalItem, 'category' | 'title'>) =>
  i.category === 'family'
    ? FAMILY_HISTORY.find((f) => f.title === i.title)?.question ?? `What do you know about ${i.title.toLowerCase()} in our family?`
    : medicalDrafts(i)[0]?.text ?? `What do you know about ${i.title}?`

export default function Medical() {
  const { data, isOwner } = useData()
  const [editing, setEditing] = useState<MedicalItem | MedicalCategory | null>(null)
  const [asking, setAsking] = useState<{ question: string; target: NonNullable<import('../lib/types').Ask['target']>; suggestions?: Draft[] } | null>(null)
  const [surveying, setSurveying] = useState(false)
  const [summarizing, setSummarizing] = useState<DocRef[] | null>(null)
  const docs = listDocuments(data, { medical: true }).filter((d) => d.owner === 'medical')
  const docsFor = (id?: string) => docs.filter((d) => d.itemId === id)
  const unsummarized = docs.filter((d) => !d.summary)
  const items = data.medical
  const checklist = new Set(FAMILY_HISTORY.map((f) => f.title))
  const by = (c: MedicalCategory) => items.filter((i) => i.category === c && !(c === 'family' && checklist.has(i.title))).sort((a, b) => a.title.localeCompare(b.title))
  const waitingFor = (i: Pick<MedicalItem, 'category' | 'title'> & { id?: string }) =>
    data.asks.filter((a) => !a.answeredAt && !a.surveyId && a.target?.kind === 'medical' && (a.target.itemId === i.id || (a.target.category === i.category && a.target.title === i.title)))

  return (
    <div className="screen">
      <ScreenHeader title="Medical Binder" sub={isOwner ? 'Everything your family needs to help care for you, labeled so it’s easy to find.' : 'What you need to know to help with care.'}
        action={items.length ? <button className="icon-btn ring no-print" onClick={() => window.print()} aria-label="Print"><Icon name="print" /></button> : undefined} />

      {items.length > 0 && <EmergencyCard allergies={by('allergy')} meds={by('medication')} doctors={by('doctor')} />}

      {!items.length && (
        <Empty icon="pill" title={isOwner ? 'Start your medical binder' : 'Nothing added yet'}>
          {isOwner && <p>Snap photos of your medicine bottles, add your doctors, or record a voice note about your health history.</p>}
        </Empty>
      )}

      {isOwner && unsummarized.length > 0 && (
        <div className="card survey-card no-print">
          <div>
            <strong>{unsummarized.length} document{unsummarized.length === 1 ? '' : 's'} without a summary</strong>
            <p className="muted small">Get a plain-language summary of each one — what’s worth a closer look, what looks good, and questions for the doctor — using your own AI app.</p>
          </div>
          <button className="btn small" onClick={() => setSummarizing(unsummarized)}><Icon name="sparkle" size={16} /> Summarize {unsummarized.length === 1 ? 'it' : 'them'}</button>
        </div>
      )}

      {isOwner && (
        <div className="quick-add no-print">
          {ORDER.map((c) => (
            <button key={c} className={`chip tone-${MED_CATS[c].tone}`} onClick={() => setEditing(c)}><Icon name="plus" size={16} /> {MED_CATS[c].one}</button>
          ))}
        </div>
      )}

      {ORDER.filter((c) => by(c).length).map((c) => (
        <section key={c} className="med-section">
          <h3 className={`med-label tone-${MED_CATS[c].tone}`}>{MED_CATS[c].label}</h3>
          {by(c).map((i) => (
            <article key={i.id} className="card med-item" onClick={() => isOwner && setEditing(i)} role={isOwner ? 'button' : undefined}>
              <div className="med-head">
                <strong>{i.title}</strong>
                {(i.dosage || i.schedule) && <span className="pill-tag">{[i.dosage, i.schedule].filter(Boolean).join(' · ')}</span>}
              </div>
              {i.details && <p>{i.details}</p>}
              {i.prescriber && <p className="muted small">Prescribed by {i.prescriber}</p>}
              {i.phone && <a className="chip" href={`tel:${i.phone}`} onClick={(e) => e.stopPropagation()}>Call {i.phone}</a>}
              {i.mediaIds.length > 0 && <div className="media-stack" onClick={(e) => e.stopPropagation()}>{i.mediaIds.map((m) => <Media key={m} id={m} />)}</div>}
              {isOwner ? <ItemDocs docs={docsFor(i.id)} onSummarize={setSummarizing} /> : <ItemDocs docs={docsFor(i.id).filter((d) => d.summary)} onSummarize={() => null} />}
              <Contributions items={i.contributions} label="added" />
              {isOwner && <Waiting asks={waitingFor(i)} />}
              {isOwner && (
                <button className="ask-chip no-print" onClick={(e) => { e.stopPropagation(); setAsking({ question: askAbout(i), suggestions: medicalDrafts(i), target: { kind: 'medical', itemId: i.id, category: i.category, title: i.title } }) }}>
                  <Icon name="share" size={14} /> Ask family
                </button>
              )}
            </article>
          ))}
        </section>
      ))}

      <section className="med-section">
        <h3 className="med-label tone-violet">Family Health History</h3>
        <p className="muted small">Doctors often ask about these. Answer what you know, or ask a relative who might remember.</p>
        {isOwner && (
          <div className="card survey-card no-print">
            <div>
              <strong>Ask family all of these at once</strong>
              <p className="muted small">Send one link with every question. They answer what they know, skip the rest, tap Send — and each answer lands right here.</p>
              {(() => {
                // One line per person the survey went to, instead of "waiting" on every question.
                const sent = new Map<string, { name: string; done: boolean }>()
                for (const a of data.asks.filter((x) => x.surveyId)) {
                  const cur = sent.get(a.surveyId!)
                  sent.set(a.surveyId!, { name: a.toName === 'everyone' ? 'your family thread' : a.toName, done: (cur?.done ?? false) || !!a.answeredAt })
                }
                const list = [...sent.values()]
                if (!list.length) return null
                const waiting = list.filter((x) => !x.done).map((x) => x.name)
                const done = list.filter((x) => x.done).map((x) => x.name)
                return <p className="small survey-status">{[done.length ? `Answered: ${done.join(', ')}` : '', waiting.length ? `Waiting on: ${waiting.join(', ')}` : ''].filter(Boolean).join(' · ')}</p>
              })()}
            </div>
            <button className="btn small" onClick={() => setSurveying(true)}><Icon name="share" size={16} /> Send as a survey</button>
          </div>
        )}
        {FAMILY_HISTORY.map((f) => {
          const item = items.find((i) => i.category === 'family' && i.title === f.title)
          const answered = !!item && !!(item.details || item.contributions?.length || item.mediaIds.length)
          if (!isOwner && !answered) return null
          return (
            <article key={f.title} className={`card med-item history-q ${answered ? 'answered' : ''}`}>
              <div className="med-head"><strong>{f.title}</strong>{answered && <Icon name="check" size={18} />}</div>
              {!answered && <p className="muted small">{f.question}</p>}
              {item?.details && <p>{item.details}</p>}
              {item && item.mediaIds.length > 0 && <div className="media-stack">{item.mediaIds.map((m) => <Media key={m} id={m} />)}</div>}
              {item && <ItemDocs docs={docsFor(item.id).filter((d) => isOwner || d.summary)} onSummarize={setSummarizing} />}
              <Contributions items={item?.contributions} label="added" />
              {isOwner && <Waiting asks={waitingFor({ id: item?.id, category: 'family', title: f.title })} />}
              {isOwner && (
                <div className="row wrap no-print">
                  <button className="btn secondary small" onClick={() => setEditing(item ?? { id: uid(), category: 'family', title: f.title, details: '', mediaIds: [], createdAt: Date.now() })}>
                    <Icon name={item?.details ? 'type' : 'mic'} size={16} /> {item?.details ? 'Edit' : 'Answer'}
                  </button>
                  <button className="btn ghost small" onClick={() => setAsking({ question: f.question, target: { kind: 'medical', itemId: item?.id, category: 'family', title: f.title } })}>
                    <Icon name="share" size={16} /> Ask family
                  </button>
                </div>
              )}
            </article>
          )
        })}
      </section>

      <p className="disclaimer">This binder helps your family stay informed. It isn’t a medical record — always confirm medications and doses with a doctor or pharmacist.</p>

      {editing && <MedicalSheet item={typeof editing === 'string' ? null : editing} category={typeof editing === 'string' ? editing : editing.category} onClose={() => setEditing(null)}
        onAsk={(it) => { setEditing(null); setAsking({ question: askAbout(it), suggestions: medicalDrafts(it), target: { kind: 'medical', itemId: it.id, category: it.category, title: it.title } }) }} />}
      {summarizing && <SummarizeSheet docs={summarizing} onClose={() => setSummarizing(null)} />}
      {surveying && (
        <AskSheet question="" onClose={() => setSurveying(false)} survey={{
          title: 'Family health history',
          why: 'our family health history, so doctors and the generations after us know what runs in the family',
          items: FAMILY_HISTORY.map((f) => {
            const item = items.find((i) => i.category === 'family' && i.title === f.title)
            return { label: f.title, question: f.question, target: { kind: 'medical', itemId: item?.id, category: 'family', title: f.title }, checked: !item?.details }
          }),
        }} />
      )}
      {asking && <AskSheet question={asking.question} suggestions={asking.suggestions} target={asking.target} onClose={() => setAsking(null)} />}
    </div>
  )
}

function EmergencyCard({ allergies, meds, doctors }: { allergies: MedicalItem[]; meds: MedicalItem[]; doctors: MedicalItem[] }) {
  return (
    <section className="card emergency">
      <h3><Icon name="heart" size={18} /> At a glance</h3>
      <dl>
        <dt>Allergies</dt>
        <dd className={allergies.length ? 'alert' : ''}>{allergies.length ? allergies.map((a) => a.title).join(', ') : 'None listed'}</dd>
        <dt>Medications</dt>
        <dd>{meds.length ? meds.map((m) => `${m.title}${m.dosage ? ` ${m.dosage}` : ''}${m.schedule ? ` (${m.schedule})` : ''}`).join('; ') : 'None listed'}</dd>
        {doctors.length > 0 && <><dt>Call</dt><dd>{doctors.map((d) => <a key={d.id} href={d.phone ? `tel:${d.phone}` : undefined}>{d.title}{d.phone ? ` · ${d.phone}` : ''}</a>)}</dd></>}
      </dl>
    </section>
  )
}

function MedicalSheet({ item, category, onClose, onAsk }: { item: MedicalItem | null; category: MedicalCategory; onClose: () => void; onAsk: (i: MedicalItem) => void }) {
  const { save, remove, store } = useData()
  const [f, setF] = useState<MedicalItem>(item ?? { id: uid(), category, title: '', details: '', mediaIds: [], createdAt: Date.now() })
  const [busy, setBusy] = useState(false)
  const rec = useRecorder()
  const cat = MED_CATS[f.category]
  const set = (k: keyof MedicalItem, v: any) => setF((x) => ({ ...x, [k]: v }))

  const addMedia = async (blob: Blob) => {
    setBusy(true)
    const id = await store.putMedia(blob, 'medical')
    setF((x) => ({ ...x, mediaIds: [...x.mediaIds, id] }))
    setBusy(false)
  }

  return (
    <Sheet title={item ? `Edit ${cat.one.toLowerCase()}` : `Add ${cat.one.toLowerCase()}`} onClose={onClose}>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault()
        if (!f.title.trim() && !f.mediaIds.length) return
        await save('medical', { ...f, title: f.title.trim() || `${cat.one} (see photo)` })
        onClose()
      }}>
        <label className="field"><span>Label</span>
          <select value={f.category} onChange={(e) => set('category', e.target.value)}>
            {ORDER.map((c) => <option key={c} value={c}>{MED_CATS[c].label}</option>)}
          </select>
        </label>
        <p className="hint">{cat.hint}</p>

        <div className="row wrap">
          <FileButton label="Take photo" icon="camera" accept="image/*" capture onFile={addMedia} />
          <FileButton label="Upload notes" accept="image/*,application/pdf" onFile={addMedia} />
          {canRecord && (rec.state === 'recording'
            ? <button type="button" className="btn danger" onClick={async () => { const out = await rec.stop(); if (out) { await addMedia(out.blob); if (out.transcript) set('details', [f.details, out.transcript].filter(Boolean).join('\n')) } }}><Icon name="stop" size={18} /> Stop {clock(rec.seconds)}</button>
            : <button type="button" className="btn secondary" onClick={() => rec.start('audio')}><Icon name="mic" size={18} /> Voice note</button>)}
        </div>
        {f.mediaIds.length > 0 && <div className="media-stack">{f.mediaIds.map((m) => <Media key={m} id={m} />)}</div>}

        <TextField id="med-title" label={f.category === 'doctor' ? 'Name & role' : f.category === 'family' ? 'Condition' : 'Name'} value={f.title} onChange={(v) => set('title', v)}
          placeholder={f.category === 'medication' ? 'e.g. Lisinopril' : f.category === 'doctor' ? 'e.g. Dr. Patel, cardiologist' : ''} />
        {f.category === 'medication' && (
          <div className="grid2">
            <TextField id="med-dose" label="Dose" value={f.dosage ?? ''} onChange={(v) => set('dosage', v)} placeholder="10 mg" />
            <TextField id="med-when" label="When" value={f.schedule ?? ''} onChange={(v) => set('schedule', v)} placeholder="Every morning" />
            <div className="full"><TextField id="med-prescriber" label="Prescribed by" value={f.prescriber ?? ''} onChange={(v) => set('prescriber', v)} /></div>
          </div>
        )}
        {f.category === 'doctor' && (
          <TextField id="med-phone" label="Phone" type="tel" value={f.phone ?? ''} onChange={(v) => set('phone', v)} />
        )}
        <TextField id="med-details" multiline label={f.category === 'family' ? 'Who had it, and about what age' : 'What your family should know'} value={f.details} onChange={(v) => set('details', v)}
          placeholder={f.category === 'family' ? 'e.g. My father had a heart attack at 62; his brother had bypass surgery.' : 'In plain words — what it’s for, what to watch for, anything that helps.'}
          onAsk={f.title.trim() ? async () => {
            // Keep anything already typed, then ask.
            const kept = { ...f, title: f.title.trim() }
            if (kept.details.trim() || kept.mediaIds.length || item) await save('medical', kept)
            onAsk(kept)
          } : undefined} />
        <Contributions items={f.contributions} label="added" />
        <div className="row between">
          <button className="btn" disabled={busy}>Save</button>
          {item && <button type="button" className="btn ghost danger-text" onClick={async () => { await remove('medical', item.id); onClose() }}><Icon name="trash" size={18} /> Delete</button>}
        </div>
      </form>
    </Sheet>
  )
}
