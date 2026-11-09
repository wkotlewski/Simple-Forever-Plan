import { useEffect, useMemo, useRef, useState } from 'react'
import { useData } from '../lib/data'
import { CHAPTERS, chapterById, isFollowUp, questionOrder } from '../lib/questions'
import { composeChapter, correctionsFrom, writerAvailable } from '../lib/compose'
import { ensureInbox } from '../lib/inbox'
import Summary from './Summary'
import { AiShare } from '../components/AiShare'
import { LostRecordings } from '../components/LostRecordings'
import { MissingWords, Transcribe } from '../components/Transcribe'
import { ItemDocs, SummarizeSheet } from '../components/DocSummary'
import { listDocuments, type DocRef } from '../lib/docSummary'
import { mediaKind } from '../lib/store'
import type { Answer, ChapterStory } from '../lib/types'
import { Empty, Icon, Media, ScreenHeader } from '../components/ui'
import Interview from './Interview'
import Book from './Book'
import { Contributions, PasteReply } from '../components/AskSheet'
import { FollowUpAsk } from '../components/FollowUpAsk'
import { offerReply } from '../lib/ask'

type View = { kind: 'list' } | { kind: 'interview'; id: string } | { kind: 'chapter'; id: string } | { kind: 'book' } | { kind: 'summary' }

export default function Story() {
  const [view, setView] = useState<View>({ kind: 'list' })
  const back = () => setView({ kind: 'list' })
  useEffect(() => { window.scrollTo(0, 0) }, [view])

  if (view.kind === 'interview') return <Interview chapterId={view.id} onDone={() => setView({ kind: 'chapter', id: view.id })} />
  if (view.kind === 'chapter') return <ChapterView id={view.id} onBack={back} onAnswer={() => setView({ kind: 'interview', id: view.id })} />
  if (view.kind === 'book') return <Book onBack={back} />
  if (view.kind === 'summary') return <Summary onBack={back} />
  return <ChapterList open={(id, interview) => setView(interview ? { kind: 'interview', id } : { kind: 'chapter', id })} onBook={() => setView({ kind: 'book' })} onSummary={() => setView({ kind: 'summary' })} />
}

function ChapterList({ open, onBook, onSummary }: { open: (id: string, interview: boolean) => void; onBook: () => void; onSummary: () => void }) {
  const { data, isOwner, settings, save } = useData()
  const chapters = isOwner ? CHAPTERS : CHAPTERS.filter((c) => data.stories.some((s) => s.id === c.id && s.approved))

  return (
    <div className="screen">
      <ScreenHeader title={isOwner ? 'My Story' : `${settings.storytellerName.split(' ')[0] || 'Their'}'s Story`}
        sub={isOwner ? 'Answer questions by talking, video, or writing. Each chapter becomes part of your book.' : 'Chapters of a life, shared with you.'} />

      <MissingWords />
      {isOwner && (
        <div className="segmented" role="radiogroup" aria-label="How chapters are written">
          <span>Write my chapters</span>
          {(['first', 'third'] as const).map((v) => (
            <button key={v} role="radio" aria-checked={settings.voice === v} className={settings.voice === v ? 'on' : ''}
              onClick={() => save('settings', { ...settings, voice: v })}>
              {v === 'first' ? 'As “I”' : 'As a biography'}
            </button>
          ))}
        </div>
      )}

      {isOwner && <LostRecordings />}

      {isOwner && data.answers.some((a) => (a.text && !a.skipped) || a.contributions?.length) && (
        <button className="card summary-card" onClick={onSummary}>
          <Icon name="sparkle" />
          <span>
            <strong>Your story so far</strong>
            <small>See how your life reads as one story, and check what was understood.</small>
          </span>
        </button>
      )}

      {!chapters.length && <Empty icon="book" title="No chapters shared yet">When chapters are shared with you, they will appear here.</Empty>}

      <div className="chapter-list">
        {chapters.map((c, i) => {
          const answers = data.answers.filter((a) => a.chapterId === c.id && !isFollowUp(a.questionId))
          const done = answers.filter((a) => !a.skipped).length
          const story = data.stories.find((s) => s.id === c.id)
          return (
            <article key={c.id} className="card chapter-card">
              <button className="chapter-main" onClick={() => open(c.id, isOwner && !answers.length)}>
                <span className="chapter-num">{i + 1}</span>
                <span>
                  <strong>{c.title}</strong>
                  <small>{c.blurb}</small>
                  {isOwner && (
                    <span className="meter"><span style={{ width: `${(answers.length / c.questions.length) * 100}%` }} /></span>
                  )}
                </span>
              </button>
              {isOwner && (
                <div className="chapter-meta">
                  <span>{done}/{c.questions.length} answered{story ? (story.approved ? ' · shared' : ' · draft written') : ''}</span>
                  <button className="link-btn" onClick={() => open(c.id, true)}>{answers.length ? 'Answer more' : 'Start'}</button>
                </div>
              )}
            </article>
          )
        })}
      </div>

      {isOwner && <PasteReply onReply={offerReply} />}

      {(isOwner || chapters.length > 0) && (
        <button className="btn secondary wide" onClick={onBook}><Icon name="print" size={20} /> {isOwner ? 'Make my book' : 'Open the book'}</button>
      )}
    </div>
  )
}

