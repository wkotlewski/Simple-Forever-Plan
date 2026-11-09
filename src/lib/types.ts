export type ID = string

/** One response to an interview question. Recordings live in media; text is what was said or typed. */
export interface Answer {
  id: ID
  chapterId: string
  questionId: string
  question: string
  text: string
  mediaIds: ID[]
  skipped?: boolean
  createdAt: number
  /** What other family members added when asked about this question. */
  contributions?: Contribution[]
  /** Summaries of photos or files attached here (letters, certificates…). */
  docSummaries?: DocSummary[]
}

/** A plain-language summary of one uploaded document, written with the person's own AI app and pasted back. */
export interface DocSummary {
  mediaId: ID
  summary: string
  details: string[]
  /** Medical: things worth a closer look (out of range, new, follow-ups). Other documents: highlights. */
  concerns: string[]
  good: string[]
  questions: string[]
  at: number
}

/** An answer someone else sent back after being asked about one question. */
export interface Contribution {
  id: ID
  from: string
  text: string
  mediaIds: ID[]
  addedAt: number
  /** The request it answered, so removing the request can remove its answers too. */
  askId?: ID
}

/** A question sent to a relative by text, waiting for (or holding) their reply. */
export interface Ask {
  id: ID
  /** For story questions. */
  chapterId?: string
  questionId?: string
  /** For anything else: a medical item or family-history question, or a person on the tree. */
  target?: { kind: 'medical'; itemId?: ID; category: MedicalCategory; title: string } | { kind: 'person'; personId: ID; field?: 'born' | 'died' } | { kind: 'tree' }
  question: string
  /** Set when this question went out as part of a survey (one link, several questions). */
  surveyId?: ID
  toName: string
  toPhone: string
  note?: string
  sentAt: number
  answeredAt?: number
}

/** The written version of a chapter, built only from that chapter's answers. */
export interface ChapterStory {
  id: string // same as chapterId
  title: string
  body: string
  voice: 'first' | 'third'
  approved: boolean
  updatedAt: number
  /** Earlier saved versions (newest first), so rewriting never loses anything. */
  history?: { body: string; savedAt: number }[]
}

export interface Person {
  id: ID
  name: string
  born?: string
  died?: string
  photoId?: ID
  notes: string
  isSelf?: boolean
  /** Family (on the tree) or someone else who mattered: a person they mentored, a mentor, a friend. */
  circle?: 'family' | 'mentored' | 'mentor' | 'friend'
  /** In their words, e.g. "Brother", "Apprentice at the shop", "My first boss". */
  relation?: string
  /** What relatives shared about this person when asked. */
  contributions?: Contribution[]
}

/** parent: `from` is a parent of `to`. spouse: partners, either direction. */
export interface Relation {
  id: ID
  type: 'parent' | 'spouse'
  from: ID
  to: ID
}

export type MedicalCategory =
  | 'medication'
  | 'allergy'
  | 'condition'
  | 'doctor'
  | 'history'
  | 'insurance'
  | 'wishes'
  | 'family'

export interface MedicalItem {
  id: ID
  category: MedicalCategory
  title: string
  details: string
  dosage?: string
  schedule?: string
  prescriber?: string
  phone?: string
  mediaIds: ID[]
  createdAt: number
  /** Answers relatives sent back when asked about this. */
  contributions?: Contribution[]
  /** Summaries of the attached documents (lab results, discharge papers, prescriptions…). */
  docSummaries?: DocSummary[]
}

export type MessageKind = 'memory' | 'scripture' | 'song' | 'quote' | 'advice' | 'letter'

export interface KeepsakeMessage {
  id: ID
  kind: MessageKind
  text: string
  source?: string
  forWhom?: string
  /** Why it mattered — often the sentence from the story where it came up. */
  note?: string
  /** For songs: a YouTube, Spotify or Apple Music link so family can listen. */
  link?: string
  /** For photos and videos: who's in it (people on the family tree). */
  people?: ID[]
  occasions: string[]
  mediaIds: ID[]
  createdAt: number
}

export interface Member {
  id: ID
  name: string
  contact: string
  channel: 'email' | 'sms'
  canViewMedical: boolean
  accessCode?: string // only used in this-device mode; real codes are sent by the server
  invitedAt: number
}

export interface Settings {
  id: 'settings'
  storytellerName: string
  voice: 'first' | 'third'
  /** When the storyteller agreed to keep their plan in their Google Drive. */
  driveConsentAt?: string
  /** The storyteller's own mobile number, so relatives can text answers back. */
  phone?: string
  /** This storyteller's private answer mailbox (see supabase/inbox.sql). */
  inboxId?: string
  inboxKey?: string
  /** Suggestions from stories the storyteller chose not to add. */
  dismissed?: string[]
  /** When a full backup was last saved, and until when the reminder is snoozed. */
  lastBackupAt?: number
  backupSnoozedUntil?: number
}

/** "Your story so far": what the writer understood, checked by the storyteller. */
export interface LifeSummary {
  id: 'summary'
  overview: string
  facts: { text: string; status: 'unchecked' | 'right' | 'fixed'; correction?: string }[]
  unclear: { question: string; answer?: string }[]
  /** How many answers it was written from, to tell when it's out of date. */
  basedOn: number
  updatedAt: number
}

export interface CollectionMap {
  answers: Answer
  stories: ChapterStory
  people: Person
  relations: Relation
  medical: MedicalItem
  messages: KeepsakeMessage
  members: Member
  asks: Ask
  insights: LifeSummary
  settings: Settings
}

export type CollectionName = keyof CollectionMap

export type Role = 'owner' | 'family'

export interface Session {
  role: Role
  name: string
  canViewMedical: boolean
  /** Where this device keeps the plan: in the browser, or in the storyteller's Google Drive. */
  storage?: 'local' | 'drive'
}
