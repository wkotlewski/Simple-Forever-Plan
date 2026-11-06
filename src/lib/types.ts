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

export type MessageKind = 'scripture' | 'quote' | 'advice' | 'letter'

export interface KeepsakeMessage {
  id: ID
  kind: MessageKind
  text: string
  source?: string
  forWhom?: string
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
}

export interface CollectionMap {
  answers: Answer
  stories: ChapterStory
  people: Person
  relations: Relation
  medical: MedicalItem
  messages: KeepsakeMessage
  members: Member
  settings: Settings
}

export type CollectionName = keyof CollectionMap

export type Role = 'owner' | 'family'

export interface Session {
  role: Role
  name: string
  canViewMedical: boolean
}
