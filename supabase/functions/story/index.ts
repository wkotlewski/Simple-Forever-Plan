// Simple Forever Plan — the story writer.
// Turns interview answers into chapters (like a loving eulogy: clear and warm, never invented),
// and writes "Your story so far": a life overview plus the facts it understood, for checking.
//
// Set up in the Supabase dashboard: Edge Functions → Deploy a new function → Via Editor → name it "story",
// paste this file, Deploy. Then turn OFF "Verify JWT" for it (the function checks the storyteller's
// private key itself), and under Edge Functions → Secrets add ANTHROPIC_API_KEY.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const TRUTH = `Accuracy comes first:
- Use ONLY names, places, dates, events and feelings that appear in the material. Never invent details, quotes, dialogue, motives or emotions.
- If something is unclear, contradictory or looks mis-transcribed, keep the person's own wording rather than guessing.
- Lines marked "(as remembered by NAME)" are memories from a family member: credit them by name ("Aunt Maria remembers…").
- "Corrections from the storyteller" are authoritative; they override anything else.`

const CHAPTER = `You help a family turn a person's recorded interview answers into one chapter of their life story — the kind of writing a loving family would want read at a memorial or passed down: clear, warm, and smoother than the scattered pieces, but never embellished.

${TRUTH}
Style:
- Keep their voice: their phrases, humor and way of speaking. Smooth and connect the pieces; do not add flourishes they didn't earn.
- Order events so they read naturally, usually in time order.
- Plain prose, paragraphs separated by a blank line. No title, headings, bullet points, or remarks from you.`

const SUMMARY = `You read everything a person has shared about their life and write back what you understood, so they can check it before their family relies on it.

${TRUTH}
Return ONLY a JSON object, no other text:
{
  "overview": "A warm overview of their life so far, 2 to 4 short paragraphs separated by \\n\\n, written in the third person by first name, the way a eulogy would open. Only what the material supports.",
  "facts": ["One short, checkable fact per item, e.g. 'Born in Hamtramck, Michigan, in 1948' — names, places, years, relationships, work, faith, turning points. 8 to 30 items."],
  "unclear": ["Anything contradictory, unclear or missing that the storyteller may want to clarify, phrased as a short question. 0 to 6 items."]
}`

async function allowed(body: any, auth: string | null) {
  const url = Deno.env.get('SUPABASE_URL')!
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')!
  if (body.inbox && body.secret) {
    const r = await fetch(`${url}/rest/v1/rpc/use_writer`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ inbox: body.inbox, secret: body.secret }),
    })
    if (r.ok) return null
    const msg = (await r.json().catch(() => ({})))?.message ?? ''
    return msg.includes('limit') ? msg : 'Not allowed'
  }
  // Accounts mode: a signed-in storyteller.
  if (auth) {
    const r = await fetch(`${url}/rest/v1/rpc/my_vault`, { method: 'POST', headers: { apikey: Deno.env.get('SUPABASE_ANON_KEY')!, Authorization: auth, 'Content-Type': 'application/json' }, body: '{}' })
    const rows = r.ok ? await r.json() : []
    if (rows?.[0]?.role === 'owner') return null
  }
  return 'Not allowed'
}

async function claude(system: string, content: string, maxTokens: number) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') ?? '', 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-5-5', max_tokens: maxTokens, system, messages: [{ role: 'user', content }] }),
  })
  if (!res.ok) throw new Error(res.status === 401 ? 'The Anthropic key is missing or wrong.' : `Story writer error (${res.status}).`)
  const out = await res.json()
  return (out.content ?? []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('').trim()
}

const material = (answers: { question: string; text: string }[]) =>
  answers.map((a, i) => `Q${i + 1}: ${a.question}\nA${i + 1}: ${a.text}`).join('\n\n')
const correctionsBlock = (c?: string[]) => (c?.length ? `\n\nCorrections from the storyteller:\n${c.map((x) => `- ${x}`).join('\n')}` : '')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const body = await req.json()
    const denied = await allowed(body, req.headers.get('Authorization'))
    if (denied) return json({ error: denied }, 403)
    const name = String(body.storytellerName || 'the storyteller')

    if (body.mode === 'summary') {
      const chapters = (body.chapters ?? []) as { title: string; answers: { question: string; text: string }[] }[]
      const text = chapters.map((c) => `## ${c.title}\n\n${material(c.answers)}`).join('\n\n')
      const raw = await claude(SUMMARY, `The storyteller is ${name}.${correctionsBlock(body.corrections)}\n\nEverything they and their family have shared:\n\n${text}`, 3000)
      const parsed = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1))
      return json({ overview: String(parsed.overview ?? ''), facts: (parsed.facts ?? []).map(String), unclear: (parsed.unclear ?? []).map(String) })
    }

    const answers = (body.answers ?? []) as { question: string; text: string }[]
    if (!answers.length) return json({ error: 'No answers' }, 400)
    const voice = body.voice === 'third'
      ? `Write in the third person as a loving biography of ${name}.`
      : `Write in the first person, as ${name} telling it ("I").`
    const prose = await claude(CHAPTER, `Chapter: "${body.chapterTitle}". ${voice}${correctionsBlock(body.corrections)}\n\nInterview answers:\n\n${material(answers)}`, 4000)
    return json({ body: prose })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
