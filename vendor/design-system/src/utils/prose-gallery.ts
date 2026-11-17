// The gallery of a text: shows one `[data-gallery-photo]` at a time inside each
// `[data-prose-gallery]`, switched by its `[data-gallery-thumb]` buttons. The thumbnail strip is
// hidden in the markup and revealed here, so without script the first photo stays on alone.
const select = (gallery: HTMLElement, index: number): void => {
  const photos = gallery.querySelectorAll<HTMLElement>('[data-gallery-photo]')
  const thumbs = gallery.querySelectorAll<HTMLElement>('[data-gallery-thumb]')
  photos.forEach((photo, position) => {
    photo.hidden = position !== index
  })
  thumbs.forEach((thumb, position) => {
    const isCurrent = position === index
    thumb.classList.toggle('prose-gallery__thumb--current', isCurrent)
    thumb.setAttribute('aria-pressed', String(isCurrent))
  })
}

const init = (gallery: HTMLElement): void => {
  const strip = gallery.querySelector<HTMLElement>('[data-gallery-thumbs]')
  if (!strip) return
  strip.hidden = false
  gallery.querySelectorAll<HTMLElement>('[data-gallery-thumb]').forEach((thumb, index) => {
    thumb.addEventListener('click', () => select(gallery, index))
  })
}

document.querySelectorAll<HTMLElement>('[data-prose-gallery]').forEach(init)

export {}
