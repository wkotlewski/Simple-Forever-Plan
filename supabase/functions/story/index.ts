// Turns a chapter's interview answers into a written chapter with Claude.
// Deploy:  supabase functions deploy story
// Secrets: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...   (optional: ANTHROPIC_MODEL)
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SYSTEM = `You help older adults turn recorded interview answers into a chapter of their life story for their family.

Rules — accuracy matters more than polish:
- Use ONLY facts, names, places, dates and feelings that appear in the answers. Never invent details, dialogue, or emotions.
- If something is unclear or seems mis-transcribed, keep the person's wording rather than guessing.
- Keep their voice: their phrases, humor, and way of speaking. Light smoothing is fine; embellishment is not.
- Some answers are labeled "(as remembered by NAME)": those are memories from a family member. Weave them in and credit them by name (e.g. "Aunt Maria remembers…").
- Order the material so it reads naturally (usually chronologically).
- Plain, warm prose. No headings, no bullet points, no title, no preface or closing remarks from you.
- Separate paragraphs with a blank line.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    // Only signed-in storytellers may call this.
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: me } = await sb.rpc('my_vault')
    if (!me?.[0] || me[0].role !== 'owner') return json({ error: 'Not allowed' }, 403)

    const { chapterTitle, storytellerName, voice, answers } = await req.json()
    if (!Array.isArray(answers) || !answers.length) return json({ error: 'No answers' }, 400)

    const transcript = answers
      .map((a: { question: string; text: string }, i: number) => `Q${i + 1}: ${a.question}\nA${i + 1}: ${a.text}`)
      .join('\n\n')
    const perspective = voice === 'third'
      ? `Write in the third person as a loving biography of ${storytellerName}.`
      : `Write in the first person, as ${storytellerName} telling it ("I").`

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-5-5',
        max_tokens: 4000,
        system: SYSTEM,
        messages: [{
          role: 'user',
          content: `Chapter: "${chapterTitle}". ${perspective}\n\nInterview answers:\n\n${transcript}`,
        }],
      }),
    })
    if (!res.ok) return json({ error: `Story writer error ${res.status}` }, 502)
    const out = await res.json()
    const body = (out.content ?? []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('').trim()
    return json({ body })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
