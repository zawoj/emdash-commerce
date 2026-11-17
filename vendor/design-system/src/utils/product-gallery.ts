// Product gallery: the slides are a scroll-snap track and the thumbnails are in-page links, so it
// works without a script. The script marks the thumbnail of the slide in view (`aria-current`),
// scrolls the track smoothly on a thumbnail click (no hash jump), and filters by group — a
// `product-gallery:filter` event with `detail: { group }` shows only the slides and thumbnails
// whose `data-gallery-group` matches (the photos of the chosen colour); a colour without tagged photos
// falls back to the untagged ones, then to all, so the gallery is never empty; an empty group shows all.
import { visiblePhotoIndexes } from './product-gallery-core'

export interface GalleryFilterDetail {
  readonly group: string | null
}

const mountGallery = (root: HTMLElement) => {
  const track = root.querySelector<HTMLElement>('[data-gallery-track]')
  if (!track || root.dataset.galleryMounted) return
  root.dataset.galleryMounted = 'true'
  const slides = [...track.querySelectorAll<HTMLElement>('[data-gallery-slide]')]
  const thumbs = [...root.querySelectorAll<HTMLAnchorElement>('[data-gallery-thumb]')]
  const thumbItems = thumbs.map((thumb) => thumb.closest<HTMLElement>('[data-gallery-thumb-item]') ?? thumb)

  const markCurrent = (slide: HTMLElement) => {
    for (const thumb of thumbs) {
      const isCurrent = thumb.getAttribute('href') === `#${slide.id}`
      if (isCurrent) thumb.setAttribute('aria-current', 'true')
      else thumb.removeAttribute('aria-current')
    }
  }

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
      if (visible) markCurrent(visible.target as HTMLElement)
    },
    { root: track, threshold: [0.5, 0.75, 1] },
  )
  for (const slide of slides) observer.observe(slide)

  root.addEventListener('click', (event) => {
    const thumb = (event.target as Element).closest<HTMLAnchorElement>('[data-gallery-thumb]')
    if (!thumb) return
    const slide = slides.find((item) => `#${item.id}` === thumb.getAttribute('href'))
    if (!slide) return
    event.preventDefault()
    track.scrollTo({ left: slide.offsetLeft - track.offsetLeft, behavior: 'smooth' })
    markCurrent(slide)
  })

  root.addEventListener('product-gallery:filter', (event) => {
    const group = (event as CustomEvent<GalleryFilterDetail>).detail?.group || null
    const visible = new Set(visiblePhotoIndexes(slides.map((slide) => slide.dataset.galleryGroup), group))
    slides.forEach((slide, index) => {
      slide.hidden = !visible.has(index)
    })
    thumbs.forEach((_, index) => {
      const item = thumbItems[index]
      if (item) item.hidden = !visible.has(index)
    })
    track.scrollTo({ left: 0 })
    const first = slides.find((slide) => !slide.hidden)
    if (first) markCurrent(first)
  })
}

export const mountProductGalleries = (scope: ParentNode = document) => {
  for (const root of scope.querySelectorAll<HTMLElement>('[data-product-gallery]')) mountGallery(root)
}

mountProductGalleries()
