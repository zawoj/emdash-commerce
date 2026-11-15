/** One glossary term row: the term as a link and its short definition. */
export interface GlossaryListTerm {
  name: string
  href: string
  definition: string
}

/** The terms under one letter of the alphabet. */
export interface GlossaryListGroup {
  /** The letter shown (`A`, `B`, `#`). */
  letter: string
  /** Anchor id of the group, unique on the page. */
  id: string
  terms: readonly GlossaryListTerm[]
}

/** The glossary listing: the search form over the terms grouped by letter, with a jump bar of the letters. */
export interface GlossaryListProps {
  /** Where the search form submits (GET). */
  action: string
  /** Names the section for assistive technology. */
  label: string
  search: {
    readonly id: string
    readonly name: string
    readonly placeholder: string
    readonly ariaLabel: string
    readonly value?: string
  }
  /** Names the letter jump bar. */
  lettersLabel: string
  groups: readonly GlossaryListGroup[]
  /** Shown instead of the list when there is no term. */
  emptyLabel: string
}
