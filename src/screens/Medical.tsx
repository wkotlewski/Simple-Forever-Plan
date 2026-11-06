import { useState } from 'react'
import { useData } from '../lib/data'
import { useRecorder, clock, canRecord } from '../lib/recorder'
import { uid } from '../lib/store'
import type { MedicalCategory, MedicalItem } from '../lib/types'
import { Empty, FileButton, Icon, Media, ScreenHeader, Sheet } from '../components/ui'

export const MED_CATS: Record<MedicalCategory, { label: string; one: string; hint: string; tone: string }> = {
  allergy: { label: 'Allergies', one: 'Allergy', hint: 'What it is and what happens (e.g. penicillin — hives).', tone: 'red' },
  medication: { label: 'Medications', one: 'Medication', hint: 'Snap a photo of the bottle label — it has the name, dose and pharmacy.', tone: 'blue' },
  condition: { label: 'Conditions', one: 'Condition', hint: 'Diagnoses and ongoing health issues, in plain words.', tone: 'amber' },
  doctor: { label: 'Doctors & Care Team', one: 'Doctor or contact', hint: 'Doctors, pharmacy, home care, and who to call.', tone: 'green' },
  history: { label: 'Medical History', one: 'History item', hint: 'Surgeries, hospital stays, doctor’s notes and test results.', tone: 'violet' },
  insurance: { label: 'Insurance & Documents', one: 'Document', hint: 'Insurance cards, Medicare, power of attorney. Keep this plan private.', tone: 'slate' },
  wishes: { label: 'Care Wishes', one: 'Care wish', hint: 'Advance directive, end-of-life wishes, what comforts you.', tone: 'rose' },
}
const ORDER: MedicalCategory[] = ['allergy', 'medication', 'condition', 'doctor', 'history', 'insurance', 'wishes']

export default function Medical() {
  const { data, isOwner } = useData()
  const [editing, setEditing] = useState<MedicalItem | MedicalCategory | null>(null)
  const items = data.medical
  const by = (c: MedicalCategory) => items.filter((i) => i.category === c).sort((a, b) => a.title.localeCompare(b.title))

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
            </article>
          ))}
        </section>
      ))}

      <p className="disclaimer">This binder helps your family stay informed. It isn’t a medical record — always confirm medications and doses with a doctor or pharmacist.</p>

      {editing && <MedicalSheet item={typeof editing === 'string' ? null : editing} category={typeof editing === 'string' ? editing : editing.category} onClose={() => setEditing(null)} />}
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

function MedicalSheet({ item, category, onClose }: { item: MedicalItem | null; category: MedicalCategory; onClose: () => void }) {
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

        <label className="field"><span>{f.category === 'doctor' ? 'Name & role' : 'Name'}</span>
          <input value={f.title} onChange={(e) => set('title', e.target.value)} placeholder={f.category === 'medication' ? 'e.g. Lisinopril' : f.category === 'doctor' ? 'e.g. Dr. Patel, cardiologist' : ''} />
        </label>
        {f.category === 'medication' && (
          <div className="grid2">
            <label className="field"><span>Dose</span><input value={f.dosage ?? ''} onChange={(e) => set('dosage', e.target.value)} placeholder="10 mg" /></label>
            <label className="field"><span>When</span><input value={f.schedule ?? ''} onChange={(e) => set('schedule', e.target.value)} placeholder="Every morning" /></label>
            <label className="field full"><span>Prescribed by</span><input value={f.prescriber ?? ''} onChange={(e) => set('prescriber', e.target.value)} /></label>
          </div>
        )}
        {f.category === 'doctor' && (
          <label className="field"><span>Phone</span><input type="tel" value={f.phone ?? ''} onChange={(e) => set('phone', e.target.value)} /></label>
        )}
        <label className="field"><span>What your family should know</span>
          <textarea rows={4} value={f.details} onChange={(e) => set('details', e.target.value)} placeholder="In plain words — what it’s for, what to watch for, anything that helps." />
        </label>
        <div className="row between">
          <button className="btn" disabled={busy}>Save</button>
          {item && <button type="button" className="btn ghost danger-text" onClick={async () => { await remove('medical', item.id); onClose() }}><Icon name="trash" size={18} /> Delete</button>}
        </div>
      </form>
    </Sheet>
  )
}
