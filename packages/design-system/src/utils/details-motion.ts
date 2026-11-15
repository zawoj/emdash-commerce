// Animated <details>: opens and closes with the Web Animations API instead of snapping. Opt in with
// `data-details-motion` on the <details>. The height animates between the collapsed and the natural
// height, the content fades and rises 8px, and `[data-closing]` is set for the closing run so CSS can
// turn the chevron back at once (`[open]:not([data-closing])`). A second click mid-animation reverses
// from the current height. `name`-grouped accordions close their siblings with the same animation.
// Under `prefers-reduced-motion: reduce`, and without this script, the native instant toggle runs.
import { closedHeight, contentKeyframes, heightKeyframes, motionActions, nextAction, parseDurationMs, scaledDuration } from './details-motion-core'

const selector = 'details[data-details-motion]'
const running = new WeakMap<HTMLDetailsElement, Animation[]>()

const isReduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

const isBusy = (details: HTMLDetailsElement) => running.has(details)

const contentOf = (details: HTMLDetailsElement) => [...details.children].filter((child): child is HTMLElement => child instanceof HTMLElement && child.tagName !== 'SUMMARY')

const collapsedHeight = (details: HTMLDetailsElement) => {
  const summary = details.querySelector<HTMLElement>(':scope > summary')
  const style = getComputedStyle(details)
  const chrome = ['paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth'].reduce((sum, key) => sum + (parseFloat(style[key as 'paddingTop']) || 0), 0)
  return closedHeight(summary?.getBoundingClientRect().height ?? 0, chrome)
}

const settle = (details: HTMLDetailsElement) => {
  running.delete(details)
  details.style.removeProperty('overflow')
  details.removeAttribute('data-closing')
}

const run = (details: HTMLDetailsElement, isOpening: boolean) => {
  const style = getComputedStyle(details)
  const base = parseDurationMs(style.getPropertyValue('--duration-collapse'))
  const easing = style.getPropertyValue('--ease-out').trim() || 'ease-out'
  const startHeight = details.getBoundingClientRect().height
  running.get(details)?.forEach((animation) => animation.cancel())

  // The group name is parked in a data attribute while `name` is detached, so an interrupted run restores it.
  const group = details.getAttribute('name') ?? details.dataset.motionGroup ?? null
  if (group) details.dataset.motionGroup = group
  if (isOpening && group) {
    // The browser would snap the group's open sibling shut the moment this one opens; detach the name
    // for the run and close the sibling with the animation instead.
    details.removeAttribute('name')
    for (const other of document.querySelectorAll<HTMLDetailsElement>(`${selector}[name="${CSS.escape(group)}"], ${selector}[data-motion-group="${CSS.escape(group)}"]`)) {
      if (other !== details && other.open) run(other, false)
    }
  }

  if (isOpening) {
    details.open = true
    details.removeAttribute('data-closing')
  }
  if (!isOpening) details.setAttribute('data-closing', '')
  const closed = collapsedHeight(details)
  const endHeight = isOpening ? details.getBoundingClientRect().height : closed
  const duration = scaledDuration(base, startHeight, endHeight, Math.max(startHeight, endHeight) - closed)
  details.style.overflow = 'hidden'

  const options: KeyframeAnimationOptions = { duration, easing, fill: 'both' }
  const animations = [details.animate(heightKeyframes(startHeight, endHeight), options)]
  for (const child of contentOf(details)) animations.push(child.animate(contentKeyframes(isOpening), options))
  running.set(details, animations)

  const finish = () => {
    if (running.get(details) !== animations) return
    settle(details)
    if (!isOpening) details.open = false
    if (group) details.setAttribute('name', group)
    animations.forEach((animation) => animation.cancel())
  }
  animations[0].addEventListener('finish', finish)
}

/** Toggles a motion-enabled <details> programmatically with the same animation as a click. */
export const toggleDetails = (details: HTMLDetailsElement, shouldOpen: boolean) => {
  if (isReduced() || !details.matches(selector)) {
    details.open = shouldOpen
    return
  }
  const isClosing = details.hasAttribute('data-closing')
  const isShown = details.open && !isClosing
  if (shouldOpen === isShown && !isBusy(details)) return
  run(details, shouldOpen)
}

const onClick = (event: MouseEvent) => {
  const target = event.target
  if (!(target instanceof Element)) return
  const summary = target.closest('summary')
  const details = summary?.parentElement
  if (!summary || !(details instanceof HTMLDetailsElement) || !details.matches(selector) || isReduced()) return
  if (target !== summary && target.closest('a, button, input, select, textarea')) return
  event.preventDefault()
  const action = nextAction(details.open, details.hasAttribute('data-closing'))
  run(details, action === motionActions.open)
}

export const mountDetailsMotion = () => {
  const flag = '__detailsMotion'
  const scope = window as unknown as Record<string, boolean>
  if (scope[flag]) return
  scope[flag] = true
  document.addEventListener('click', onClick)
}

mountDetailsMotion()
