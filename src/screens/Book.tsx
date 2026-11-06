import { useData } from '../lib/data'
import { CHAPTERS } from '../lib/questions'
import { mediaKind } from '../lib/store'
import { Empty, Icon, Media, ScreenHeader } from '../components/ui'
import { ReadAloud } from './Story'

/** The whole life story as a book: print it, save it as a PDF, or listen to it read aloud. */
export default function Book({ onBack }: { onBack: () => void }) {
  const { data, isOwner, session, settings } = useData()
  const name = isOwner ? session.name : settings.storytellerName
  const stories = CHAPTERS
    .map((c) => ({ c, s: data.stories.find((x) => x.id === c.id) }))
    .filter(({ s }) => s && s.body && (isOwner || s.approved))
  const keepsakes = data.messages.slice().sort((a, b) => a.createdAt - b.createdAt)
  const photoFor = (chapterId: string) =>
    data.answers.filter((a) => a.chapterId === chapterId).flatMap((a) => a.mediaIds).find((m) => mediaKind(m) === 'image')

  const fullText = [`The story of ${name}.`, ...stories.map(({ c, s }) => `${c.title}. ${s!.body}`)].join('\n\n')

  return (
    <div className="screen book-screen">
      <div className="no-print">
        <ScreenHeader title="The Book" sub="Print it, save it as a PDF, or listen to it." onBack={onBack} />
        {stories.length > 0 && (
          <div className="row wrap">
            <button className="btn" onClick={() => window.print()}><Icon name="print" size={18} /> Print or save as PDF</button>
            <ReadAloud text={fullText} />
          </div>
        )}
        {isOwner && stories.some(({ s }) => !s!.approved) && <p className="muted small">Draft chapters are included here for you; family only sees shared chapters.</p>}
      </div>

      {!stories.length ? (
        <Empty icon="book" title="No chapters written yet">
          {isOwner ? 'Answer a few questions, then tap “Turn my answers into a chapter.”' : 'Nothing has been shared yet.'}
        </Empty>
      ) : (
        <article className="book">
          <section className="book-title page">
            <p className="eyebrow">The Story of</p>
            <h1>{name}</h1>
            <p className="muted">In {isOwner || settings.voice === 'first' ? 'their own' : 'loving'} words · {new Date().getFullYear()}</p>
          </section>

          <section className="book-toc page">
            <h2>Contents</h2>
            <ol>{stories.map(({ c }) => <li key={c.id}>{c.title}</li>)}{keepsakes.length > 0 && <li>Words to Keep</li>}</ol>
          </section>

          {stories.map(({ c, s }, i) => {
            const photo = photoFor(c.id)
            return (
              <section key={c.id} className="book-chapter page">
                <p className="eyebrow">Chapter {i + 1}</p>
                <h2>{c.title}</h2>
                {photo && <Media id={photo} className="book-photo" />}
                {s!.body.split(/\n{2,}/).map((p, j) => <p key={j}>{p}</p>)}
              </section>
            )
          })}

          {keepsakes.length > 0 && (
            <section className="book-chapter page">
              <p className="eyebrow">For the road ahead</p>
              <h2>Words to Keep</h2>
              {keepsakes.map((m) => (
                <blockquote key={m.id}>
                  <p>{m.text}</p>
                  {(m.source || m.occasions.length > 0) && <footer>{[m.source, m.occasions.join(', ')].filter(Boolean).join(' · ')}</footer>}
                </blockquote>
              ))}
            </section>
          )}
        </article>
      )}
    </div>
  )
}
