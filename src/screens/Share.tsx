import { useEffect, useState } from 'react'
import { useData } from '../lib/data'
import { isEmail, makeAccessCode, normalizeContact } from '../lib/auth'
import { getSupabase } from '../lib/supabase'
import { uid } from '../lib/store'
import type { Member } from '../lib/types'
import { Icon, ScreenHeader } from '../components/ui'

const appUrl = () => window.location.origin + window.location.pathname

/**
 * Invite family. Each person gets a private code by email or text and enters it to open the plan.
 * With a backend, the code is a one-time sign-in code sent by the server; on this device only,
 * a code is created here and sent from your own phone's Messages or Mail app.
 */
export default function Share({ onBack }: { onBack: () => void }) {
  const { data, save, remove, session, store } = useData()
  const cloud = store.mode === 'cloud'
  const [members, setMembers] = useState<Member[]>(data.members)
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [medical, setMedical] = useState(true)
  const [error, setError] = useState('')
  const [sent, setSent] = useState<string | null>(null)

  // In cloud mode the member list lives in its own table so the server can check who may open the plan.
  useEffect(() => {
    if (!cloud) { setMembers(data.members); return }
    getSupabase()!.from('vault_members').select('*').then(({ data: rows }) => setMembers((rows ?? []).map(fromRow)))
  }, [cloud, data.members])

  const message = (m: Member) => cloud
    ? `${session.name} shared their Simple Forever Plan with you — life stories, our family tree and words to keep. Open ${appUrl()}, tap "I'm family", and enter the code we send to this ${m.channel === 'sms' ? 'number' : 'email'}.`
    : `${session.name} shared their Simple Forever Plan with you — life stories, our family tree and words to keep. Open ${appUrl()}, tap "I'm family", and enter this code: ${m.accessCode}`

  async function invite(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!name.trim() || !contact.trim()) return
    const c = normalizeContact(contact)
    const m: Member = { id: uid(), name: name.trim(), contact: c, channel: isEmail(c) ? 'email' : 'sms', canViewMedical: medical, invitedAt: Date.now() }
    try {
      if (cloud) {
        const sb = getSupabase()!
        const { data: row, error: err } = await sb.rpc('add_member', { member_name: m.name, member_contact: c, medical })
        if (err) throw err
        // The server sends a friendly heads-up by email or text; the sign-in code itself comes when they open the app.
        await sb.functions.invoke('invite', { body: { memberId: row } }).catch(() => null)
        setMembers((x) => [...x, { ...m, id: row }])
        setSent(m.name)
      } else {
        const withCode = { ...m, accessCode: makeAccessCode() }
        await save('members', withCode)
        setSent(m.name)
      }
      setName(''); setContact('')
    } catch (err: any) {
      setError(err?.message ?? 'Could not invite them right now.')
    }
  }

  async function revoke(m: Member) {
    if (cloud) {
      await getSupabase()!.from('vault_members').delete().eq('id', m.id)
      setMembers((x) => x.filter((y) => y.id !== m.id))
    } else await remove('members', m.id)
  }

  async function toggleMedical(m: Member) {
    const next = { ...m, canViewMedical: !m.canViewMedical }
    if (cloud) {
      await getSupabase()!.from('vault_members').update({ can_view_medical: next.canViewMedical }).eq('id', m.id)
      setMembers((x) => x.map((y) => (y.id === m.id ? next : y)))
    } else await save('members', next)
  }

  return (
    <div className="screen">
      <ScreenHeader title="Share with Family" sub="Each person gets a private code by email or text. Only people you add can open your plan." onBack={onBack} />

      <form className="card stack" onSubmit={invite}>
        <label className="field"><span>Their name</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Maria" /></label>
        <label className="field"><span>Email or mobile number</span><input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="maria@email.com or (555) 123-4567" /></label>
        <label className="check"><input type="checkbox" checked={medical} onChange={(e) => setMedical(e.target.checked)} /> Let them see my medical binder</label>
        {error && <p className="error">{error}</p>}
        <button className="btn" disabled={!name.trim() || !contact.trim()}><Icon name="share" size={18} /> Invite</button>
        {sent && <p className="success"><Icon name="check" size={16} /> {cloud ? `${sent} has been invited.` : `Code created for ${sent}. Send it below.`}</p>}
      </form>

      {members.length > 0 && <h3 className="section-title">Invited</h3>}
      <div className="stack">
        {members.map((m) => (
          <article key={m.id} className="card member">
            <div className="row between">
              <div>
                <strong>{m.name}</strong>
                <p className="muted small">{m.contact}</p>
              </div>
              {m.accessCode && <span className="code-pill">{m.accessCode}</span>}
            </div>
            <div className="row wrap">
              <a className="btn secondary small" href={m.channel === 'sms' ? `sms:${m.contact}?&body=${encodeURIComponent(message(m))}` : `mailto:${m.contact}?subject=${encodeURIComponent(`${session.name}'s Simple Forever Plan`)}&body=${encodeURIComponent(message(m))}`}>
                <Icon name="share" size={16} /> {cloud ? 'Send a note' : `Send code by ${m.channel === 'sms' ? 'text' : 'email'}`}
              </a>
              <button className="btn ghost small" onClick={() => toggleMedical(m)}>{m.canViewMedical ? 'Medical: visible' : 'Medical: hidden'}</button>
              <button className="btn ghost small danger-text" onClick={() => revoke(m)}>Remove</button>
            </div>
          </article>
        ))}
      </div>

      {!cloud && (
        <p className="disclaimer">This-device mode: family can open the plan on this phone or tablet with their code. To let them open it on their own devices, connect the backend (see the README).</p>
      )}
    </div>
  )
}

const fromRow = (r: any): Member => ({
  id: r.id, name: r.name, contact: r.contact, channel: r.channel, canViewMedical: r.can_view_medical, invitedAt: Date.parse(r.created_at),
})
