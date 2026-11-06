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
}

/** An answer someone else sent back after being asked about one question. */
export interface Contribution {
  id: ID
  from: string
  text: string
  mediaIds: ID[]
  addedAt: number
}

/** A question sent to a relative by text, waiting for (or holding) their reply. */
export interface Ask {
  id: ID
  chapterId: string
  questionId: string
  question: string
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
}

export type MessageKind = 'scripture' | 'song' | 'quote' | 'advice' | 'letter'

export interface KeepsakeMessage {
  id: ID
  kind: MessageKind
  text: string
  source?: string
  forWhom?: string
  /** Why it mattered — often the sentence from the story where it came up. */
  note?: string
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
