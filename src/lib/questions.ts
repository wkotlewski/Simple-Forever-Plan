import type { MessageKind } from './types'

export interface Question {
  id: string
  text: string
  hint?: string
  followUps?: string[]
  /** Answers to this question are also offered as a keepsake message for the family. */
  keepsake?: MessageKind
}

export interface Chapter {
  id: string
  title: string
  blurb: string
  questions: Question[]
}

/**
 * The interview is gentle on purpose: warm-up questions first, harder ones later,
 * and every question can be skipped without explanation.
 */
export const CHAPTERS: Chapter[] = [
  {
    id: 'roots',
    title: 'Where I Come From',
    blurb: 'Your earliest years, your parents, and the place you called home.',
    questions: [
      { id: 'roots-born', text: 'Where and when were you born?', hint: 'A town, a hospital, a farmhouse — whatever you remember or were told.', followUps: ['Is there a story about the day you were born?'] },
      { id: 'roots-home', text: 'What was the home you grew up in like?', hint: 'The rooms, the smells, the sounds, who lived there.', followUps: ['Where was your favorite spot in that house?'] },
      { id: 'roots-parents', text: 'Tell me about your mother and father.', hint: 'What did they do? What were they like with you?', followUps: ['What is something they always used to say?'] },
      { id: 'roots-siblings', text: 'Did you have brothers, sisters, or cousins you were close to?', followUps: ['What did you get into together?'] },
      { id: 'roots-memory', text: 'What is one of your very first memories?' },
      { id: 'roots-heritage', text: 'Where did your family come from before that?', hint: 'Grandparents, countries, languages, family names.' },
    ],
  },
  {
    id: 'growing-up',
    title: 'Growing Up',
    blurb: 'School, friends, and the young person you were.',
    questions: [
      { id: 'grow-school', text: 'What was school like for you?', followUps: ['Was there a teacher who made a difference?'] },
      { id: 'grow-friends', text: 'Who were your best friends growing up?' },
      { id: 'grow-fun', text: 'What did you do for fun as a kid or teenager?', hint: 'Games, music, sports, places you went.' },
      { id: 'grow-trouble', text: 'Did you ever get into trouble? What happened?', hint: 'Only if you feel like sharing!' },
      { id: 'grow-dream', text: 'What did you want to be when you grew up?' },
      { id: 'grow-leave', text: 'When did you first leave home, and where did you go?' },
    ],
  },
  {
    id: 'love',
    title: 'Love & Family',
    blurb: 'The people you chose and the family you built.',
    questions: [
      { id: 'love-meet', text: 'How did you meet the love of your life?', hint: 'Or someone who mattered deeply to you.', followUps: ['What did you notice first about them?'] },
      { id: 'love-wedding', text: 'Tell me about your wedding or a day you made a commitment.' },
      { id: 'love-children', text: 'What do you remember about becoming a parent?', hint: 'Skip this if it does not fit your life.', followUps: ['What surprised you most?'] },
      { id: 'love-each-child', text: 'What would you like each of your children or grandchildren to know about how you see them?' },
      { id: 'love-traditions', text: 'What family traditions do you hope continue?' },
    ],
  },
  {
    id: 'work',
    title: 'Work & Purpose',
    blurb: 'The work you did and what gave your days meaning.',
    questions: [
      { id: 'work-first', text: 'What was your very first job?' },
      { id: 'work-career', text: 'What work did you spend most of your life doing?', followUps: ['What were you proudest of there?'] },
      { id: 'work-mentor', text: 'Who helped you along the way?' },
      { id: 'work-service', text: 'Did you serve in the military, your church, or your community?' },
      { id: 'work-proud', text: 'What accomplishment are you most proud of?' },
    ],
  },
  {
    id: 'faith',
    title: 'Faith & What I Believe',
    blurb: 'What you hold onto and why.',
    questions: [
      { id: 'faith-grow', text: 'What role has faith or spirituality played in your life?', hint: 'Whatever that means for you.' },
      { id: 'faith-moment', text: 'Was there a moment your faith or beliefs changed or grew stronger?' },
      { id: 'faith-values', text: 'What values did you try hardest to live by?' },
      { id: 'faith-verse', text: 'Is there a scripture, verse, or passage that has carried you?', keepsake: 'scripture', followUps: ['When did it mean the most to you?'] },
    ],
  },
  {
    id: 'hard-times',
    title: 'Hard Times',
    blurb: 'The storms you weathered. Share only what you are comfortable with.',
    questions: [
      { id: 'hard-hardest', text: 'What was one of the hardest seasons of your life?', hint: 'You can keep this short or skip it entirely.' },
      { id: 'hard-through', text: 'What got you through it?', keepsake: 'advice' },
      { id: 'hard-loss', text: 'Is there someone you lost that you want your family to remember?' },
      { id: 'hard-learned', text: 'What did hard times teach you that you want your family to know?', keepsake: 'advice' },
    ],
  },
  {
    id: 'joys',
    title: 'Joys & Favorites',
    blurb: 'The small and big things that made life sweet.',
    questions: [
      { id: 'joy-happiest', text: 'What is one of the happiest days you can remember?' },
      { id: 'joy-food', text: 'What recipe or meal should the family never forget?', hint: 'Ingredients and steps are welcome!' },
      { id: 'joy-music', text: 'What songs, books, or places do you love?' },
      { id: 'joy-funny', text: 'What is the funniest thing that ever happened in this family?' },
      { id: 'joy-travel', text: 'Where is a place you went that you will never forget?' },
    ],
  },
  {
    id: 'legacy',
    title: 'Words to Keep',
    blurb: 'What you want your family to carry with them.',
    questions: [
      { id: 'legacy-hard-days', text: 'What would you say to someone in the family on a really hard day?', keepsake: 'advice' },
      { id: 'legacy-quote', text: 'Is there a quote or saying you live by?', keepsake: 'quote' },
      { id: 'legacy-milestones', text: 'What would you want to say on a wedding day, a new baby, or a graduation?', keepsake: 'letter' },
      { id: 'legacy-remember', text: 'How do you hope your family remembers you?' },
      { id: 'legacy-anything', text: 'Is there anything else you have always wanted to say?', keepsake: 'letter' },
    ],
  },
]

export const chapterById = (id: string) => CHAPTERS.find((c) => c.id === id)

export const OCCASIONS = ['Hard days', 'Grief', 'Wedding', 'New baby', 'Graduation', 'New job', 'Birthday', 'Holidays', 'Anytime']
