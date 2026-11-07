import { useEffect, useState } from 'react'
import { useData } from '../lib/data'
import { collectMediaIds } from '../lib/backup'
import { listLocalMediaIds, mediaKind, uid } from '../lib/store'
import { CHAPTERS } from '../lib/questions'
import type { ID } from '../lib/types'
import { Icon, Media } from './ui'

/**
 * Finds recordings saved on this phone that never got attached to an answer (for example, recorded and
 * then moved on before tapping Save) and lets the storyteller put each one back on the right question.
 */
export function LostRecordings() {
  const { data, store, save, settings } = useData()
  const [orphans, setOrphans] = useState<ID[]>([])
  const [choice, setChoice] = useState<Record<ID, string>>({})

  useEffect(() => {
    if (store.mode !== 'local') return
    const used = collectMediaIds(data)
    const hidden = new Set((settings.dismissed ?? []).filter((d) => d.startsWith('media:')).map((d) => d.slice(6)))
    listLocalMediaIds().then((ids) => setOrphans(ids.filter((id) => !used.has(id) && !hidden.has(id) && ['audio', 'video'].includes(mediaKind(id)))))
  }, [data, store, settings.dismissed])

  if (!orphans.length) return null

  async function attach(id: ID) {
    const questionId = choice[id]
    const chapter = CHAPTERS.find((c) => c.questions.some((q) => q.id === questionId))
    const question = chapter?.questions.find((q) => q.id === questionId)
    if (!chapter || !question) return
    const existing = data.answers.find((a) => a.questionId === questionId)
    await save('answers', existing
      ? { ...existing, skipped: false, mediaIds: [...existing.mediaIds, id] }
      : { id: uid(), chapterId: chapter.id, questionId, question: question.text, text: '', mediaIds: [id], createdAt: Date.now() })
  }

  return (
    <section className="card lost stack" aria-label="Recordings not attached to a question">
      <div>
        <h3><Icon name="mic" size={18} /> Found {orphans.length} recording{orphans.length === 1 ? '' : 's'} to put back</h3>
        <p className="muted small">These were recorded on this phone but never got attached to a question. Play each one, pick the question it answers, and tap Put back.</p>
      </div>
      {orphans.map((id) => (
        <div key={id} className="lost-item stack">
          <Media id={id} />
          <select id={`lost-${id}`} aria-label="Which question does this answer?" value={choice[id] ?? ''} onChange={(e) => setChoice((c) => ({ ...c, [id]: e.target.value }))}>
            <option value="">Which question does this answer?</option>
            {CHAPTERS.map((c) => (
              <optgroup key={c.id} label={c.title}>
                {c.questions.map((q) => <option key={q.id} value={q.id}>{q.text}</option>)}
              </optgroup>
            ))}
          </select>
          <div className="row wrap">
            <button className="btn small" disabled={!choice[id]} onClick={() => attach(id)}><Icon name="check" size={16} /> Put back</button>
            <button className="btn ghost small" onClick={() => save('settings', { ...settings, dismissed: [...(settings.dismissed ?? []), `media:${id}`] })}>Not an answer</button>
          </div>
        </div>
      ))}
    </section>
  )
}
