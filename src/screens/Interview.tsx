import { useEffect, useRef, useState } from 'react'
import { useData } from '../lib/data'
import { chapterById, followUpId, OCCASIONS, type Question } from '../lib/questions'
import { saveToApp } from '../lib/backup'
import { Transcribe } from '../components/Transcribe'
import { canRecord, canTranscribe, clock, useRecorder } from '../lib/recorder'
import { uid } from '../lib/store'
import type { Answer } from '../lib/types'
import { Icon, Media, ScreenHeader } from '../components/ui'
import { AskSheet } from '../components/AskSheet'
import { FollowUpAsk } from '../components/FollowUpAsk'
import { TextField } from '../components/TextField'
import { SuggestionList, useSuggestions } from '../components/Suggestions'

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
      <QuestionCard key={q.id} chapterId={chapter.id} question={q} onNext={next} />
      <div className="row between">
        <button className="link-btn" disabled={index === 0} onClick={() => setIndex(index - 1)}><Icon name="back" size={18} /> Previous</button>
        <button className="link-btn" onClick={next}>{index + 1 < chapter.questions.length ? 'Next question' : 'Finish chapter'} →</button>
      </div>
    </div>
  )
}

function QuestionCard({ chapterId, question: q, onNext, nested }: { chapterId: string; question: Question; onNext: () => void; nested?: boolean }) {
  const { data, save, store } = useData()
  const existing = data.answers.find((a) => a.questionId === q.id)
  const [mode, setMode] = useState<null | 'audio' | 'video' | 'write'>(null)
  const [draft, setDraft] = useState('')
  const [pendingMedia, setPendingMedia] = useState<string[]>([])
  const [keep, setKeep] = useState(Boolean(q.keepsake))
  const [busy, setBusy] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const [lastRecording, setLastRecording] = useState<File | null>(null)
  const [copyNote, setCopyNote] = useState('')
  const [asking, setAsking] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const found = useSuggestions(existing ? [existing] : [])
  const rec = useRecorder()
  const [removing, setRemoving] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => { if (videoRef.current && rec.stream) videoRef.current.srcObject = rec.stream }, [rec.stream])
  useEffect(() => { if (rec.state === 'recording') setDraft(rec.liveText) }, [rec.liveText, rec.state])


  async function startRecording(kind: 'audio' | 'video') {
    setMode(kind)
    await rec.start(kind)
  }

  /**
   * Saves onto this question. Recordings and uploads are always added (never replace earlier ones).
   * Edited words replace the text; the words from another recording are added after what's already there.
   */
  async function persist(v: { text: string; media: string[]; keep: boolean; existing?: Answer; append?: boolean }) {
    const text = v.text.trim()
    if (!text && !v.media.length) return
    const prior = v.existing && !v.existing.skipped ? v.existing.text.trim() : ''
    const joined = v.append && prior && text ? `${prior}\n\n${text}` : text || prior
    const answer: Answer = {
      id: v.existing?.id ?? uid(),
      chapterId,
      questionId: q.id,
      question: q.text,
      text: joined,
      mediaIds: [...(v.existing?.mediaIds ?? []), ...v.media.filter((m) => !v.existing?.mediaIds.includes(m))],
      createdAt: v.existing?.createdAt ?? Date.now(),
      contributions: v.existing?.contributions,
    }
    await save('answers', answer)
    if (v.keep && q.keepsake && text) {
      await save('messages', {
        id: `from-${q.id}`, kind: q.keepsake, text, occasions: [KEEPSAKE_OCCASION[q.keepsake] ?? OCCASIONS[0]],
        mediaIds: v.media, createdAt: Date.now(),
      })
    }
    return answer
  }

  // Latest editor state, so anything unsaved is kept when moving to another question or screen.
  const latest = useRef({ text: draft, media: pendingMedia, keep, existing })
  latest.current = { text: draft, media: pendingMedia, keep, existing }
  useEffect(() => () => {
    const v = latest.current
    if (v.text.trim() || v.media.length) persist(v).catch(() => null)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /** Recordings are saved to the question the moment you tap Stop; the words can be fixed afterward. */
  async function stopRecording() {
    const out = await rec.stop()
    if (!out) return
    setBusy(true)
    const id = await store.putMedia(out.blob)
    const saved = await persist({ text: out.transcript, media: [id], keep: false, existing, append: true })
    // Keep the editor open on the saved text so it can be corrected; it's already safe.
    setDraft(saved?.text ?? out.transcript)
    setPendingMedia([])
    setJustSaved(true)
    const ext = (out.blob.type.split('/')[1] ?? 'webm').split(';')[0].replace('mpeg', 'mp3').replace('mp4', out.blob.type.startsWith('audio') ? 'm4a' : 'mp4')
    const when = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    setLastRecording(new File([out.blob], `${q.text.replace(/[\\/:*?"<>|]+/g, '').slice(0, 60)} (${when}).${ext}`, { type: out.blob.type }))
    setCopyNote('')
    setBusy(false)
  }

  async function upload(files: File[]) {
    if (!files.length) return
    setBusy(true)
    const ids: string[] = []
    for (const f of files) ids.push(await store.putMedia(f))
    const saved = await persist({ text: '', media: ids, keep: false, existing })
    setDraft(saved?.text ?? '')
    setMode((m) => m ?? 'write')
    setJustSaved(true)
    setBusy(false)
  }

  async function commit() {
    if (!draft.trim() && !pendingMedia.length) { setMode(null); return }
    setBusy(true)
    await persist({ text: draft, media: pendingMedia, keep, existing })
    setDraft(''); setPendingMedia([]); setMode(null); setJustSaved(false); setLastRecording(null); setBusy(false)
  }

  async function skip() {
    await save('answers', { id: existing?.id ?? uid(), chapterId, questionId: q.id, question: q.text, text: '', mediaIds: [], skipped: true, createdAt: Date.now(), contributions: existing?.contributions })
    onNext()
  }

  const answered = existing && !existing.skipped
  const hasMoreAnswers = (q.followUps ?? []).some((_, i) => data.answers.some((a) => a.questionId === followUpId(q.id, i)))
  const hasDraft = draft.trim() || pendingMedia.length

  return (
    <section className={nested ? 'follow-up stack' : 'card question-card'}>
      {nested ? <p className="follow-up-q"><span className="label">Tell me more</span>{q.text}</p> : <h2 className="question">{q.text}</h2>}
      {q.hint && <p className="hint">{q.hint}</p>}

      {answered && !mode && (existing.text || existing.mediaIds.length > 0) && (
        <div className="saved-answer">
          <p className="label"><Icon name="check" size={16} /> Saved</p>
          {existing.text && <p className="answer-text">{existing.text}</p>}
          <div className="media-stack">{existing.mediaIds.map((m) => (
            <div key={m} className="media-item">
              <Media id={m} />
              {existing.mediaIds.length > 1 && (removing === m ? (
                <span className="row">
                  <button className="link-btn small danger-text" onClick={async () => { await save('answers', { ...existing, mediaIds: existing.mediaIds.filter((x) => x !== m) }); setRemoving(null) }}>Remove it</button>
                  <button className="link-btn small" onClick={() => setRemoving(null)}>Keep</button>
                </span>
              ) : <button className="link-btn small" onClick={() => setRemoving(m)}>Remove</button>)}
            </div>
          ))}</div>
          {existing.mediaIds.length > 1 && <p className="muted small">{existing.mediaIds.length} recordings and files on this answer.</p>}
          <Transcribe answer={existing} />
          <FollowUpAsk answer={existing} />
        </div>
      )}

      {!mode && <FamilyAnswers questionId={q.id} />}
      {!mode && rec.state !== 'recording' && <SuggestionList items={found} title="Found in your answer" />}

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
          {justSaved && <p className="success"><Icon name="check" size={16} /> Saved to this question. Fix the words below if you like.</p>}
          {justSaved && lastRecording && (
            <div className="copy-recording">
              <button className="btn secondary small" onClick={async () => {
                try { const r = await saveToApp(lastRecording, { afterTap: true }); if (r !== 'cancelled') setCopyNote('Copy saved. Your recording is also kept here in the app.') }
                catch (e: any) { setCopyNote(e?.message ?? 'Couldn’t save a copy.') }
              }}><Icon name="upload" size={16} /> Save a copy to my phone</button>
              <p className="muted small">{copyNote || 'Extra safety: keep this recording in Files, iCloud, Google Drive or any app you choose.'}</p>
            </div>
          )}
          <TextField id="answer-draft" multiline rows={6} autoFocus={mode === 'write'} value={draft} onChange={setDraft}
            label={mode === 'write' ? 'Your answer — type, or tap the microphone and talk' : canTranscribe ? 'What you said (fix anything that came out wrong)' : 'Write a few words about what you shared so it can go in your story'}
            placeholder="Write as much or as little as you like…" />
          {q.keepsake && (
            <label className="check"><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> Also save this in Words to Keep</label>
          )}
          <div className="row">
            <button className="btn" disabled={busy || !hasDraft} onClick={commit}>{busy ? 'Saving…' : justSaved ? 'Save changes' : 'Save answer'}</button>
            <button className="btn ghost" onClick={() => { setMode(null); setDraft(''); setPendingMedia([]); setJustSaved(false) }}>{justSaved ? 'Done' : 'Cancel'}</button>
          </div>
        </div>
      )}

      {!mode && rec.state !== 'recording' && (
        <>
          {answered && <p className="label add-more-label">Add more to this answer — another recording, video, photos or words</p>}
          <div className="answer-options">
            {canRecord && <button className="option" onClick={() => startRecording('audio')}><Icon name="mic" size={26} />{answered ? 'Talk more' : 'Talk'}</button>}
            {canRecord && <button className="option" onClick={() => startRecording('video')}><Icon name="video" size={26} />{answered ? 'Add video' : 'Video'}</button>}
            <button className="option" onClick={() => { if (answered) setDraft(existing.text); setMode('write') }}><Icon name="type" size={26} />{answered ? 'Edit words' : 'Write'}</button>
            <label className="option">
              <Icon name="upload" size={26} />{busy ? 'Adding…' : answered ? 'Add files' : 'Upload'}
              <input type="file" accept="audio/*,video/*,image/*" multiple hidden onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ''; upload(f) }} />
            </label>
          </div>
          <button className="btn secondary ask-btn" onClick={() => setAsking(true)}>
            <Icon name="share" size={18} /> Ask someone who knows
          </button>
          {!nested && (
            <div className="row between">
              <button className="btn ghost skip" onClick={skip}><Icon name="skip" size={18} /> {answered ? 'Move on' : 'Not this one'}</button>
              {answered && (q.followUps?.length ?? 0) > 0 && !showMore && !hasMoreAnswers && (
                <button className="btn secondary" onClick={() => setShowMore(true)}>Tell me more</button>
              )}
            </div>
          )}
        </>
      )}
      {/* Follow-up questions are their own answers, shown with their own question. */}
      {!nested && (showMore || hasMoreAnswers) && q.followUps?.map((f, i) => (
        <QuestionCard key={followUpId(q.id, i)} chapterId={chapterId} question={{ id: followUpId(q.id, i), text: f }} onNext={onNext} nested />
      ))}
      {asking && <AskSheet chapterId={chapterId} questionId={q.id} question={q.text} suggestions={[`Do you remember? ${q.text}`, ...(q.followUps ?? [])]} onClose={() => setAsking(false)} />}
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
