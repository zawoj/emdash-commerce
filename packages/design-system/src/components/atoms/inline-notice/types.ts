import type { NoticeTone } from './variants'

export interface InlineNoticeProps {
  tone?: NoticeTone
  /** A bold first line; the default slot is the message. */
  title?: string
  /** Spoken before the message ("Error", "Success") because the glyph is hidden from screen readers. */
  toneLabel?: string
  id?: string
  /** Overrides the tone's live-region role (`none` for a notice that is part of static content). */
  role?: 'alert' | 'status' | 'none'
}