function ChapterView({ id, onBack, onAnswer }: { id: string; onBack: () => void; onAnswer: () => void }) {
  const chapter = chapterById(id)!
  const { data, isOwner, settings, session, save } = useData()
  const answers = data.answers.filter((a) => a.chapterId === id && (!a.skipped || a.contributions?.length))
    .sort((a, b) => questionOrder(chapter, a.questionId) - questionOrder(chapter, b.questionId))
  const story = data.stories.find((s) => s.id === id)
  const [body, setBody] = useState(story?.body ?? '')
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const name = isOwner ? session.name : settings.storytellerName

  async function write() {
    setBusy(true); setNote('')
    try {
      // Family members' memories go in too, labeled with who shared them so the writer credits them.
      const material = answers.flatMap((a) => [
        ...(a.text && !a.skipped ? [{ question: a.question, text: a.text }] : []),
        ...(a.contributions ?? []).map((c) => ({ question: `${a.question} (as remembered by ${c.from})`, text: c.text })),
      ])
      let ready = settings
      if (writerAvailable && !settings.inboxId) {
        const next = await ensureInbox(settings)
        if (next) { await save('settings', next); ready = next }
      }
      const corrections = correctionsFrom(data.insights.find((x) => x.id === 'summary'))
      const out = await composeChapter({ chapterTitle: chapter.title, storytellerName: name, voice: settings.voice, answers: material, corrections }, ready)
      setBody(out.body)
      setEditing(true)
      setNote(out.usedAI
        ? 'Written only from what you and your family shared. Read it through and fix anything that isn’t quite right — nothing is saved until you tap Save.'
        : out.note
          ? `The story writer couldn’t be reached (${out.note}), so here are your own words in order. Nothing is saved until you tap Save.`
          : 'Here are your own words in order. Once the story writer is connected, this becomes a smooth, flowing chapter.')
    } catch (e: any) {
      setNote(e?.message ?? 'Could not write this chapter right now.')
    }
    setBusy(false)
  }

  async function store(approved: boolean) {
    // Keep earlier versions so a rewrite never loses what was there before.
    const history = story && story.body && story.body !== body
      ? [{ body: story.body, savedAt: story.updatedAt }, ...(story.history ?? [])].slice(0, 5)
      : story?.history
    const next: ChapterStory = { id, title: chapter.title, body, voice: settings.voice, approved, updatedAt: Date.now(), history }
    await save('stories', next)
    setEditing(false)
  }

  return (
    <div className="screen">
      <ScreenHeader title={chapter.title} sub={chapter.blurb} onBack={onBack} />

      {isOwner && !answers.length && (
        <Empty icon="mic" title="No answers yet">
          <button className="btn" onClick={onAnswer}>Answer the questions</button>
        </Empty>
      )}

      {(story?.body || editing) && (
        <section className="card story-card">
          {editing ? (
            <>
              <textarea className="story-edit" rows={14} value={body} onChange={(e) => setBody(e.target.value)} />
              {note && <p className="muted small">{note}</p>}
              <div className="row wrap">
                <button className="btn" onClick={() => store(true)}><Icon name="share" size={18} /> Save &amp; share with family</button>
                <button className="btn secondary" onClick={() => store(false)}>Save as draft</button>
              </div>
            </>
          ) : (
            <>
              <div className="prose">{story!.body.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}</div>
              <div className="row wrap">
                <ReadAloud text={`${chapter.title}. ${story!.body}`} />
                {isOwner && <button className="btn ghost" onClick={() => { setBody(story!.body); setEditing(true) }}>Edit</button>}
                {isOwner && <button className="btn ghost" onClick={() => save('stories', { ...story!, approved: !story!.approved })}>{story!.approved ? 'Stop sharing' : 'Share with family'}</button>}
              </div>
              {isOwner && !story!.approved && <p className="muted small">Draft — family can’t see this chapter yet.</p>}
              {isOwner && (story!.history?.length ?? 0) > 0 && (
                <details className="history">
                  <summary>Earlier versions ({story!.history!.length})</summary>
                  {story!.history!.map((h) => (
                    <div key={h.savedAt} className="history-item">
                      <p className="label">Saved {new Date(h.savedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
                      <p className="history-text">{h.body.slice(0, 220)}{h.body.length > 220 ? '…' : ''}</p>
                      <button className="btn ghost small" onClick={() => { setBody(h.body); setEditing(true); setNote('This is an earlier version. Tap Save to bring it back — the current one will be kept as an earlier version too.') }}>Bring this back</button>
                    </div>
                  ))}
                </details>
              )}
            </>
          )}
        </section>
      )}

      {isOwner && answers.length > 0 && !editing && !writerAvailable && (
        <AiShare kind="chapter" chapterId={id} resultLabel="Your chapter, from your AI app" onResult={(text) => {
          setBody(text); setEditing(true)
          setNote('Pasted from your AI app. Read it through and fix anything that isn’t right — nothing is saved until you tap Save. Your answers aren’t changed.')
        }} />
      )}
      {isOwner && answers.length > 0 && !editing && (
        <button className={writerAvailable ? 'btn wide' : 'btn ghost wide'} disabled={busy} onClick={write}><Icon name="sparkle" size={20} /> {busy ? 'Writing your chapter…' : writerAvailable ? (story ? 'Rewrite from my answers' : 'Turn my answers into a chapter') : 'Put my answers in order as a chapter'}</button>
      )}

      {answers.length > 0 && <Recordings answers={answers} />}
      {isOwner && answers.length > 0 && <button className="link-btn" onClick={onAnswer}>Answer more questions in this chapter →</button>}
    </div>
  )
}

/** Plays every recording in the chapter one after another — the chapter as a podcast in their own voice. */
function Recordings({ answers }: { answers: Answer[] }) {
  const items = useMemo(() => answers.flatMap((a) => [
    ...a.mediaIds.map((m) => ({ m, q: a.question })),
    ...(a.contributions ?? []).flatMap((c) => c.mediaIds.map((m) => ({ m, q: `${c.from}: ${a.question}` }))),
  ]).filter(({ m }) => mediaKind(m) === 'audio' || mediaKind(m) === 'video'), [answers])
  const [playing, setPlaying] = useState<number | null>(null)
  const [summarizing, setSummarizing] = useState<DocRef[] | null>(null)
  const { store, isOwner } = useData()
  const audio = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    if (playing === null || !audio.current) return
    store.mediaUrl(items[playing].m).then((url) => { if (url && audio.current) { audio.current.src = url; audio.current.play().catch(() => null) } })
  }, [playing, items, store])

  return (
    <section className="answers">
      <div className="row between">
        <h3>In their own words</h3>
        {items.length > 1 && (
          <button className="btn secondary small" onClick={() => setPlaying(playing === null ? 0 : null)}>
            <Icon name={playing === null ? 'play' : 'stop'} size={16} /> {playing === null ? 'Play all' : 'Stop'}
          </button>
        )}
      </div>
      {playing !== null && (
        <div className="card now-playing">
          <p className="label">Now playing {playing + 1} of {items.length}</p>
          <p>{items[playing].q}</p>
          <audio ref={audio} controls onEnded={() => setPlaying((p) => (p !== null && p + 1 < items.length ? p + 1 : null))} />
        </div>
      )}
      {answers.map((a) => (
        <article key={a.id} className="card answer">
          <p className="label">{a.question}</p>
          {a.text && <p className="answer-text">{a.text}</p>}
          <div className="media-stack">{a.mediaIds.map((m) => <Media key={m} id={m} />)}</div>
          {isOwner && <Transcribe answer={a} />}
          <FollowUpAsk answer={a} />
          <ItemDocs docs={listDocuments({ medical: [], answers: [a] }).filter((d) => isOwner || d.summary)} onSummarize={setSummarizing} subtle />
          <Contributions items={a.contributions} />
        </article>
      ))}
      {summarizing && <SummarizeSheet docs={summarizing} onClose={() => setSummarizing(null)} />}
    </section>
  )
}

export function ReadAloud({ text }: { text: string }) {
  const [on, setOn] = useState(false)
  useEffect(() => () => { if ('speechSynthesis' in window) speechSynthesis.cancel() }, [])
  if (!('speechSynthesis' in window)) return null
  return (
    <button className="btn ghost" onClick={() => {
      if (on) { speechSynthesis.cancel(); setOn(false); return }
      const u = new SpeechSynthesisUtterance(text)
      u.rate = 0.95
      u.onend = () => setOn(false)
      speechSynthesis.speak(u)
      setOn(true)
    }}>
      <Icon name={on ? 'stop' : 'speaker'} size={18} /> {on ? 'Stop' : 'Listen'}
    </button>
  )
}
