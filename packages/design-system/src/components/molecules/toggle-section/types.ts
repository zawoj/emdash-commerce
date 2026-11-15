export interface ToggleSectionProps {
  id: string
  /** The checkbox's name. */
  name: string
  /** The checkbox's text ("I want an invoice for a company"). */
  label: string
  /** Names the revealed fieldset; defaults to `label`. */
  legend?: string
  isChecked?: boolean
}
