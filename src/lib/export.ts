import { CHAPTERS, questionOrder } from './questions'
import { MED_LABELS } from './medicalLabels'
import { childrenOf, parentsOf, spousesOf } from './tree'
import type { CollectionMap, CollectionName, Contribution } from './types'

type Data = { [K in CollectionName]: CollectionMap[K][] }

export interface Section { heading: string; sub?: string; paragraphs: string[] }

const memories = (c?: Contribution[]) => (c ?? []).filter((m) => m.text.trim()).map((m) => `${m.from} remembers: ${m.text.trim()}`)

/** Everything someone has shared, organized into readable sections. */
export function planSections(data: Data, name: string, opts: { medical: boolean; chapterId?: string }): Section[] {
  const out: Section[] = []
  for (const c of CHAPTERS) {
    if (opts.chapterId && c.id !== opts.chapterId) continue
    const answers = data.answers.filter((a) => a.chapterId === c.id)
      .sort((a, b) => questionOrder(c, a.questionId) - questionOrder(c, b.questionId))
    const paragraphs = answers.flatMap((a) => {
      const own = a.text.trim() && !a.skipped ? [`${a.question}\n${a.text.trim()}`] : []
      const fam = memories(a.contributions).map((m) => `${a.question}\n${m}`)
      return [...own, ...fam]
    })
    const story = data.stories.find((s) => s.id === c.id)
    if (!paragraphs.length && !story?.body) continue
    out.push({ heading: c.title, sub: story?.body ? 'Written chapter, then the answers it came from' : 'In their own words', paragraphs: [...(story?.body ? [story.body] : []), ...paragraphs] })
  }
  if (opts.chapterId) return out

  const name_ = (id: string) => data.people.find((p) => p.id === id)?.name ?? ''
  const family = data.people.filter((p) => !p.circle || p.circle === 'family')
  if (family.length) {
    out.push({
      heading: 'Family', paragraphs: family.map((p) => {
        const bits = [
          p.isSelf ? `${p.name} (${name})` : p.name,
          [p.born, p.died].filter(Boolean).join('–'),
          parentsOf(p.id, data.relations).length ? `child of ${parentsOf(p.id, data.relations).map(name_).join(' & ')}` : '',
          spousesOf(p.id, data.relations).length ? `partner of ${spousesOf(p.id, data.relations).map(name_).join(', ')}` : '',
          childrenOf(p.id, data.relations).length ? `parent of ${childrenOf(p.id, data.relations).map(name_).join(', ')}` : '',
        ].filter(Boolean).join(' · ')
        return [bits, p.notes.trim(), ...memories(p.contributions)].filter(Boolean).join('\n')
      }),
    })
  }
  const others = data.people.filter((p) => p.circle && p.circle !== 'family')
  if (others.length) {
    out.push({ heading: 'People Who Mattered', paragraphs: others.map((p) => [`${p.name} · ${p.relation ?? p.circle}`, p.notes.trim(), ...memories(p.contributions)].filter(Boolean).join('\n')) })
  }
  if (data.messages.length) {
    out.push({
      heading: 'Words to Keep', paragraphs: data.messages.map((m) =>
        [`${m.kind[0].toUpperCase()}${m.kind.slice(1)}${m.forWhom ? ` — for ${m.forWhom}` : ''}: ${m.text}`, m.source ? `— ${m.source}` : '', m.note ?? '', `Open when: ${m.occasions.join(', ')}`].filter(Boolean).join('\n')),
    })
  }
  if (opts.medical && data.medical.length) {
    out.push({
      heading: 'Medical Notes', sub: 'Not a medical record — confirm medications with a doctor or pharmacist.',
      paragraphs: data.medical.map((m) => [
        `${MED_LABELS[m.category]}: ${m.title}${m.dosage ? ` — ${m.dosage}` : ''}${m.schedule ? ` (${m.schedule})` : ''}`,
        m.details, m.prescriber ? `Prescribed by ${m.prescriber}` : '', m.phone ? `Phone: ${m.phone}` : '', ...memories(m.contributions),
        ...(m.docSummaries ?? []).map((d) => [
          `Document summary: ${d.summary}`,
          d.concerns.length ? `Worth a closer look: ${d.concerns.join('; ')}` : '',
          d.good.length ? `Looks good: ${d.good.join('; ')}` : '',
          d.questions.length ? `Questions for the doctor: ${d.questions.join(' ')}` : '',
        ].filter(Boolean).join('\n')),
      ].filter(Boolean).join('\n')),
    })
  }
  return out
}

export const sectionsToText = (title: string, sections: Section[]) =>
  [title, ...sections.map((s) => `\n## ${s.heading}${s.sub ? `\n(${s.sub})` : ''}\n\n${s.paragraphs.join('\n\n')}`)].join('\n')

/** Instructions to paste into ChatGPT, Claude, Gemini or any chat tool, followed by the material. */
export function aiInstructions(kind: 'story' | 'chapter', name: string, chapterTitle?: string) {
  const what = kind === 'chapter'
    ? `Please turn the answers below into one chapter of ${name}'s life story, titled "${chapterTitle}".`
    : `Please read everything below about ${name}'s life and write:\n1. A warm overview of their life so far (2–4 short paragraphs), the way a eulogy would open.\n2. A list of the key facts you understood (names, places, years, relationships, work, faith, turning points), one per line, so they can check them.\n3. Any questions about things that seem unclear or contradictory.`
  return `${what}

Write it the way a loving family would want it read at a memorial: clear, warm and smoother than the scattered pieces — but never embellished.
- Use ONLY what appears below. Do not invent names, dates, places, quotes, events or feelings.
- If something is unclear, keep their own wording instead of guessing.
- Lines that say "NAME remembers:" are memories from family members; credit them by name.
- Keep ${name}'s own voice and phrases.

----
`
}

// ---------- PDF ----------

// The built-in PDF fonts cover Western European text; swap characters they can't draw for close equivalents.
const pdfSafe = (s: string) => s
  .replace(/[‘’‚′]/g, "'").replace(/[“”„″]/g, '"')
  .replace(/[–—]/g, '-').replace(/…/g, '...').replace(/ /g, ' ')
  .replace(/[^\x09\x0A\x0D\x20-\x7E¡-ÿ]/g, '')

/** A simple, readable PDF: title, then each section's heading and paragraphs, with page breaks as needed. */
export async function makePdf(title: string, sections: Section[], intro?: string): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 56
  let y = M
  const ensure = (h: number) => { if (y + h > H - M) { doc.addPage(); y = M } }
  const write = (text: string, size: number, style: 'normal' | 'bold' | 'italic', gap: number, color = 30) => {
    doc.setFont('times', style); doc.setFontSize(size); doc.setTextColor(color)
    for (const line of doc.splitTextToSize(pdfSafe(text), W - M * 2) as string[]) {
      ensure(size * 1.35)
      doc.text(line, M, y + size)
      y += size * 1.35
    }
    y += gap
  }
  write(title, 26, 'bold', 6)
  write(new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }), 11, 'normal', 18, 110)
  if (intro) write(intro, 11, 'normal', 14, 60)
  for (const s of sections) {
    ensure(60)
    y += 8
    write(s.heading, 18, 'bold', s.sub ? 2 : 8)
    if (s.sub) write(s.sub, 10, 'italic', 8, 110)
    for (const p of s.paragraphs) {
      const [first, ...rest] = p.split('\n')
      if (rest.length) { write(first, 11.5, 'bold', 2, 60); write(rest.join('\n'), 12, 'normal', 10) }
      else write(p, 12, 'normal', 10)
    }
  }
  return doc.output('blob')
}
