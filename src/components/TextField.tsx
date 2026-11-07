import { useRef, useState, type ReactNode } from 'react'
import { useDictation } from '../lib/dictation'
import { Icon } from './ui'

/**
 * A labeled text box you can type in or talk into (tap the microphone and speak; tap again to stop).
 * Optionally offers "Ask family" so a relative can fill it in by text.
 */
export function TextField({ id, label, value, onChange, multiline, rows = 4, placeholder, type = 'text', inputMode, autoFocus, onAsk, hint }: {
  id: string
  label: ReactNode
  value: string
  onChange: (v: string) => void
  multiline?: boolean
  rows?: number
  placeholder?: string
  type?: string
  inputMode?: 'text' | 'numeric' | 'tel' | 'email'
  autoFocus?: boolean
  /** Shows an "Ask family" button that texts this question to a relative. */
  onAsk?: () => void
  hint?: ReactNode
}) {
  const base = useRef('')
  const [interim, setInterim] = useState('')
  const dict = useDictation((spoken, final) => {
    if (final) {
      base.current = [base.current, spoken].filter(Boolean).join(base.current && !/\s$/.test(base.current) ? ' ' : '')
      setInterim('')
      onChange(base.current)
    } else setInterim(spoken)
  })
  const canTalk = dict.supported && type !== 'tel' && type !== 'email' && inputMode !== 'numeric'
  const shown = dict.listening && interim ? `${value}${value ? ' ' : ''}${interim}` : value

  const toggle = () => {
    if (dict.listening) { dict.stop(); setInterim(''); return }
    base.current = value
    dict.start()
  }

  return (
    <div className={`field text-field ${dict.listening ? 'listening' : ''}`}>
      <div className="field-head">
        <label htmlFor={id}>{label}</label>
        {onAsk && <button type="button" className="ask-chip" onClick={onAsk}><Icon name="share" size={14} /> Ask family</button>}
      </div>
      <div className="field-box">
        {multiline
          ? <textarea id={id} rows={rows} value={shown} placeholder={placeholder} autoFocus={autoFocus} onChange={(e) => onChange(e.target.value)} />
          : <input id={id} type={type} inputMode={inputMode} value={shown} placeholder={placeholder} autoFocus={autoFocus} onChange={(e) => onChange(e.target.value)} />}
        {canTalk && (
          <button type="button" className={`mic-btn ${dict.listening ? 'on' : ''}`} onClick={toggle} aria-label={dict.listening ? 'Stop talking' : 'Talk instead of typing'} aria-pressed={dict.listening}>
            <Icon name={dict.listening ? 'stop' : 'mic'} size={18} />
          </button>
        )}
      </div>
      {dict.listening && <p className="listening-note"><span className="rec-dot" /> Listening… tap ■ when you’re done</p>}
      {hint}
    </div>
  )
}
