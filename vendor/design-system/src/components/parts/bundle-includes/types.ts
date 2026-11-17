/** The parts of a bundle as a short checklist, with the saving against buying them apart. */
export interface BundleIncludesProps {
  /** The list's heading ("Includes"). */
  readonly heading: string
  /** One entry per part; the caller splits the catalog's "Includes" line. */
  readonly items: readonly string[]
  /** The saving in words ("$109 instead of $147"); shown as a chip under the list. */
  readonly saving?: string
}
