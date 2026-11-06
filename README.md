# Simple Forever Plan

A phone-first app for telling your life story — and leaving your family what they'll need — in your own words and voice.

- **My Story** — a gentle interview, chapter by chapter (Where I Come From, Growing Up, Love & Family, Work & Purpose, Faith, Hard Times, Joys, Words to Keep). Answer by talking, recording video, writing, or uploading. Any question can be skipped. Speech is written down as you talk (where the browser supports it) and can be corrected.
- **Chapters → book, audiobook, podcast** — answers become a written chapter using only what was said (Claude when the backend is connected; a faithful arrangement of your own words otherwise). Choose first person ("I") or biography. Print or save the whole book as a PDF, have it read aloud, or play a chapter's recordings back-to-back in the storyteller's own voice.
- **Medical Binder** — labeled sections (Allergies, Medications, Conditions, Doctors & Care Team, Medical History, Insurance & Documents, Care Wishes). Snap the pill bottle, upload doctor's notes, or leave a voice note. An "At a glance" card shows allergies, meds and who to call, and prints as a one-pager.
- **Family Tree** — add people with photos, years and notes, connect parents, children, partners and siblings, and see everyone laid out by generation.
- **Words to Keep** — scripture, quotes, advice and letters tagged "open when…" (hard days, grief, wedding, new baby, graduation…). Interview answers in the faith, hard-times and legacy chapters can be saved here in one tap.
- **Where it's saved** — on the person's phone by default; nothing leaves the phone unless they choose. Anytime, they can **save a copy** to any app (Files, iCloud Drive, Google Drive, Dropbox, email) or **as a spreadsheet** for Google Sheets, Numbers or Excel, and **restore** a copy on a new phone. They can also choose to keep the plan in **their own Google Drive** after agreeing to a plain-language consent screen.
- **Share with family** — invite people by email or phone. They open the plan by entering a code sent to them, and only see the medical binder if you allow it. Drafts stay private until you share a chapter.

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

## Turn on family sharing across devices (Supabase)

1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL editor, run [`supabase/schema.sql`](supabase/schema.sql). It creates the tables, the privacy rules (family read-only, medical hidden unless allowed) and a private file bucket.
3. **Sign-in codes:** Authentication → Providers → turn on **Email** (set the email template to show `{{ .Token }}` so people get a 6-digit code rather than a link) and **Phone** with Twilio for texts.
4. **Story writer:** `supabase functions deploy story` and `supabase secrets set ANTHROPIC_API_KEY=...`
5. **Invite notices (optional):** `supabase functions deploy invite`, then set `APP_URL` plus Resend (email) and/or Twilio (text) secrets — see the top of [`supabase/functions/invite/index.ts`](supabase/functions/invite/index.ts).
6. Copy `.env.example` to `.env.local` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

## Deploy

Pushing to `main` builds the app and publishes it to the `gh-pages` branch, which GitHub Pages serves at https://wkotlewski.github.io/Simple-Forever-Plan/ (Settings → Pages → Source: **Deploy from a branch → gh-pages**). To use the backend there, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` under Settings → Secrets and variables → Actions → **Variables**.

## How it's built

React + TypeScript + Vite. Every screen talks to one small storage interface ([`src/lib/store.ts`](src/lib/store.ts)) with two implementations: IndexedDB for this-device mode and Supabase (Postgres + Storage) for cloud mode. Recording uses the browser's MediaRecorder; live transcription uses the Web Speech API where available.

| Folder | What's in it |
| --- | --- |
| `src/screens` | Welcome/sign-in, Home, Interview, Story & chapters, Book, Medical, Family Tree, Words to Keep, Share |
| `src/lib` | Storage, sign-in and access codes, interview questions, chapter writer, recorder, tree layout |
| `supabase` | Database schema and privacy rules, `story` and `invite` functions |

## Ideas for next

- Server-side transcription for browsers without live speech recognition (Safari on older iPhones, uploaded files)
- AI follow-up questions tailored to each answer
- Exported audiobook file (stitching recordings and narrated chapters into one MP3)
- Medication reminders for caregivers
- Let family add their own memories and photos to the tree

The medical binder helps families stay informed; it isn't a medical record. Always confirm medications with a doctor or pharmacist.
