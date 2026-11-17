import { DEV_TOOLS } from './constants'
import { describeElement } from './describe-element'
import { positionOverlay } from './highlight'
import { adminUrlFor, refLabel } from './ref'
import type { ElementInfo } from './types'

const WIDTH = 340
const GAP = 10
const MARGIN = 12
const COPIED_MS = 900

const escapeHtml = (value: string): string => value.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)

export interface ComposerHandlers {
  /** Save the comment; rejects with a readable message when it cannot be saved. */
  onAdd: (comment: string, info: ElementInfo) => Promise<void>
  /** Save the comment and copy a prompt for it. Resolves true when the copy worked; rejects like `onAdd`. */
  onCopy: (comment: string, info: ElementInfo) => Promise<boolean>
  onClose: () => void
}

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error))

const composerElement = (): HTMLElement | null => document.getElementById(DEV_TOOLS.COMPOSER_ID)

export const isComposerOpen = (): boolean => composerElement() !== null

export const closeComposer = (): void => {
  const node = composerElement()
  if (!node) return
  node.remove()
}

const place = (node: HTMLElement, rect: DOMRect): void => {
  const { height } = node.getBoundingClientRect()
  const below = rect.bottom + GAP
  const top = below + height + MARGIN > window.innerHeight ? Math.max(MARGIN, rect.top - height - GAP) : below
  const left = Math.min(Math.max(MARGIN, rect.left), window.innerWidth - WIDTH - MARGIN)
  node.style.top = `${top}px`
  node.style.left = `${left}px`
}

/** Popover next to a clicked element: a comment box with Add and Copy-prompt. */
export const openComposer = (start: Element, handlers: ComposerHandlers): void => {
  closeComposer()
  let target = start
  const node = document.createElement('div')
  node.id = DEV_TOOLS.COMPOSER_ID
  node.setAttribute('role', 'dialog')
  node.setAttribute('aria-label', 'Comment on element')

  const render = (): void => {
    const info = describeElement(target)
    const ref = info.ref
    const label = ref ? refLabel(ref) : `${info.tag}${info.classNames[0] ? `.${info.classNames[0]}` : ''}`
    node.innerHTML =
      `<header><b>${escapeHtml(label)}</b><span class="dt-size">${info.width}×${info.height}</span>` +
      `<button type="button" data-act="parent" title="Select the parent element" ${target.parentElement && target.parentElement !== document.body ? '' : 'disabled'}>↑ Parent</button>` +
      '<button type="button" data-act="cancel" title="Close (Esc)" aria-label="Close">×</button></header>' +
      `<div class="dt-selector">${escapeHtml(info.selector)}</div>` +
      (info.text ? `<div class="dt-text">${escapeHtml(info.text)}</div>` : '') +
      '<textarea rows="3" placeholder="What should change? e.g. “Shorter title”, “Rewrite this in a friendlier tone”, “Swap the image”…"></textarea>' +
      '<div class="dt-error" role="alert" hidden></div>' +
      `<footer>${ref ? `<a href="${escapeHtml(adminUrlFor(ref))}" target="_blank" rel="noopener">Open in admin</a>` : '<span></span>'}` +
      '<button type="button" data-act="add" disabled>Add</button><button type="button" data-act="copy" class="primary" disabled>Copy prompt</button></footer>'
    positionOverlay(target.getBoundingClientRect())
    place(node, target.getBoundingClientRect())
    const area = node.querySelector('textarea')!
    area.addEventListener('input', () => {
      for (const button of node.querySelectorAll<HTMLButtonElement>('[data-act="add"], [data-act="copy"]')) button.disabled = area.value.trim() === ''
    })
    area.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        handlers.onClose()
      } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        node.querySelector<HTMLButtonElement>('[data-act="add"]')?.click()
      }
    })
    area.focus()
  }

  const showError = (message: string): void => {
    const box = node.querySelector<HTMLElement>('.dt-error')
    if (!box) return
    box.textContent = message
    box.hidden = false
    for (const button of node.querySelectorAll<HTMLButtonElement>('[data-act="add"], [data-act="copy"]')) button.disabled = false
  }

  node.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button[data-act]') : null
    if (!button || button.disabled) return
    const comment = node.querySelector('textarea')?.value ?? ''
    const info = describeElement(target)
    switch (button.dataset.act) {
      case 'cancel':
        handlers.onClose()
        break
      case 'parent':
        if (target.parentElement) {
          target = target.parentElement
          render()
        }
        break
      case 'add':
        button.disabled = true
        void handlers.onAdd(comment, info).then(handlers.onClose, (error: unknown) => showError(errorText(error)))
        break
      case 'copy':
        button.disabled = true
        void handlers.onCopy(comment, info).then(
          (isCopied) => {
            button.textContent = isCopied ? 'Copied ✓' : 'Copy failed'
            window.setTimeout(handlers.onClose, COPIED_MS)
          },
          (error: unknown) => showError(errorText(error)),
        )
        break
    }
  })

  document.body.append(node)
  render()
}
