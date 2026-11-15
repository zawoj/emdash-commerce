import type { LinkContent } from '../../../../types/link'

export interface FaqItem {
  readonly question: string
  /** The answer as paragraphs. */
  readonly answer: readonly string[]
}

/** The card under the heading column ("Didn't find an answer?"): copy and up to two links. */
export interface FaqHelp {
  readonly heading: string
  readonly text?: string
  /** The main action (a button). */
  readonly primary?: LinkContent
  /** The quieter text link. */
  readonly secondary?: LinkContent
}

export interface FaqProps {
  heading: string
  headingId?: string
  /** Small caps label above the heading. */
  eyebrow?: string
  /** A short line under the heading. */
  intro?: string
  items: readonly FaqItem[]
  /** The help card; without it the left column holds the heading and intro only. */
  help?: FaqHelp
  /** Open one answer at a time. */
  isExclusive?: boolean
}
