import { iconNames, type IconName } from '../../atoms/icon/names'
import type { AuthStateTone } from './types'

/** The glyph of each outcome. */
export const authStateIcons: Readonly<Record<AuthStateTone, IconName>> = {
  success: iconNames.circleCheck,
  error: iconNames.triangleAlert,
  pending: iconNames.clock,
}
