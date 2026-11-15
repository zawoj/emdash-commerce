// The "shop the look" dialog: opens one product's variant picker (a row's button) or the kit stepper (the look's
// call to action), keeps the picker's chips honest (`syncVariantChips`), and adds the choice to the cart through the
// adapter the app registers. The step logic is the pure state machine in `look-kit`; this file is the DOM around it.
import {
  addAll,
  back,
  canAdvance,
  canAddAll,
  change,
  chosenLines,
  createKit,
  currentProductId,
  formatMinor,
  KIT_PHASES,
  next,
  pickVariant,
  progressOf,
  skip,
  sumMinor,
  variantPickId,
  type AddAnswer,
  type KitLine,
  type KitState,
} from './look-kit'
import type { LookDialogCopy, LookDialogMoney } from '../components/parts/look-dialog/types'
import type { ChipSync } from './variant-choice'
import { syncVariantChips } from './variant-choice'
import { revealMissingVariant } from './variant-picker'

export interface LookAddRequest {
  readonly productId: number
  readonly variantId: number
  readonly quantity: number
}

export interface LookAddAnswer extends AddAnswer {
  /** The cart's item count after the add. */
  readonly count?: number
}

/** What the dialog needs of the app: the cart call, and what to do once something is in the cart. */
export interface LookCartAdapter {
  add: (request: LookAddRequest) => Promise<LookAddAnswer>
  /** Items went into the cart: update the count; `shouldOpenCart` asks for the mini-cart (everything was added). */
  onAdded: (info: { count: number | undefined; shouldOpenCart: boolean }) => void
}

let cartAdapter: LookCartAdapter | null = null

/** Registers the app's cart; the dialogs read it when something is added, so it may be set after they mount. */
export const setLookCartAdapter = (adapter: LookCartAdapter): void => {
  cartAdapter = adapter
}

interface ProductConfig {
  id: number
  title: string
  axes: string[]
  imageAxis: string | null
  axisLabels: Record<string, string>
  variants: { id: number; options: Record<string, string>; isPurchasable: boolean; price: number }[]
  prices: { label: string; minor: number }[]
  defaultPrice: { label: string; minor: number }
}

interface DialogConfig {
  copy: LookDialogCopy
  money: LookDialogMoney
  products: ProductConfig[]
}

const MODES = { single: 'single', kit: 'kit' } as const
type Mode = (typeof MODES)[keyof typeof MODES]

const fill = (text: string, values: Record<string, string | number>): string => Object.entries(values).reduce((result, [key, value]) => result.replace(`{${key}}`, String(value)), text)

