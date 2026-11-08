# Setup notes

For running and hosting your own copy. Using the app needs none of this — open it at https://wkotlewski.github.io/Simple-Forever-Plan/.

The live app builds automatically: every push to `main` runs `.github/workflows/deploy.yml`, which builds into `app/` and GitHub Pages serves it.

## Run it

```bash
npm install
npm run dev
```

With no settings it runs in **this-device mode**: everything is saved privately in the browser, and family codes are created on the spot and sent from your own Messages or Mail app. Family can open the plan on that same device.

## Saving to Google Drive (optional)

People only see this option after you add a Google OAuth client ID, and they must tick "I agree" before anything is saved. The app asks for the narrow `drive.file` permission, so it can only see the one folder it creates ("Simple Forever Plan": a JSON file per section plus a "Recordings & Photos" folder), never anything else in their Drive.

1. In [Google Cloud Console](https://console.cloud.google.com), create a project and enable the **Google Drive API**.
2. **OAuth consent screen:** app name "Simple Forever Plan", your support email, and add the scope `.../auth/drive.file`. While testing, add your Google account(s) as test users; publish the app when you're ready for everyone.
3. **Credentials → Create credentials → OAuth client ID → Web application.** Under *Authorized JavaScript origins* add where the app runs, e.g. `http://localhost:5173` and `https://wkotlewski.github.io`.
4. Put the client ID in `.env.local` as `VITE_GOOGLE_CLIENT_ID` (and as a repository variable of the same name for GitHub Pages).

If someone starts on the phone and later switches to Drive, everything (recordings included) is moved into their Drive and removed from the phone. People can disconnect in the app or in their Google Account under Security → Third-party connections; their files stay in their Drive.

## Answer mailbox for "Ask someone who knows" (Supabase)

Lets relatives tap **Send** instead of texting their answer back. Plans still stay on each person's phone; only answers waiting to be picked up pass through Supabase, and they're deleted once saved.

1. Create a free project at [supabase.com](https://supabase.com).
2. SQL Editor → New query → paste [`../supabase/inbox.sql`](../supabase/inbox.sql) → Run.
3. Put the Project URL and publishable (anon) key in `.env.production` as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. These are meant to be public; the script only lets relatives drop answers in, and only the storyteller's phone (which holds a private key) can read them.

## Story writer (Supabase + OpenAI) — paused

The built-in writer is off in the live app (people use their own AI app instead). To turn it on, set `VITE_ENABLE_WRITER=true` and follow these steps.

Turns answers into chapters that read like a loving eulogy — clear and smooth, never invented — and writes a life overview with a list of facts to confirm or fix (fixes are followed in every chapter). Rewrites keep earlier versions.

1. After `inbox.sql`, also run [`../supabase/writer.sql`](../supabase/writer.sql) in the SQL Editor (a daily limit so no one else can use your key).
2. Edge Functions → Deploy a new function → Via Editor → name `story` → paste [`../supabase/functions/story/index.ts`](../supabase/functions/story/index.ts) → Deploy. In the function's settings, turn **off** "Verify JWT" (it checks the storyteller's private key itself).
3. Get an API key at [platform.openai.com](https://platform.openai.com) (add a little credit and set a monthly budget), then Edge Functions → Secrets → add `OPENAI_API_KEY`. Optional: `OPENAI_MODEL` to use a different model (default `gpt-5.5`). An `ANTHROPIC_API_KEY` works instead, if you prefer Claude.

## Turn on family sharing across devices (Supabase accounts)

Also set `VITE_ENABLE_ACCOUNTS=true` for this mode.


1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL editor, run [`../supabase/schema.sql`](../supabase/schema.sql). It creates the tables, the privacy rules (family read-only, medical hidden unless allowed) and a private file bucket.
3. **Sign-in codes:** Authentication → Providers → turn on **Email** (set the email template to show `{{ .Token }}` so people get a 6-digit code rather than a link) and **Phone** with Twilio for texts.
4. **Story writer:** `supabase functions deploy story` and `supabase secrets set ANTHROPIC_API_KEY=...`
5. **Invite notices (optional):** `supabase functions deploy invite`, then set `APP_URL` plus Resend (email) and/or Twilio (text) secrets — see the top of [`../supabase/functions/invite/index.ts`](../supabase/functions/invite/index.ts).
6. Copy `.env.example` to `.env.local` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

## Deploy

Live at https://wkotlewski.github.io/Simple-Forever-Plan/ . GitHub Pages serves the `main` branch (Settings → Pages → Deploy from a branch → main / root). On every push, a workflow builds the app into the `app/` folder and commits it, and the main page forwards there. To use the backend there, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` under Settings → Secrets and variables → Actions → **Variables**.

## How it's built

React + TypeScript + Vite. Every screen talks to one small storage interface ([`src/lib/store.ts`](../src/lib/store.ts)) with two implementations: IndexedDB for this-device mode and Supabase (Postgres + Storage) for cloud mode. Recording uses the browser's MediaRecorder; live transcription uses the Web Speech API where available.

| Folder | What's in it |
| --- | --- |
| `src/screens` | Welcome/sign-in, Home, Interview, Story & chapters, Book, Medical, Family Tree, Words to Keep, Share |
| `src/lib` | Storage, sign-in and access codes, interview questions, chapter writer, recorder, tree layout |
| `supabase` | Database schema and privacy rules, `story` and `invite` functions |

The medical binder helps families stay informed; it isn't a medical record. Always confirm medications with a doctor or pharmacist.
