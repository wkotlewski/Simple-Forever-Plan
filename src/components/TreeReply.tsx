import { useState } from 'react'
import { useData } from '../lib/data'
import { countPeople, readTreeAnswer, treeSentences } from '../lib/treeSurvey'
import { BulkFamily } from './BulkFamily'
import { Icon, Sheet } from './ui'

/** A relative filled in the family tree survey: see what came in, then check it and add it to the tree. */
export function TreeReply({ askId, from, body, onAdded, onClose }: { askId: string; from: string; body: string; onAdded: () => void; onClose: () => void }) {
  const { data, save } = useData()
  const [reviewing, setReviewing] = useState(false)
  const a = readTreeAnswer(body)
  const first = from.split(' ')[0]
  if (!a) return null
  const text = treeSentences(a)
  const done = async () => {
    const ask = data.asks.find((x) => x.id === askId)
    if (ask) await save('asks', { ...ask, answeredAt: Date.now() })
    onAdded()
  }
  if (reviewing) {
    return <BulkFamily initialText={text} intro={`From ${first}’s answers.${a.more?.trim() ? ` ${first} also wrote: “${a.more.trim()}”` : ''}`} onAdded={done} onClose={onClose} />
  }
  const n = countPeople(a)
  return (
    <Sheet title={`${first} filled in your family tree`} onClose={onClose}>
      <div className="stack">
        <p>{first} sent {n} {n === 1 ? 'name' : 'names'}{a.more?.trim() ? ' and a note' : ''}.</p>
        <div className="card inset"><p className="small tree-reply-text">{text.split('\n').map((l, i) => <span key={i}>{l}<br /></span>)}</p></div>
        {a.more?.trim() && <div className="contribution"><p className="label">{first} also wrote</p><p className="answer-text">{a.more}</p></div>}
        <button className="btn big" onClick={() => setReviewing(true)}><Icon name="tree" size={20} /> Check it and add to my tree</button>
        <button className="btn ghost" onClick={onClose}>Later</button>
        <p className="muted small">Nothing is added until you check it. People already on your tree are matched by name.</p>
      </div>
    </Sheet>
  )
}
