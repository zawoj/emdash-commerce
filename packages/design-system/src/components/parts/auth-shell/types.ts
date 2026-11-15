import type { IconName } from '../../atoms/icon/names'
import type { ImageAsset } from '../../../types/asset'

export interface AuthBenefit {
  icon: IconName
  text: string
}

export interface AuthBrand {
  /** Small expanded-caps line over the headline ("Member"). */
  eyebrow: string
  /** The brand line, set as condensed display caps. */
  headline: string
  /** Heading of the benefit list, read by screen readers ("Why an account"). */
  benefitsLabel: string
  benefits: readonly AuthBenefit[]
  /** A campaign photo behind the panel; the black board with volt blocks when absent. */
  image?: ImageAsset
}

export interface AuthShellProps {
  heading: string
  lead?: string
  brand: AuthBrand
}

export const authStateTones = {
  success: 'success',
  error: 'error',
  pending: 'pending',
} as const
export type AuthStateTone = (typeof authStateTones)[keyof typeof authStateTones]
