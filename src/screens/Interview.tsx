import { useEffect, useRef, useState } from 'react'
import { useData } from '../lib/data'
import { chapterById, OCCASIONS } from '../lib/questions'
import { canRecord, canTranscribe, clock, useRecorder } from '../lib/recorder'
import { uid } from '../lib/store'
import type { Answer } from '../lib/types'
import { FileButton, Icon, Media, ScreenHeader } from '../components/ui'
import { AskSheet } from '../components/AskSheet'

const KEEPSAKE_OCCASION: Record<string, string> = { scripture: 'Hard days', advice: 'Hard days', quote: 'Anytime', letter: 'Anytime' }

export default function Interview({ chapterId, onDone }: { chapterId: string; onDone: () => void }) {
  const chapter = chapterById(chapterId)!
  const { data } = useData()
  // Start at the first question not yet touched.
  const firstOpen = chapter.questions.findIndex((q) => !data.answers.some((a) => a.questionId === q.id))
  const [index, setIndex] = useState(firstOpen === -1 ? 0 : firstOpen)
  const q = chapter.questions[index]
  const next = () => (index + 1 < chapter.questions.length ? setIndex(index + 1) : onDone())

  return (
    <div className="screen">
      <ScreenHeader title={chapter.title} sub={`Question ${index + 1} of ${chapter.questions.length}`} onBack={onDone} />
      <div className="dots" aria-hidden>
        {chapter.questions.map((qq, i) => {
          const a = data.answers.find((x) => x.questionId === qq.id)
          return <button key={qq.id} className={`dot ${i === index ? 'on' : ''} ${a ? (a.skipped ? 'skipped' : 'done') : ''}`} onClick={() => setIndex(i)} tabIndex={-1} />
        })}
      </div>
      {index === 0 && (
        <p className="comfort"><Icon name="heart" size={18} /> Take your time. You can skip any question, come back later, and change anything. Nothing is shared until you choose to share it.</p>
      )}
      <QuestionCard key={q.id} chapterId={chapter.id} questionId={q.id} onNext={next} />
      <div className="row between">
        <button className="link-btn" disabled={index === 0} onClick={() => setIndex(index - 1)}><Icon name="back" size={18} /> Previous</button>
        <button className="link-btn" onClick={next}>{index + 1 < chapter.questions.length ? 'Next question' : 'Finish chapter'} →</button>
      </div>
    </div>
  )
}

