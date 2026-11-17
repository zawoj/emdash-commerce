import { DEV_TOOLS } from './constants'

const SHOW_MS = 5000
let timer: number | undefined

/** A short message above the pill, e.g. when an agent finishes a comment. */
export const showToast = (message: string): void => {
  let node = document.getElementById(DEV_TOOLS.TOAST_ID)
  if (!node) {
    node = document.createElement('div')
    node.id = DEV_TOOLS.TOAST_ID
    node.setAttribute('role', 'status')
    document.body.append(node)
  }
  node.textContent = message
  node.hidden = false
  window.clearTimeout(timer)
  timer = window.setTimeout(() => {
    node.hidden = true
  }, SHOW_MS)
}
