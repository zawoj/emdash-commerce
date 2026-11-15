// A text link: the visible label and its target. Labels are always passed in — components hold
// no copy of their own.
export interface LinkContent {
  readonly label: string
  readonly href: string
}
