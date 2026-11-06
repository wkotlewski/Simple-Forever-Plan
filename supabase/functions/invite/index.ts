// Sends a family member a friendly heads-up that a plan was shared with them.
// Their private sign-in code is sent separately by Supabase Auth when they open the app,
// so this message never contains anything that unlocks the plan by itself.
//
// Deploy:  supabase functions deploy invite
// Secrets (set whichever channels you use):
//   APP_URL=https://you.github.io/simple-forever-plan/
//   RESEND_API_KEY=re_...   INVITE_FROM="Simple Forever Plan <hello@yourdomain.com>"
//   TWILIO_ACCOUNT_SID=AC...   TWILIO_AUTH_TOKEN=...   TWILIO_FROM=+15551234567
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { memberId } = await req.json()
  // Row-level security means this only finds the member if the caller owns the plan.
  const { data: m } = await sb.from('vault_members').select('name, contact, channel, vaults(storyteller)').eq('id', memberId).single()
  if (!m) return json({ error: 'Not found' }, 404)

  const who = (m as any).vaults?.storyteller ?? 'Someone in your family'
  const url = Deno.env.get('APP_URL') ?? ''
  const text = `${who} shared their Simple Forever Plan with you — life stories, the family tree and words to keep. ` +
    `Open ${url}, tap "I'm family", and enter the code we send to this ${m.channel === 'sms' ? 'number' : 'email'}.`

  if (m.channel === 'email' && Deno.env.get('RESEND_API_KEY')) {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: Deno.env.get('INVITE_FROM'), to: m.contact, subject: `${who} shared something with you`, text }),
    })
  } else if (m.channel === 'sms' && Deno.env.get('TWILIO_ACCOUNT_SID')) {
    const sid = Deno.env.get('TWILIO_ACCOUNT_SID')!
    await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${sid}:${Deno.env.get('TWILIO_AUTH_TOKEN')}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: m.contact, From: Deno.env.get('TWILIO_FROM')!, Body: text }),
    })
  } else {
    return json({ sent: false, reason: 'No email or text provider configured' })
  }
  return json({ sent: true })
})

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
