/**
 * Spots where a story says "I need to ask my mom", "I'll follow up with Aunt Ruth", "my brother would know"…
 * so the app can offer a ready-to-send Ask family request for that question.
 */
export interface FollowUp { who?: string; sentence: string }

const KIN: Record<string, string> = {
  mom: 'Mom', mother: 'Mom', mama: 'Mom', ma: 'Mom', dad: 'Dad', father: 'Dad', papa: 'Dad', pop: 'Dad',
  grandma: 'Grandma', grandmother: 'Grandma', nana: 'Nana', busia: 'Busia', grandpa: 'Grandpa', grandfather: 'Grandpa', papaw: 'Papaw',
  sister: 'my sister', brother: 'my brother', husband: 'my husband', wife: 'my wife', son: 'my son', daughter: 'my daughter',
  aunt: 'Aunt', auntie: 'Aunt', uncle: 'Uncle', cousin: 'my cousin', parents: 'Mom and Dad', family: 'family',
}
const STOP = new Set(['her', 'him', 'them', 'someone', 'somebody', 'about', 'for', 'if', 'what', 'when', 'where', 'how', 'why', 'whether', 'the', 'a', 'and', 'but', 'so', 'to', 'it', 'that', 'this'])

/** "my mom" → "Mom", "my aunt Ruth" → "Aunt Ruth", "my sister Lisa" → "Lisa", "Joe" → "Joe". */
function personFrom(raw: string): string | undefined {
  const words = raw.trim().replace(/[.,;:!?]+$/, '').split(/\s+/)
  let i = 0
  if (/^(my|our)$/i.test(words[0] ?? '')) i++
  const kin = KIN[(words[i] ?? '').toLowerCase()]
  const name = words[i + 1] && /^[A-Z][a-z'’-]+$/.test(words[i + 1]) && !STOP.has(words[i + 1].toLowerCase()) ? words[i + 1] : undefined
  if (kin) {
    if (name) return kin === 'Aunt' || kin === 'Uncle' ? `${kin} ${name}` : name
    return kin === 'Aunt' || kin === 'Uncle' ? `my ${kin.toLowerCase()}` : kin
  }
  // A plain name: "ask Joe", "follow up with Ruth Carter"
  if (i === 0 && /^[A-Z][a-z'’-]+$/.test(words[0] ?? '') && !STOP.has(words[0].toLowerCase()) && words[0] !== 'I') {
    return /^[A-Z][a-z'’-]+$/.test(words[1] ?? '') && !STOP.has((words[1] ?? '').toLowerCase()) ? `${words[0]} ${words[1]}` : words[0]
  }
  return undefined
}

const WHO = String.raw`((?:my|our)\s+[a-z]+(?:\s+[A-Z][a-z'’-]+)?|[A-Z][a-z'’-]+(?:\s+[A-Z][a-z'’-]+)?)`
const PATTERNS: RegExp[] = [
  // "I need to ask my mom", "I'll have to check with Aunt Ruth", "gotta call my brother"
  new RegExp(String.raw`\b(?:need|needs|have|has|had|want|going|gonna|got|ought|plan|should|must|will|'ll|gotta)\s+(?:to\s+)?(?:go\s+)?(?:ask|check\s+with|follow\s+up\s+with|call|text|talk\s+to|find\s+out\s+from|confirm\s+with)\s+${WHO}`, 'g'),
  // "ask my mom to tell me", "follow up with Joe"
  new RegExp(String.raw`(?:^|[.!?]\s+|\b(?:I|I'll|I’ll|I'd|I’d|we)\s+)(?:ask|follow\s+up\s+with|check\s+with)\s+${WHO}`, 'g'),
  // "my mom would know", "Aunt Ruth might remember"
  new RegExp(String.raw`${WHO}\s+(?:would|might|may|will|probably|should)\s+(?:know|remember|have\s+(?:the\s+)?details)`, 'g'),
]
const GENERIC = /\b(?:need|have|got|gotta|should)\s+to\s+(?:follow\s+up|find\s+out|double[-\s]check|look\s+(?:that|it)\s+up)\b|\bnot sure\b.*\b(?:ask|check)\b/i

export function findFollowUps(text: string): FollowUp[] {
  const out: FollowUp[] = []
  const seen = new Set<string>()
  for (const sentence of text.split(/(?<=[.!?])\s+|\n+/)) {
    let found = false
    for (const re of PATTERNS) {
      re.lastIndex = 0
      for (const m of sentence.matchAll(re)) {
        const who = personFrom(m[1])
        if (!who) continue
        const key = who.toLowerCase()
        if (!seen.has(key)) { seen.add(key); out.push({ who, sentence: sentence.trim() }) }
        found = true
      }
    }
    if (!found && GENERIC.test(sentence) && !seen.has('')) { seen.add(''); out.push({ sentence: sentence.trim() }) }
  }
  return out.slice(0, 3)
}
