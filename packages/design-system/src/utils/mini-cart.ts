// Mini-cart drawer: `[data-mini-cart-open="<dialog id>"]` (the header's cart link) opens the modal
// <dialog>, `[data-mini-cart-close]` and a click on the backdrop close it, and a bubbling
// `cart:open` event (e.g. after add-to-cart) opens the first drawer. Without the script the link
// is a plain link to the cart page. Focus returns to the opener on close (native <dialog>).
const openDrawer = (dialog: HTMLDialogElement | null) => {
  if (dialog && !dialog.open) dialog.showModal()
}

const mountDrawer = (dialog: HTMLDialogElement) => {
  if (dialog.dataset.miniCartMounted) return
  dialog.dataset.miniCartMounted = 'true'
  for (const button of dialog.querySelectorAll('[data-mini-cart-close]')) button.addEventListener('click', () => dialog.close())
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close()
  })
}

export const mountMiniCart = (scope: ParentNode = document) => {
  for (const dialog of scope.querySelectorAll<HTMLDialogElement>('dialog[data-mini-cart]')) mountDrawer(dialog)
}

const flag = '__miniCartMounted'
const globalScope = window as unknown as Record<string, boolean>
if (!globalScope[flag]) {
  globalScope[flag] = true
  document.addEventListener('click', (event) => {
    const opener = (event.target as Element).closest<HTMLElement>('[data-mini-cart-open]')
    if (!opener) return
    const dialog = document.getElementById(opener.dataset.miniCartOpen ?? '') as HTMLDialogElement | null
    if (!dialog) return
    event.preventDefault()
    openDrawer(dialog)
  })
  document.addEventListener('cart:open', () => openDrawer(document.querySelector<HTMLDialogElement>('dialog[data-mini-cart]')))
}

mountMiniCart()
