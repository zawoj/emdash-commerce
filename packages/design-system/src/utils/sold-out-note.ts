// The words of a sold-out option chip. The note exists only while the option really is sold out, so the text of an
// in-stock chip is its label alone and the accessible name reads "XL" versus "XL, sold out".

/** The note's text: a comma joins it to the chip's own label in the accessible name. */
export const soldOutNoteText = (soldOutLabel: string): string => `, ${soldOutLabel.toLocaleLowerCase()}`

/** Adds or removes the note of a chip (`label.option-chip` carrying `data-sold-out-label`). */
export const setSoldOutNote = (chip: HTMLElement, isSoldOut: boolean): void => {
  const existing = chip.querySelector<HTMLElement>('[data-sold-out-note]')
  if (!isSoldOut) {
    existing?.remove()
    return
  }
  const soldOutLabel = chip.dataset.soldOutLabel
  if (existing || !soldOutLabel) return
  const note = chip.ownerDocument.createElement('span')
  note.className = 'option-chip__note'
  note.dataset.soldOutNote = ''
  note.textContent = soldOutNoteText(soldOutLabel)
  chip.querySelector('.option-chip__box')?.append(note)
}
