// The "shop the kit" stepper as a pure state machine, and the add-everything helper. The dialog goes through the
// look's products one by one: a full choice (colour + size) moves on, "skip" leaves the product out, "back" returns,
// the last step leads to a summary that lists what was chosen, where any item can be changed again. No DOM here.

export const KIT_PHASES = { step: 'step', summary: 'summary' } as const
export type KitPhase = (typeof KIT_PHASES)[keyof typeof KIT_PHASES]

export const PICK_STATUSES = { chosen: 'chosen', skipped: 'skipped' } as const

export type KitPick = { readonly status: typeof PICK_STATUSES.chosen; readonly variantId: number } | { readonly status: typeof PICK_STATUSES.skipped }

export interface KitState {
  /** The products of the look, in step order. */
  readonly productIds: readonly number[]
  readonly phase: KitPhase
  /** The step shown while `phase` is `step`; the step being changed otherwise. */
  readonly index: number
  /** The shopper's decision per product; a product without an entry has not been decided yet. */
  readonly picks: Readonly<Record<number, KitPick>>
  /** A step opened from the summary: "next" and "skip" return to the summary instead of the following step. */
  readonly isEditing: boolean
}

export interface KitLine {
  readonly productId: number
  readonly variantId: number
}

export interface KitProgress {
  /** 1-based number of the step shown. */
  readonly current: number
  readonly total: number
  /** How far along the bar is, 0-1: the step shown over the total, full on the summary. */
  readonly ratio: number
}

export const createKit = (productIds: readonly number[]): KitState => ({ productIds, phase: KIT_PHASES.step, index: 0, picks: {}, isEditing: false })

export const currentProductId = (state: KitState): number | undefined => state.productIds[state.index]

const isLastStep = (state: KitState): boolean => state.index >= state.productIds.length - 1

/** Records a full choice for the product; `null` takes the choice back (the shopper cleared or changed an axis). */
export const pickVariant = (state: KitState, productId: number, variantId: number | null): KitState => {
  const picks = { ...state.picks }
  if (variantId === null) delete picks[productId]
  else picks[productId] = { status: PICK_STATUSES.chosen, variantId }
  return { ...state, picks }
}

/** "Next" needs a full choice on the step shown. */
export const canAdvance = (state: KitState): boolean => {
  const id = currentProductId(state)
  return state.phase === KIT_PHASES.step && id !== undefined && state.picks[id]?.status === PICK_STATUSES.chosen
}

const advance = (state: KitState): KitState => {
  if (state.isEditing || isLastStep(state)) return { ...state, phase: KIT_PHASES.summary, isEditing: false }
  return { ...state, index: state.index + 1 }
}

/** To the next step (or the summary after the last one); unchanged without a full choice. */
export const next = (state: KitState): KitState => (canAdvance(state) ? advance(state) : state)

/** Leaves the product out and moves on. */
export const skip = (state: KitState): KitState => {
  const id = currentProductId(state)
  if (state.phase !== KIT_PHASES.step || id === undefined) return state
  return advance({ ...state, picks: { ...state.picks, [id]: { status: PICK_STATUSES.skipped } } })
}

/** One step back; from the summary to the last step; from a step opened for a change to the summary; the first step stays. */
export const back = (state: KitState): KitState => {
  if (state.phase === KIT_PHASES.summary) return { ...state, phase: KIT_PHASES.step, index: state.productIds.length - 1, isEditing: false }
  if (state.isEditing) return { ...state, phase: KIT_PHASES.summary, isEditing: false }
  return state.index === 0 ? state : { ...state, index: state.index - 1 }
}

/** Opens a step of the summary for a change. */
export const change = (state: KitState, index: number): KitState =>
  index < 0 || index >= state.productIds.length ? state : { ...state, phase: KIT_PHASES.step, index, isEditing: true }

/** The chosen products as cart lines, in step order. */
export const chosenLines = (state: KitState): KitLine[] =>
  state.productIds.flatMap((productId) => {
    const pick = state.picks[productId]
    return pick?.status === PICK_STATUSES.chosen ? [{ productId, variantId: pick.variantId }] : []
  })

export const progressOf = (state: KitState): KitProgress => {
  const total = state.productIds.length
  const current = Math.min(state.index + 1, total)
  return { current, total, ratio: total === 0 ? 0 : state.phase === KIT_PHASES.summary ? 1 : current / total }
}

/** The summary can add something only when at least one product was chosen. */
export const canAddAll = (state: KitState): boolean => chosenLines(state).length > 0

export interface AddAnswer {
  readonly ok: boolean
  readonly message?: string
}

export interface AddFailure {
  readonly line: KitLine
  readonly message?: string
}

export interface AddOutcome {
  readonly added: readonly KitLine[]
  readonly failed: readonly AddFailure[]
}

/**
 * Adds the lines one after another (the cart is one document: parallel writes would race). A line that fails or throws is
 * reported and does not stop the others.
 */
export const addAll = async (lines: readonly KitLine[], add: (line: KitLine) => Promise<AddAnswer>): Promise<AddOutcome> => {
  const added: KitLine[] = []
  const failed: AddFailure[] = []
  for (const line of lines) {
    const answer = await add(line).catch((): AddAnswer => ({ ok: false }))
    if (answer.ok) added.push(line)
    else failed.push({ line, message: answer.message })
  }
  return { added, failed }
}

/** Minor units (grosze) as text through `Intl`, without a float computation on the amount: 4999 → "49,99 zł". */
export const formatMinor = (minor: number, format: { readonly locale: string; readonly currency: string }): string => {
  const abs = Math.abs(Math.trunc(minor))
  const decimal = `${minor < 0 ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}` as `${number}`
  return new Intl.NumberFormat(format.locale, { style: 'currency', currency: format.currency }).format(decimal)
}

/** The sum of the chosen lines' prices in minor units; `priceOf` is the price of a line's variant. */
export const sumMinor = (lines: readonly KitLine[], priceOf: (line: KitLine) => number): number => lines.reduce((total, line) => total + priceOf(line), 0)

interface PickableVariant {
  readonly id: number
  readonly isPurchasable: boolean
}

/**
 * The variant id to record for the kit stepper: an explicit resolved variant when axes need a choice, or the sole
 * sellable variant when the product has no axes.
 */
export const variantPickId = (
  axes: readonly string[],
  variants: readonly PickableVariant[],
  variant: PickableVariant | undefined,
): number | null => {
  const resolved = variant ?? (axes.length === 0 ? variants.find((row) => row.isPurchasable) : undefined)
  return resolved?.isPurchasable ? resolved.id : null
}
