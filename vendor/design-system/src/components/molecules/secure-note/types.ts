import type { LinkContent } from '../../../types/link'

export interface SecureNoteProps {
  /** The reassurance ("Secure checkout"). */
  label: string
  /** An optional way out for a shopper who is stuck ("Need help?"). */
  help?: LinkContent
}
