import { useState } from 'react'
import { useData } from '../lib/data'
import { correctionsFrom, summarizeLife, writerAvailable } from '../lib/compose'
import { ensureInbox } from '../lib/inbox'
import { CHAPTERS } from '../lib/questions'
import type { LifeSummary } from '../lib/types'
import { Icon, ScreenHeader } from '../components/ui'
import { TextField } from '../components/TextField'
import { ReadAloud } from './Story'

const norm = (s: string) => s.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim()

/**
 * "Your story so far": the whole life as one short, warm overview — the way a eulogy would open —
 * plus every fact the writer understood, so the storyteller can confirm or correct it.
 * Fixes and answers made here are followed every time a chapter is written.
 */
export default function Summary({ onBack }: { onBack: () => void }) {
  const { data, settings, session, save } = useData()
  const summary = data.insights.find((x) => x.id === 'summary')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fixing, setFixing] = useState<number | null>(null)
  const [fixText, setFixText] = useState('')
  const [replies, setReplies] = useState<Record<number, string>>({})
  const name = settings.storytellerName || session.name

  const chapters = CHAPTERS.map((c) => ({
    title: c.title,
    answers: data.answers.filter((a) => a.chapterId === c.id).flatMap((a) => [
      ...(a.text && !a.skipped ? [{ question: a.question, text: a.text }] : []),
      ...(a.contributions ?? []).map((m) => ({ question: `${a.question} (as remembered by ${m.from})`, text: m.text })),
    ]),
  })).filter((c) => c.answers.length)
  const shared = chapters.reduce((n, c) => n + c.answers.length, 0)
  const stale = summary && summary.basedOn !== shared

  async function generate() {
    setBusy(true); setError('')
    try {
      let ready = settings
      if (!settings.inboxId) {
        const next = await ensureInbox(settings)
        if (next) { await save('settings', next); ready = next }
      }
      const out = await summarizeLife({ storytellerName: name, chapters, corrections: correctionsFrom(summary) }, ready)
      // Keep what was already checked: a fact that comes back the same keeps its check mark or fix.
      const prior = new Map((summary?.facts ?? []).map((f) => [norm(f.text), f]))
      const priorQ = new Map((summary?.unclear ?? []).map((u) => [norm(u.question), u]))
      const fixedStill = (summary?.facts ?? []).filter((f) => f.status === 'fixed' && !out.facts.some((t) => norm(t) === norm(f.text)))
      const next: LifeSummary = {
        id: 'summary',
        overview: out.overview,
        facts: [...out.facts.map((t) => prior.get(norm(t)) ?? { text: t, status: 'unchecked' as const }), ...fixedStill],
        unclear: [
          ...out.unclear.map((q) => priorQ.get(norm(q)) ?? { question: q }),
          ...(summary?.unclear ?? []).filter((u) => u.answer && !out.unclear.some((q) => norm(q) === norm(u.question))),
        ],
        basedOn: shared,
        updatedAt: Date.now(),
      }
      await save('insights', next)
    } catch (e: any) {
      setError(e?.message ?? 'Couldn’t write your overview right now.')
    }
    setBusy(false)
  }

  const update = (patch: Partial<LifeSummary>) => summary && save('insights', { ...summary, ...patch })
  const setFact = (i: number, f: LifeSummary['facts'][number]) => update({ facts: summary!.facts.map((x, j) => (j === i ? f : x)) })
  const checked = summary?.facts.filter((f) => f.status !== 'unchecked').length ?? 0

  return (
    <div className="screen">
      <ScreenHeader title="Your Story So Far" sub="Your life as one story — and a chance to check what was understood." onBack={onBack} />

      {!writerAvailable ? (
        <section className="card stack">
          <h3>The story writer isn’t connected yet</h3>
          <p className="muted">Once it is, this page shows a warm overview of your life — clear and smooth like a eulogy, built only from what you and your family shared — plus a list of every fact it understood so you can confirm or fix each one.</p>
          <p className="muted small">So far you’ve shared {shared} answer{shared === 1 ? '' : 's'} across {chapters.length} chapter{chapters.length === 1 ? '' : 's'}. Everything you’ve shared will be used.</p>
        </section>
      ) : !summary ? (
        <section className="card stack">
          <p>You’ve shared {shared} answer{shared === 1 ? '' : 's'} across {chapters.length} chapter{chapters.length === 1 ? '' : 's'}. The writer will read all of it and tell you how your life story reads so far.</p>
          <p className="muted small">It only uses what you and your family said — nothing is made up. Your answers aren’t changed.</p>
          {error && <p className="error">{error}</p>}
          <button className="btn big" disabled={busy || !shared} onClick={generate}><Icon name="sparkle" size={20} /> {busy ? 'Reading your story…' : 'Write my story so far'}</button>
        </section>
      ) : (
        <>
          {stale && (
            <div className="notice row between wrap">
              <span>You’ve shared more since this was written.</span>
              <button className="btn small" disabled={busy} onClick={generate}>{busy ? 'Updating…' : 'Update'}</button>
            </div>
          )}
          {error && <p className="error">{error}</p>}

          <section className="card story-card">
            <div className="prose">{summary.overview.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}</div>
            <div className="row wrap">
              <ReadAloud text={summary.overview} />
              {!stale && <button className="btn ghost" disabled={busy} onClick={generate}>{busy ? 'Rewriting…' : 'Rewrite'}</button>}
            </div>
          </section>

          <section className="stack">
            <div className="row between">
              <h3>What I understood</h3>
              <span className="muted small">{checked} of {summary.facts.length} checked</span>
            </div>
            <p className="muted small">Tap ✓ if it’s right or Fix if it isn’t. Your fixes are followed every time a chapter is written.</p>
            <ul className="facts">
              {summary.facts.map((f, i) => (
                <li key={i} className={`fact ${f.status}`}>
                  {fixing === i ? (
                    <div className="stack">
                      <p className="fact-old">{f.text}</p>
                      <TextField id={`fix-${i}`} label="What’s actually true?" autoFocus value={fixText} onChange={setFixText} />
                      <div className="row">
                        <button className="btn small" disabled={!fixText.trim()} onClick={() => { setFact(i, { ...f, status: 'fixed', correction: fixText.trim() }); setFixing(null) }}>Save fix</button>
                        <button className="btn ghost small" onClick={() => setFixing(null)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="fact-text">
                        {f.status === 'fixed' ? <><s>{f.text}</s><strong>{f.correction}</strong></> : <span>{f.text}</span>}
                      </div>
                      <div className="fact-actions">
                        <button className={`icon-btn ${f.status === 'right' ? 'on' : ''}`} aria-label="That’s right" onClick={() => setFact(i, { text: f.text, status: f.status === 'right' ? 'unchecked' : 'right' })}><Icon name="check" size={18} /></button>
                        <button className="btn ghost small" onClick={() => { setFixing(i); setFixText(f.correction ?? '') }}>Fix</button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {summary.unclear.length > 0 && (
            <section className="stack">
              <h3>A few questions for you</h3>
              <p className="muted small">Things that weren’t clear or seemed to disagree. Answer any you like.</p>
              {summary.unclear.map((u, i) => (
                <TextField key={i} id={`unclear-${i}`} multiline rows={2} label={u.question} placeholder="Your answer (optional)"
                  value={replies[i] ?? u.answer ?? ''} onChange={(v) => setReplies((r) => ({ ...r, [i]: v }))} />
              ))}
              {Object.keys(replies).length > 0 && (
                <button className="btn" onClick={async () => {
                  await update({ unclear: summary.unclear.map((x, j) => (replies[j] !== undefined ? { ...x, answer: replies[j].trim() } : x)) })
                  setReplies({})
                }}>Save my answers</button>
              )}
            </section>
          )}
        </>
      )}
    </div>
  )
}
