import { mediaKind } from './store'
import { CHAPTERS } from './questions'
import type { Answer, DocSummary, ID, MedicalItem } from './types'

/** One uploaded document (photo or file) and where it lives. */
export interface DocRef {
  owner: 'medical' | 'answers'
  itemId: ID
  mediaId: ID
  /** What it's attached to, e.g. "Lab results" or "Growing Up — favorite spot". */
  label: string
  medical: boolean
  summary?: DocSummary
}

const isDoc = (id: ID) => mediaKind(id) === 'image' || mediaKind(id) === 'file'

/** Every photo and file uploaded to the medical binder and the story, with its summary if it has one. */
export function listDocuments(data: { medical: MedicalItem[]; answers: Answer[] }, opts: { medical?: boolean } = {}): DocRef[] {
  const out: DocRef[] = []
  if (opts.medical !== false) {
    for (const m of data.medical) for (const id of m.mediaIds.filter(isDoc)) {
      out.push({ owner: 'medical', itemId: m.id, mediaId: id, label: m.title, medical: true, summary: m.docSummaries?.find((s) => s.mediaId === id) })
    }
  }
  for (const a of data.answers) for (const id of a.mediaIds.filter(isDoc)) {
    const chapter = CHAPTERS.find((c) => c.id === a.chapterId)?.title ?? 'Story'
    out.push({ owner: 'answers', itemId: a.id, mediaId: id, label: `${chapter} — ${a.question}`, medical: false, summary: a.docSummaries?.find((s) => s.mediaId === id) })
  }
  return out
}

/** Instructions that go to the person's AI app along with the document. Fixed headings so the answer can be read back in. */
export function docPrompt(doc: Pick<DocRef, 'medical' | 'label'>) {
  if (doc.medical) {
    return `Please help my family understand the attached medical document (it's filed under "${doc.label}"). Reply in plain, kind, everyday language using exactly these headings:

SUMMARY:
2–4 sentences: what kind of document this is, who it's about, the date and who wrote it, if shown.

KEY DETAILS:
- Bullet points: diagnoses, medications and doses, test results with their values and normal ranges, appointments and instructions.

WORTH A CLOSER LOOK:
- Bullet points: anything marked high, low or abnormal, outside the normal range, new or changed, urgent instructions, or follow-ups that are due — and why it matters, in simple words. Write "Nothing stood out" if there's nothing.

LOOKS GOOD:
- Bullet points: results in the normal range, improvements, and things that are stable.

QUESTIONS FOR THE DOCTOR:
- 2–5 short questions worth asking at the next visit.

Only use what is in the document — don't guess or add anything that isn't shown. If part of it is hard to read, say so. This is to help us prepare and ask good questions, not to replace a doctor's advice.`
  }
  return `Please help my family understand the attached document or photo (it's part of my life story, under "${doc.label}"). Reply in plain, warm, everyday language using exactly these headings:

SUMMARY:
2–4 sentences: what this is, who and what it's about, and the date and place if shown.

KEY DETAILS:
- Bullet points: names, dates, places and anything written on it worth keeping.

HIGHLIGHTS:
- Bullet points: what makes it meaningful or interesting for the family.

Only use what is actually shown — don't guess or add anything. If part of it is hard to read, say so.`
}

const HEADINGS: [RegExp, keyof Omit<DocSummary, 'mediaId' | 'at'>][] = [
  [/^summary$/, 'summary'],
  [/^key details?$|^details$/, 'details'],
  [/^worth a closer look$|^concerns?$|^highlights?$|^things to watch$/, 'concerns'],
  [/^looks good$|^what looks good$|^good news$/, 'good'],
  [/^questions?( for the doctor| to ask)?$/, 'questions'],
]

/** Reads an AI app's answer (any formatting: bold, #, numbered) back into the summary's sections. */
export function parseDocSummary(text: string, mediaId: ID): DocSummary | null {
  const out: DocSummary = { mediaId, summary: '', details: [], concerns: [], good: [], questions: [], at: Date.now() }
  let section: keyof Omit<DocSummary, 'mediaId' | 'at'> | null = null
  let found = false
  const summary: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim()
    if (!line) continue
    // A heading, possibly with text after it on the same line: "**Summary:** This is a lab report…", "## Looks good", "SUMMARY"
    const plain = line.replace(/[*_#]/g, '').trim()
    const m = plain.match(/^([A-Za-z ]{4,32}?)\s*[:：]\s*(.*)$/) ?? (/^[A-Za-z ]{4,32}$/.test(plain) ? [plain, plain, ''] : null)
    const hit = m && HEADINGS.find(([re]) => re.test(m[1].trim().toLowerCase()))
    if (m && hit) {
      section = hit[1]; found = true
      line = m[2].trim()
      if (!line) continue
    }
    const item = line.replace(/^([-•*·]|\d+[.)])\s*/, '').replace(/\*\*/g, '').trim()
    if (!item || /^nothing (else )?stood out\.?$/i.test(item)) continue
    if (section === 'summary' || section === null) summary.push(item)
    else (out[section] as string[]).push(item)
  }
  out.summary = summary.join(' ')
  if (!found) return out.summary ? { ...out, summary: out.summary } : null
  return out
}
