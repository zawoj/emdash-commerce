import type { Category, CommentState, ErrorKind, Severity } from './constants'

export interface AuditIssue {
  id: string
  category: Category
  severity: Severity
  message: string
  /** CSS selector of the offending element, when there is one. */
  selector?: string
  /** Documentation link, when the rule has one. */
  helpUrl?: string
}

export interface CapturedError {
  id: number
  kind: ErrorKind
  message: string
  /** Where it came from: file:line:col, request URL, or element selector. */
  source?: string
  /** Selector of the element behind a failed resource, so the panel can point at it. */
  selector?: string
  count: number
  at: number
}

/** The JSON EmDash writes into `data-emdash-ref` on every editable field. */
export interface EmDashRef {
  collection: string
  id: string
  field?: string
  status?: string
  hasDraft?: boolean
}

/** What the Notes tool knows about a clicked element — enough for someone else to find it again. */
export interface ElementInfo {
  tag: string
  id?: string
  classNames: string[]
  selector: string
  /** Visible text, whitespace collapsed and cut to a snippet. */
  text: string
  href?: string
  src?: string
  alt?: string
  width: number
  height: number
  ref: EmDashRef | null
  /** Astro island component name, when the element lives inside one. */
  island: string | null
  /** `file:line` Astro wrote on the element (needs the Astro dev toolbar enabled). */
  source: string | null
}

/** A comment on a page element — one row of the `feedback` collection. */
export interface Annotation {
  /** Id of the feedback entry; the "Comment ID" an agent uses to mark it done. */
  id: string
  comment: string
  element: ElementInfo
  state: CommentState
  /** What the agent changed (done) or why it did not (wontfix). */
  resolution: string
  pagePath: string
  pageUrl: string
  createdAt: number
}

export interface SchemaField {
  slug: string
  type: string
  label: string
  isRequired: boolean
}

export interface SchemaCollection {
  slug: string
  label: string
  fields: SchemaField[]
}

/** The live content model of the site: every collection with its fields. */
export type SiteSchema = readonly SchemaCollection[]