function QuestionCard({ chapterId, questionId, onNext }: { chapterId: string; questionId: string; onNext: () => void }) {
  const q = chapterById(chapterId)!.questions.find((x) => x.id === questionId)!
  const { data, save, store } = useData()
  const existing = data.answers.find((a) => a.questionId === q.id)
  const [mode, setMode] = useState<null | 'audio' | 'video' | 'write'>(null)
  const [draft, setDraft] = useState('')
  const [pendingMedia, setPendingMedia] = useState<string[]>([])
  const [keep, setKeep] = useState(Boolean(q.keepsake))
  const [busy, setBusy] = useState(false)
  const [followUp, setFollowUp] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)
  const rec = useRecorder()
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => { if (videoRef.current && rec.stream) videoRef.current.srcObject = rec.stream }, [rec.stream])
  useEffect(() => { if (rec.state === 'recording') setDraft(rec.liveText) }, [rec.liveText, rec.state])

  const asked = followUp ?? q.text

  async function startRecording(kind: 'audio' | 'video') {
    setMode(kind)
    await rec.start(kind)
  }

  async function stopRecording() {
    const out = await rec.stop()
    if (!out) return
    setBusy(true)
    const id = await store.putMedia(out.blob)
    setPendingMedia((m) => [...m, id])
    setDraft(out.transcript)
    setBusy(false)
  }

  async function upload(file: File) {
    setBusy(true)
    const id = await store.putMedia(file)
    setPendingMedia((m) => [...m, id])
    setMode((m) => m ?? 'write')
    setBusy(false)
  }

  async function commit() {
    const text = draft.trim()
    if (!text && !pendingMedia.length) return
    setBusy(true)
    const prior = existing && !existing.skipped ? existing.text : ''
    // A follow-up adds to what was already said; a fresh answer replaces it (unless only a recording was added).
    const joined = followUp ? [prior, text].filter(Boolean).join('\n\n') : text || prior
    const answer: Answer = {
      id: existing?.id ?? uid(),
      chapterId,
      questionId: q.id,
      question: q.text,
      text: joined,
      mediaIds: [...(existing?.mediaIds ?? []), ...pendingMedia],
      createdAt: existing?.createdAt ?? Date.now(),
      contributions: existing?.contributions,
    }
    await save('answers', answer)
    if (keep && q.keepsake && text && !followUp) {
      await save('messages', {
        id: `from-${q.id}`, kind: q.keepsake, text, occasions: [KEEPSAKE_OCCASION[q.keepsake] ?? OCCASIONS[0]],
        mediaIds: pendingMedia, createdAt: Date.now(),
      })
    }
    setDraft(''); setPendingMedia([]); setMode(null); setFollowUp(null); setBusy(false)
  }

  async function skip() {
    await save('answers', { id: existing?.id ?? uid(), chapterId, questionId: q.id, question: q.text, text: '', mediaIds: [], skipped: true, createdAt: Date.now(), contributions: existing?.contributions })
    onNext()
  }

  const answered = existing && !existing.skipped
  const hasDraft = draft.trim() || pendingMedia.length

  return (
    <section className="card question-card">
      <h2 className="question">{asked}</h2>
      {!followUp && q.hint && <p className="hint">{q.hint}</p>}

      {answered && !mode && (existing.text || existing.mediaIds.length > 0) && (
        <div className="saved-answer">
          <p className="label"><Icon name="check" size={16} /> Saved</p>
          {existing.text && <p className="answer-text">{existing.text}</p>}
          <div className="media-stack">{existing.mediaIds.map((m) => <Media key={m} id={m} />)}</div>
        </div>
      )}

      {!mode && <FamilyAnswers questionId={q.id} />}

      {mode === 'video' && rec.state === 'recording' && <video ref={videoRef} className="live-video" autoPlay muted playsInline />}
      {rec.state === 'recording' && (
        <div className="recording">
          <span className="rec-dot" /> Recording {clock(rec.seconds)}
          {canTranscribe && <p className="live-text">{rec.liveText || 'Listening… speak whenever you are ready.'}</p>}
          <button className="btn danger big" onClick={stopRecording}><Icon name="stop" size={20} /> Stop</button>
        </div>
      )}
      {rec.error && <p className="error">{rec.error}</p>}

      {mode && rec.state !== 'recording' && (
        <div className="draft">
          {pendingMedia.length > 0 && <div className="media-stack">{pendingMedia.map((m) => <Media key={m} id={m} />)}</div>}
          <label className="field">
            <span>{mode === 'write' ? 'Your answer' : canTranscribe ? 'What you said (fix anything that came out wrong)' : 'Write a few words about what you shared so it can go in your story'}</span>
            <textarea rows={6} value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus={mode === 'write'} placeholder="Write as much or as little as you like…" />
          </label>
          {q.keepsake && !followUp && (
            <label className="check"><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> Also save this in Words to Keep</label>
          )}
          <div className="row">
            <button className="btn" disabled={busy || !hasDraft} onClick={commit}>{busy ? 'Saving…' : 'Save answer'}</button>
            <button className="btn ghost" onClick={() => { setMode(null); setDraft(''); setPendingMedia([]) }}>Cancel</button>
          </div>
        </div>
      )}

      {!mode && rec.state !== 'recording' && (
        <>
          <div className="answer-options">
            {canRecord && <button className="option" onClick={() => startRecording('audio')}><Icon name="mic" size={26} />Talk</button>}
            {canRecord && <button className="option" onClick={() => startRecording('video')}><Icon name="video" size={26} />Video</button>}
            <button className="option" onClick={() => setMode('write')}><Icon name="type" size={26} />Write</button>
            <FileButton className="option" label="Upload" icon="upload" accept="audio/*,video/*,image/*" onFile={upload} />
          </div>
          <button className="btn secondary ask-btn" onClick={() => setAsking(true)}>
            <Icon name="share" size={18} /> Ask someone who knows
          </button>
          <div className="row between">
            <button className="btn ghost skip" onClick={skip}><Icon name="skip" size={18} /> {answered ? 'Move on' : 'Not this one'}</button>
            {answered && q.followUps?.[0] && !followUp && (
              <button className="btn secondary" onClick={() => setFollowUp(q.followUps![0])}>Tell me more</button>
            )}
          </div>
        </>
      )}
      {asking && <AskSheet chapterId={chapterId} questionId={q.id} question={q.text} onClose={() => setAsking(false)} />}
    </section>
  )
}

/** Memories relatives sent back for this question, and questions still waiting on an answer. */
function FamilyAnswers({ questionId }: { questionId: string }) {
  const { data } = useData()
  const contributions = data.answers.find((a) => a.questionId === questionId)?.contributions ?? []
  const waiting = data.asks.filter((a) => a.questionId === questionId && !a.answeredAt)
  if (!contributions.length && !waiting.length) return null
  return (
    <div className="family-answers">
      {contributions.map((c) => (
        <div key={c.id} className="contribution">
          <p className="label">{c.from} remembers</p>
          <p className="answer-text">{c.text}</p>
          {c.mediaIds.map((m) => <Media key={m} id={m} />)}
        </div>
      ))}
      {waiting.map((a) => (
        <p key={a.id} className="waiting"><span className="pulse-dot" /> Asked {a.toName} · waiting for an answer</p>
      ))}
    </div>
  )
}
