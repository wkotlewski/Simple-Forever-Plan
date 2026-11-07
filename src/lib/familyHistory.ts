/** What doctors usually ask about family health history. Each can be answered here or asked of a relative. */
export const FAMILY_HISTORY: { title: string; question: string }[] = [
  { title: 'Heart disease', question: 'Has anyone in our family had heart disease, a heart attack, or heart surgery? Who, and about what age?' },
  { title: 'High blood pressure or cholesterol', question: 'Who in our family has had high blood pressure or high cholesterol?' },
  { title: 'Stroke', question: 'Has anyone in our family had a stroke? Who, and about what age?' },
  { title: 'Diabetes', question: 'Has anyone in our family had diabetes? Who, and what type if you know?' },
  { title: 'Cancer', question: 'Has anyone in our family had cancer? What kind, who, and about what age?' },
  { title: 'Memory loss or Alzheimer’s', question: 'Has anyone in our family had Alzheimer’s, dementia, or memory problems as they got older?' },
  { title: 'Mental health', question: 'Has anyone in our family lived with depression, anxiety, or another mental health condition?' },
  { title: 'Anything else that runs in the family', question: 'Are there any other health conditions doctors said run in our family?' },
]

/**
 * Answers to extra family-history questions a relative chose to fill in come back as `${askId}~${index}`.
 * Returns which question it was, or null for an ordinary answer.
 */
export function extraHistory(id: string): { baseId: string; index: number; title: string; question: string } | null {
  const m = id.match(/^(.+)~(\d+)$/)
  if (!m || !FAMILY_HISTORY[+m[2]]) return null
  return { baseId: m[1], index: +m[2], ...FAMILY_HISTORY[+m[2]] }
}