const mount = (dialog: HTMLDialogElement) => {
  if (dialog.dataset.lookMounted) return
  dialog.dataset.lookMounted = 'true'
  const configNode = dialog.querySelector<HTMLScriptElement>('script[data-look-config]')
  if (!configNode?.textContent) return
  const config = JSON.parse(configNode.textContent) as DialogConfig
  const { copy, money } = config
  const productById = new Map(config.products.map((product) => [product.id, product]))
  const ids = config.products.map((product) => product.id)

  const $ = <T extends HTMLElement>(selector: string): T => dialog.querySelector<T>(selector) as T
  const panels = new Map<number, HTMLElement>(ids.map((id) => [id, $(`[data-look-panel="${id}"]`)]))
  const heading = $('[data-look-heading]')
  const stepLabel = $('[data-look-step]')
  const progress = $('[data-look-progress]')
  const summary = $('[data-look-summary]')
  const rows = $('[data-look-rows]')
  const nothing = $('[data-look-nothing]')
  const totalLine = $('[data-look-total]')
  const totalValue = $<HTMLDataElement>('[data-look-total-value]')
  const result = $('[data-look-result]')
  const rowTemplate = $<HTMLTemplateElement>('[data-look-row-template]')
  const scroller = $('[data-look-scroll]')
  const action = (name: string) => $<HTMLButtonElement>(`[data-look-action="${name}"]`)
  const buttons = { back: action('back'), skip: action('skip'), next: action('next'), add: action('add'), buySet: action('buySet'), addAll: action('addAll') }

  let mode: Mode = MODES.kit
  let kit: KitState = createKit(ids)
  let opener: HTMLElement | null = null
  let isBusy = false
  let isRestoringFocus = true
  const synced = new Map<number, ChipSync<ProductConfig['variants'][number]>>()
  const added = new Set<number>()
  const failures = new Map<number, string>()
  let lastCount: number | undefined

  const variantOf = (id: number) => synced.get(id)?.variant
  const priceMinorOf = (line: KitLine): number => {
    const product = productById.get(line.productId)
    const variant = product?.variants.find((candidate) => candidate.id === line.variantId)
    return variant && product ? (product.prices[variant.price]?.minor ?? 0) : 0
  }

  const setLabel = (button: HTMLElement, text: string) => {
    const label = button.querySelector<HTMLElement>('.button__label') ?? button
    label.textContent = text
  }

  /** What is missing, in words: "Choose: Size". */
  const showMissing = (id: number) => {
    const product = productById.get(id)
    const panel = panels.get(id)
    if (!product || !panel) return
    const labels = (synced.get(id)?.missing ?? []).map((axis) => product.axisLabels[axis] ?? axis)
    const text = fill(copy.missing, { axis: labels.join(', ') })
    $<HTMLElement>(`[data-look-panel="${id}"] [data-look-missing]`).textContent = text
    const form = panel.querySelector<HTMLElement>('[data-look-form]')
    if (form) revealMissingVariant(form)
  }

  const setMessage = (id: number, text: string) => {
    const slot = panels.get(id)?.querySelector<HTMLElement>('[data-look-missing]')
    if (slot) slot.textContent = text
  }

  /** Re-judges the chips of one product and shows its price, stock line and photo for the choice. */
  const refresh = (id: number, isInitial = false) => {
    const product = productById.get(id)
    const panel = panels.get(id)
    if (!product || !panel) return
    const form = panel.querySelector<HTMLElement>('[data-look-form]') ?? panel
    const sync = syncVariantChips(form, { axes: product.axes, imageAxis: product.imageAxis, variants: product.variants }, isInitial)
    synced.set(id, sync)
    const variant = sync.variant
    const priceKey = variant ? String(variant.price) : 'default'
    for (const node of panel.querySelectorAll<HTMLElement>('[data-look-price]')) node.hidden = node.dataset.lookPrice !== priceKey
    for (const node of panel.querySelectorAll<HTMLElement>('[data-look-stock]')) node.hidden = Number(node.dataset.lookStock) !== variant?.id
    const colour = product.imageAxis ? sync.chosen[product.imageAxis] : undefined
    const photos = [...panel.querySelectorAll<HTMLElement>('[data-look-photo]')]
    const own = colour === undefined ? undefined : photos.find((photo) => photo.dataset.lookPhoto === colour)
    for (const photo of photos) photo.hidden = photo !== (own ?? photos.find((candidate) => candidate.dataset.lookPhoto === ''))
    panel.querySelector<HTMLElement>('[data-look-hint]')?.toggleAttribute('hidden', !form.querySelector('input[type="radio"]:disabled'))
    setMessage(id, '')
    const stepId = currentProductId(kit)
    const shouldRecordPick =
      mode === MODES.single || id === stepId || (kit.isEditing && kit.productIds[kit.index] === id)
    if (shouldRecordPick) {
      kit = pickVariant(kit, id, variantPickId(product.axes, product.variants, variant))
    }
  }

  const refreshStep = () => {
    const id = currentId()
    if (id !== undefined) refresh(id, true)
  }

  const currentId = (): number | undefined => currentProductId(kit)

  const fillRow = (productIndex: number, id: number): HTMLElement => {
    const product = productById.get(id) as ProductConfig
    const row = (rowTemplate.content.cloneNode(true) as DocumentFragment).firstElementChild as HTMLElement
    const slot = (name: string) => row.querySelector<HTMLElement>(`[data-slot="${name}"]`) as HTMLElement
    const pick = kit.picks[id]
    const isChosen = pick?.status === 'chosen'
    const isSkipped = pick?.status === 'skipped'
    row.dataset.state = isChosen ? 'chosen' : isSkipped ? 'skipped' : 'pending'
    slot('title').textContent = product.title
    const photo = panels.get(id)?.querySelector<HTMLImageElement>('[data-look-photo]:not([hidden])')
    const thumb = slot('thumb') as HTMLImageElement
    if (photo?.getAttribute('src')) thumb.src = photo.getAttribute('src') as string
    if (photo?.srcset) thumb.srcset = photo.srcset
    const labels = [...(panels.get(id)?.querySelectorAll<HTMLElement>('[data-variant-value]') ?? [])].map((node) => node.textContent?.trim()).filter(Boolean)
    slot('variant').textContent = isChosen ? labels.join(' · ') : isSkipped ? copy.skipped : copy.notChosen
    const minor = pick?.status === 'chosen' ? priceMinorOf({ productId: id, variantId: pick.variantId }) : 0
    slot('price').textContent = minor > 0 ? formatMinor(minor, money) : ''
    const status = slot('status')
    const failure = failures.get(id)
    if (added.has(id)) {
      status.hidden = false
      status.textContent = copy.rowAdded
    } else if (failure) {
      status.hidden = false
      status.dataset.tone = 'error'
      status.textContent = failure
    }
    const changeButton = slot('change')
    changeButton.setAttribute('aria-label', `${copy.change}: ${product.title}`)
    changeButton.addEventListener('click', () => {
      kit = change(kit, productIndex)
      refreshStep()
      render('title')
    })
    if (added.has(id)) changeButton.hidden = true
    return row
  }

  const renderSummary = () => {
    rows.replaceChildren(...ids.map((id, index) => fillRow(index, id)))
    const lines = chosenLines(kit)
    nothing.hidden = lines.length > 0
    totalLine.hidden = lines.length === 0
    const minor = sumMinor(lines, priceMinorOf)
    totalValue.value = String(minor / 100)
    totalValue.textContent = formatMinor(minor, money)
    setLabel(buttons.addAll, added.size > 0 ? copy.addRemaining : copy.addAll)
    buttons.addAll.disabled = !canAddAll(kit) || isBusy
  }

  /** The state of the action buttons: inactive (but pressable, so a press can say what is missing) until the choice is complete. */
  const renderButtons = () => {
    const id = currentId()
    buttons.next.setAttribute('aria-disabled', String(!canAdvance(kit)))
    if (mode === MODES.kit || id === undefined) return
    const variant = variantOf(id)
    buttons.add.setAttribute('aria-disabled', String(!variant?.isPurchasable))
    buttons.add.disabled = isBusy
    setLabel(buttons.add, variant && !variant.isPurchasable ? copy.soldOut : copy.addToCart)
  }

  const render = (focusTarget: 'title' | null = null) => {
    const isKit = mode === MODES.kit
    const isSummary = kit.phase === KIT_PHASES.summary
    const id = currentId()
    dialog.dataset.mode = mode
    dialog.dataset.phase = kit.phase
    for (const [panelId, panel] of panels) panel.hidden = isSummary || panelId !== id
    summary.hidden = !isSummary
    heading.textContent = isKit ? copy.kitHeading : copy.chooseHeading
    const state = progressOf(kit)
    stepLabel.hidden = !isKit
    progress.hidden = !isKit
    progress.style.setProperty('--look-ratio', String(state.ratio))
    stepLabel.textContent = isSummary ? copy.summaryLabel : fill(copy.stepLabel, { current: state.current, total: state.total })
    buttons.back.hidden = !(isKit && (isSummary || kit.isEditing || kit.index > 0))
    buttons.skip.hidden = !(isKit && !isSummary)
    buttons.next.hidden = !(isKit && !isSummary)
    buttons.add.hidden = isKit
    buttons.buySet.hidden = !(isKit && isSummary)
    buttons.addAll.hidden = !(isKit && isSummary)
    buttons.buySet.disabled = !canAddAll(kit) || isBusy
    renderButtons()
    if (isSummary) renderSummary()
    result.hidden = result.textContent === ''
    scroller.scrollTop = 0
    if (focusTarget === 'title') {
      const target = isSummary ? summary.querySelector<HTMLElement>('h3') : (id === undefined ? null : panels.get(id)?.querySelector<HTMLElement>('[data-look-title]') ?? null)
      target?.focus({ preventScroll: true })
    }
  }

  const syncAll = (isInitial: boolean) => {
    for (const id of ids) refresh(id, isInitial)
  }

  const reset = (nextMode: Mode, productId: number | null) => {
    mode = nextMode
    added.clear()
    failures.clear()
    result.textContent = ''
    kit = createKit(nextMode === MODES.single && productId !== null ? [productId] : ids)
    syncAll(false)
  }

  const open = (nextMode: Mode, productId: number | null, trigger: HTMLElement) => {
    if (dialog.open) return
    opener = trigger
    isRestoringFocus = true
    reset(nextMode, productId)
    render()
    dialog.showModal()
    const id = currentId()
    if (id !== undefined) panels.get(id)?.querySelector<HTMLElement>('[data-look-title]')?.focus({ preventScroll: true })
  }

  const close = (shouldRestoreFocus = true) => {
    isRestoringFocus = shouldRestoreFocus
    if (dialog.open) dialog.close()
  }

  const onAdded = (shouldOpenCart: boolean) => cartAdapter?.onAdded({ count: lastCount, shouldOpenCart })

  const requestAdd = async (line: KitLine): Promise<AddAnswer> => {
    if (!cartAdapter) return { ok: false }
    const answer = await cartAdapter.add({ ...line, quantity: 1 })
    if (answer.ok && answer.count !== undefined) lastCount = answer.count
    return answer
  }

  const setBusy = (button: HTMLElement, isNowBusy: boolean, busyLabel: string, idleLabel: string) => {
    isBusy = isNowBusy
    button.toggleAttribute('aria-busy', isNowBusy)
    ;(button as HTMLButtonElement).disabled = isNowBusy
    setLabel(button, isNowBusy ? busyLabel : idleLabel)
  }

  const onAddOne = async () => {
    const id = currentId()
    if (id === undefined || isBusy) return
    const variant = variantOf(id)
    if (!variant) return showMissing(id)
    if (!variant.isPurchasable) return
    setBusy(buttons.add, true, copy.adding, copy.addToCart)
    const answer = await requestAdd({ productId: id, variantId: variant.id })
    setBusy(buttons.add, false, copy.adding, copy.addToCart)
    if (!answer.ok) return setMessage(id, answer.message ?? copy.addFailed)
    close(false)
    onAdded(true)
  }

  const onAddAll = async () => {
    if (isBusy || !canAddAll(kit)) return
    const lines = chosenLines(kit).filter((line) => !added.has(line.productId))
    result.textContent = ''
    failures.clear()
    setBusy(buttons.addAll, true, copy.adding, added.size > 0 ? copy.addRemaining : copy.addAll)
    const outcome = await addAll(lines, requestAdd)
    isBusy = false
    for (const line of outcome.added) added.add(line.productId)
    if (outcome.failed.length === 0) {
      close(false)
      return onAdded(true)
    }
    for (const failure of outcome.failed) failures.set(failure.line.productId, failure.message ?? copy.addFailed)
    if (outcome.added.length > 0) onAdded(false)
    const titles = outcome.failed.map((failure) => productById.get(failure.line.productId)?.title ?? '').join(', ')
    result.textContent = fill(copy.partial, { added: added.size, total: chosenLines(kit).length, titles })
    buttons.addAll.removeAttribute('aria-busy')
    render()
  }

  const onNext = () => {
    const id = currentId()
    if (id === undefined) return
    if (!canAdvance(kit)) return showMissing(id)
    kit = next(kit)
    refreshStep()
    render('title')
  }

  buttons.next.addEventListener('click', onNext)
  buttons.skip.addEventListener('click', () => {
    kit = skip(kit)
    refreshStep()
    render('title')
  })
  buttons.back.addEventListener('click', () => {
    kit = back(kit)
    refreshStep()
    render('title')
  })
  buttons.add.addEventListener('click', () => void onAddOne())
  const setKitCheckoutFlag = () => {
    if (typeof window !== 'undefined') (window as Window & { __lookKitCheckout?: boolean }).__lookKitCheckout = true
  }

  const onBuySet = async () => {
    setKitCheckoutFlag()
    await onAddAll()
  }

  buttons.buySet.addEventListener('click', () => void onBuySet())
  buttons.addAll.addEventListener('click', () => void onAddAll())
  $('[data-look-action="close"]').addEventListener('click', () => close())

  dialog.addEventListener('variant:change', (event) => {
    const panel = (event.target as Element).closest<HTMLElement>('[data-look-panel]')
    if (!panel) return
    refresh(Number(panel.dataset.lookPanel))
    renderButtons()
  })
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) close()
  })
  dialog.addEventListener('close', () => {
    if (isRestoringFocus) opener?.focus()
  })

  syncAll(true)

  const openers = document.querySelectorAll<HTMLElement>(`[data-look-for="${CSS.escape(dialog.id)}"]`)
  for (const trigger of openers) {
    trigger.addEventListener('click', (event) => {
      event.preventDefault()
      const productId = trigger.dataset.lookOpen
      if (productId !== undefined && productId !== '') open(MODES.single, Number(productId), trigger)
      else open(ids.length === 1 ? MODES.single : MODES.kit, ids[0] ?? null, trigger)
    })
  }
}

/** Wires every look dialog of the document. */
export const mountLookDialogs = (scope: ParentNode = document): void => {
  for (const dialog of scope.querySelectorAll<HTMLDialogElement>('dialog[data-look-dialog]')) mount(dialog)
}

mountLookDialogs()
