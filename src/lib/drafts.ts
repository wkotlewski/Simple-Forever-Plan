import type { MedicalItem, Person, Relation } from './types'
import { parentsOf, spousesOf } from './tree'

/** A ready-made question for "Ask family". `field` says which detail the answer can fill in. */
export interface Draft { text: string; field?: 'born' | 'died' }

/** Questions about someone on the family tree, most useful first (missing details come first). */
export function personDrafts(p: Person, people: Person[], relations: Relation[]): Draft[] {
  const n = p.name.split(' ')[0] || p.name
  const name = (id: string) => people.find((x) => x.id === id)?.name.split(' ')[0]
  const partner = spousesOf(p.id, relations).map(name).filter(Boolean)[0]
  const hasParents = parentsOf(p.id, relations).length > 0
  const birthday: Draft = { text: `What year and day was ${n}’s birthday?`, field: 'born' }
  const passed: Draft = { text: `When did ${n} pass away — what year and date?`, field: 'died' }
  const list: Draft[] = [
    ...(!p.born ? [birthday] : []),
    ...(p.died && !/\d{4}.*\d/.test(p.died) ? [passed] : []),
    { text: `Where was ${n} born, and where did they grow up?` },
    ...(partner ? [{ text: `How did ${n} and ${partner} meet?` }] : []),
    ...(!hasParents ? [{ text: `Who were ${n}’s parents, and where were they from?` }] : []),
    { text: `What did ${n} do for work?` },
    { text: `What’s a favorite memory you have of ${n}?` },
    { text: `What do you remember about ${n}? Any stories, what they were like, where they lived?` },
    ...(p.born ? [{ text: `Can you confirm ${n}’s birthday? I have ${p.born}.`, field: 'born' as const }] : []),
  ]
  return list
}

/** Questions about something in the Medical Binder. */
export function medicalDrafts(i: Pick<MedicalItem, 'category' | 'title'>): Draft[] {
  const t = i.title
  switch (i.category) {
    case 'medication': return [
      { text: `Do you know what ${t} is for and when it was started?` },
      { text: `What dose of ${t} is it, and what time of day is it taken?` },
      { text: `Which doctor prescribes ${t}, and which pharmacy fills it?` },
    ]
    case 'allergy': return [
      { text: `What happens when there’s a reaction to ${t}? How bad has it been?` },
      { text: `When was the ${t} allergy first noticed?` },
    ]
    case 'condition': return [
      { text: `When was ${t} diagnosed, and which doctor treats it?` },
      { text: `What should we watch for with ${t}, and what helps?` },
    ]
    case 'doctor': return [
      { text: `What’s the phone number and office address for ${t}?` },
      { text: `What does ${t} treat, and when was the last visit?` },
    ]
    case 'history': return [
      { text: `What year was the ${t}, and which hospital or doctor was it with?` },
      { text: `What do you remember about the ${t}? How was the recovery?` },
    ]
    case 'insurance': return [
      { text: `Do you know where the ${t} paperwork is kept?` },
      { text: `Who is the contact for ${t}, and what’s their number?` },
    ]
    case 'wishes': return [
      { text: `Do you know what was decided about ${t}? Is it written down anywhere?` },
    ]
    default: return [{ text: `What do you know about ${t.toLowerCase()} in our family?` }]
  }
}
