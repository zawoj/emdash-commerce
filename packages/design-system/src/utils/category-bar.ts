// Opens the category bar on its current pill: on a phone the row scrolls sideways, and a shopper who picked a
// category far to the right must not land on a row that starts at "All". Only the row scrolls, never the page.
const centreCurrent = (bar: HTMLElement) => {
  const list = bar.querySelector<HTMLElement>('.category-bar__list')
  const current = bar.querySelector<HTMLElement>('[aria-current]')
  if (!list || !current || list.scrollWidth <= list.clientWidth) return
  list.scrollLeft = current.offsetLeft - (list.clientWidth - current.offsetWidth) / 2
}

export const mountCategoryBars = (scope: ParentNode = document) => {
  for (const bar of scope.querySelectorAll<HTMLElement>('[data-category-bar]')) {
    if (bar.dataset.categoryBarMounted) continue
    bar.dataset.categoryBarMounted = 'true'
    centreCurrent(bar)
  }
}

mountCategoryBars()
