import { IGNORED_SELECTOR } from './constants'

const MAX_DEPTH = 5

const escapeIdent = (value: string): string =>
  typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(value) : value.replace(/[^\w-]/g, '\\$&')

/** Short, stable-enough CSS selector for an element: id, or tag.class chain with :nth-of-type. */
export const cssPath = (element: Element): string => {
  const parts: string[] = []
  let node: Element | null = element
  while (node && node.nodeType === 1 && parts.length < MAX_DEPTH) {
    if (node.id) {
      parts.unshift(`#${escapeIdent(node.id)}`)
      break
    }
    const tag = node.tagName.toLowerCase()
    if (tag === 'body' || tag === 'html') {
      parts.unshift(tag)
      break
    }
    const className = [...node.classList].slice(0, 2).map(escapeIdent).join('.')
    const siblings = node.parentElement ? [...node.parentElement.children].filter((c) => c.tagName === node!.tagName) : []
    const nth = siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(node) + 1})` : ''
    parts.unshift(`${tag}${className ? `.${className}` : ''}${nth}`)
    node = node.parentElement
  }
  return parts.join(' > ')
}

export const isIgnored = (element: Element | null): boolean => !!element?.closest(IGNORED_SELECTOR)
