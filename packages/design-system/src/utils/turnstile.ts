// Cloudflare Turnstile for the forms that carry a `TurnstileSlot`. Loaded once per page, lazily: Cloudflare's
// script is requested only when a slot nears the screen or a field of its form is touched (the newsletter in the
// footer sits on every page, and most visits never reach it). Every slot becomes one Managed widget in its
// `interaction-only` appearance. Cloudflare keeps the form's `cf-turnstile-response` field current, so a plain
// post carries the token; a script-submitted form reads the same field. A token lives five minutes and works
// once: an expired one is renewed by the widget, a spent one by a `turnstile:reset` event the form's own script
// dispatches after it sends the form in place.
//
// A submit that comes before the token is ready is held (with a short status line) and sent as soon as the token
// arrives. When the widget cannot load or run, the submit goes through without a token: the server refuses it and
// the form shows its own "verification failed" message, the same path as every other refusal.

interface WidgetOptions {
  sitekey: string
  action: string
  language: string
  appearance: 'interaction-only'
  size: 'flexible'
  theme: 'light'
  'refresh-expired': 'auto'
  callback: (token: string) => void
  'expired-callback': () => void
  'timeout-callback': () => void
  'error-callback': () => boolean
  'before-interactive-callback': () => void
}

interface TurnstileApi {
  render: (container: HTMLElement, options: WidgetOptions) => string
  reset: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
const RESET_EVENT = 'turnstile:reset'
const NEAR_SCREEN = '400px'

interface Slot {
  root: HTMLElement
  form: HTMLFormElement | null
  widget: HTMLElement
  status: HTMLElement | null
  widgetId?: string
  token: string
  isStarted: boolean
  isFailed: boolean
  /** A submit is waiting for the token. */
  held?: { submitter: HTMLElement | null }
}

const slots = new Map<HTMLElement, Slot>()
let api: Promise<TurnstileApi | null> | undefined

/** Cloudflare's script, added once; `null` when it cannot be loaded (blocked, offline). */
const loadApi = (): Promise<TurnstileApi | null> => {
  api ??= new Promise((resolve) => {
    if (window.turnstile) return resolve(window.turnstile)
    const script = document.createElement('script')
    script.src = SCRIPT_URL
    script.async = true
    script.onload = () => resolve(window.turnstile ?? null)
    script.onerror = () => resolve(null)
    document.head.append(script)
  })
  return api
}

const say = (slot: Slot, text: string | undefined) => {
  if (!slot.status) return
  slot.status.textContent = text ?? ''
  slot.status.hidden = !text
}

const release = (slot: Slot) => {
  const held = slot.held
  slot.held = undefined
  if (!held || !slot.form?.isConnected) return
  try {
    slot.form.requestSubmit(held.submitter instanceof HTMLButtonElement || held.submitter instanceof HTMLInputElement ? held.submitter : undefined)
  } catch {
    slot.form.requestSubmit()
  }
}

const fail = (slot: Slot) => {
  slot.isFailed = true
  slot.token = ''
  say(slot, slot.root.dataset.errorText)
  release(slot)
}

const start = async (slot: Slot) => {
  if (slot.isStarted) return
  slot.isStarted = true
  const turnstile = await loadApi()
  if (!turnstile) return fail(slot)
  const { sitekey, action, language } = slot.root.dataset
  if (!sitekey || !action) return fail(slot)
  slot.widgetId = turnstile.render(slot.widget, {
    sitekey,
    action,
    language: language ?? 'en',
    appearance: 'interaction-only',
    size: 'flexible',
    theme: 'light',
    'refresh-expired': 'auto',
    callback: (token) => {
      slot.token = token
      slot.isFailed = false
      say(slot, undefined)
      release(slot)
    },
    'expired-callback': () => {
      slot.token = ''
    },
    'timeout-callback': () => {
      slot.token = ''
    },
    'error-callback': () => {
      fail(slot)
      return true
    },
    'before-interactive-callback': () => slot.root.scrollIntoView({ block: 'center', behavior: 'smooth' }),
  })
}

const resetSlot = (slot: Slot) => {
  slot.token = ''
  slot.isFailed = false
  slot.held = undefined
  say(slot, undefined)
  if (slot.widgetId && window.turnstile) window.turnstile.reset(slot.widgetId)
}

const slotOfForm = (form: HTMLFormElement): Slot | undefined => {
  const root = form.querySelector<HTMLElement>('[data-turnstile]')
  return root ? slots.get(root) : undefined
}

/** Holds a submit that has no token yet; capture phase, so it runs before the form's own script. */
const onSubmit = (event: SubmitEvent) => {
  const form = event.target
  if (!(form instanceof HTMLFormElement)) return
  const slot = slotOfForm(form)
  if (!slot || slot.token || slot.isFailed) return
  event.preventDefault()
  event.stopImmediatePropagation()
  slot.held = { submitter: event.submitter }
  say(slot, slot.root.dataset.pendingText)
  void start(slot)
}

const onReset = (event: Event) => {
  const form = event.target
  if (form instanceof HTMLFormElement) {
    const slot = slotOfForm(form)
    if (slot) resetSlot(slot)
  }
}

const mount = (root: HTMLElement) => {
  if (slots.has(root) || root.dataset.turnstilePreview !== undefined) return
  const widget = root.querySelector<HTMLElement>('[data-turnstile-widget]')
  if (!widget) return
  const slot: Slot = { root, form: root.closest('form'), widget, status: root.querySelector('[data-turnstile-status]'), token: '', isStarted: false, isFailed: false }
  slots.set(root, slot)
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      observer.disconnect()
      void start(slot)
    },
    { rootMargin: NEAR_SCREEN },
  )
  observer.observe(root)
  slot.form?.addEventListener('focusin', () => void start(slot), { once: true })
  slot.form?.addEventListener('pointerdown', () => void start(slot), { once: true })
}

const mountAll = () => {
  for (const root of document.querySelectorAll<HTMLElement>('[data-turnstile]')) mount(root)
}

if (!document.documentElement.dataset.turnstileBound) {
  document.documentElement.dataset.turnstileBound = 'true'
  document.addEventListener('submit', onSubmit, true)
  document.addEventListener(RESET_EVENT, onReset)
  // A page restored from the back/forward cache carries a spent token.
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) for (const slot of slots.values()) resetSlot(slot)
  })
}

mountAll()

export { RESET_EVENT as turnstileResetEvent }
