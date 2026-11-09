import { useMemo, useState } from 'react'
import { useData } from '../lib/data'
import { findFollowUps } from '../lib/followUps'
import type { Answer } from '../lib/types'
import { AskSheet } from './AskSheet'
import { Icon } from './ui'

/**
 * When an answer says "I need to ask my mom" or "Aunt Ruth would know", offer the Ask family message for that
 * question, ready to send to them. Hidden once they've been asked, or if waved off.
 */
export function FollowUpAsk({ answer }: { answer: Answer }) {
  const { data, settings, save, isOwner } = useData()
  const [asking, setAsking] = useState<string | null>(null)
  const items = useMemo(() => findFollowUps(answer.text), [answer.text])
  if (!isOwner || answer.skipped || !items.length) return null
  const dismissed = new Set(settings.dismissed ?? [])
  const asked = (who?: string) => data.asks.some((a) => a.questionId === answer.questionId && (!who || a.toName.toLowerCase() === who.toLowerCase()))
  const show = items.filter((f) => !dismissed.has(`followup:${answer.id}:${f.who ?? ''}`) && !asked(f.who))
  if (!show.length) return null
  return (
    <div className="followup stack tight" onClick={(e) => e.stopPropagation()}>
      {show.map((f) => (
        <div key={f.who ?? ''} className="followup-card">
          <p className="small"><Icon name="share" size={14} /> {f.who ? <>You said you’d ask <strong>{f.who}</strong>. The message is ready to send.</> : <>You noted something to follow up on. Ask someone who’d know?</>}</p>
          <div className="row wrap">
            <button className="btn small" onClick={() => setAsking(f.who ?? '')}>{f.who ? `Ask ${f.who} now` : 'Ask family'}</button>
            <button className="btn ghost small" onClick={() => save('settings', { ...settings, dismissed: [...(settings.dismissed ?? []), `followup:${answer.id}:${f.who ?? ''}`] })}>Not now</button>
          </div>
        </div>
      ))}
      {asking !== null && (
        <AskSheet chapterId={answer.chapterId} questionId={answer.questionId} question={answer.question} to={asking || undefined}
          suggestions={[`Do you remember? ${answer.question}`]} onClose={() => setAsking(null)} />
      )}
    </div>
  )
}
