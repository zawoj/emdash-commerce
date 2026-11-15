// Pickup-point picker (carrier-agnostic). Server-rendered points are radios, so choosing one works
// without a script. The script adds live search: it fetches `data-endpoint` with the typed query
// (`?<data-query-param>=<text>`; the response is an array of points or `{ points: [...] }`), renders
// every field with `textContent` (never HTML), keeps the radios keyboard-selectable, mirrors the
// chosen point into the hidden inputs `[data-pickup-field="name|street|postCode|city"]` and fires
// `pickup-point:select` (`detail: { point }`) on the root. Labels arrive as `data-*` from the
// component — the script holds no copy.
export interface PickupPoint {
  readonly code: string
  readonly name: string
  readonly type: string
  readonly street: string
  readonly postCode: string
  readonly city: string
  readonly openingHours: string
  readonly isCodAvailable: boolean
  readonly distance?: number
}

const searchDelay = 350

const asText = (value: unknown): string => (typeof value === 'string' ? value : '')

/** Narrows an untrusted JSON row to a point; a row without a code is dropped. */
const toPoint = (row: unknown): PickupPoint | null => {
  if (typeof row !== 'object' || row === null) return null
  const source = row as Record<string, unknown>
  const code = asText(source.code)
  if (!code) return null
  const distance = typeof source.distance === 'number' && Number.isFinite(source.distance) ? source.distance : undefined
  return {
    code,
    name: asText(source.name) || code,
    type: asText(source.type),
    street: asText(source.street),
    postCode: asText(source.postCode),
    city: asText(source.city),
    openingHours: asText(source.openingHours),
    isCodAvailable: source.isCodAvailable === true,
    distance,
  }
}

const toPoints = (payload: unknown): PickupPoint[] => {
  const rows = Array.isArray(payload) ? payload : Array.isArray((payload as { points?: unknown })?.points) ? (payload as { points: unknown[] }).points : []
  return rows.map(toPoint).filter((point): point is PickupPoint => point !== null)
}

const element = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag)
  node.className = className
  if (text) node.textContent = text
  return node
}

interface PickerContext {
  readonly root: HTMLElement
  readonly list: HTMLElement
  readonly status: HTMLElement
  readonly selected: HTMLElement | null
  readonly radioName: string
  readonly typeLabels: Record<string, string>
}

const parseTypeLabels = (raw: string | undefined): Record<string, string> => {
  try {
    const parsed: unknown = JSON.parse(raw ?? '{}')
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, string>) : {}
  } catch {
    return {}
  }
}

const address = (point: PickupPoint): string => `${point.street}, ${point.postCode} ${point.city}`

const renderPoint = (ctx: PickerContext, point: PickupPoint, index: number): HTMLElement => {
  const { dataset } = ctx.root
  const item = element('li', 'pickup-point-picker__item')
  const label = element('label', 'pickup-point-picker__option')
  const input = element('input', 'pickup-point-picker__radio')
  input.type = 'radio'
  input.name = ctx.radioName
  input.value = point.code
  input.id = `${ctx.root.id}-point-${index}`
  label.htmlFor = input.id
  input.dataset.name = point.name
  input.dataset.street = point.street
  input.dataset.postCode = point.postCode
  input.dataset.city = point.city
  const body = element('span', 'pickup-point-picker__body')
  const title = element('span', 'pickup-point-picker__name', point.name)
  const typeLabel = ctx.typeLabels[point.type]
  if (typeLabel) title.append(' ', element('span', 'pickup-point-picker__type', typeLabel))
  body.append(title, element('span', 'pickup-point-picker__address', address(point)))
  if (point.openingHours) body.append(element('span', 'pickup-point-picker__hours', point.openingHours))
  if (point.isCodAvailable && dataset.codLabel) body.append(element('span', 'pickup-point-picker__cod', dataset.codLabel))
  if (point.distance !== undefined && dataset.distanceTemplate) {
    body.append(element('span', 'pickup-point-picker__distance', dataset.distanceTemplate.replace('{distance}', point.distance.toFixed(1))))
  }
  label.append(input, body)
  item.append(label)
  return item
}

const setHidden = (root: HTMLElement, field: string, value: string) => {
  const input = root.querySelector<HTMLInputElement>(`[data-pickup-field="${field}"]`)
  if (input) input.value = value
}

const select = (ctx: PickerContext, input: HTMLInputElement) => {
  const { name = '', street = '', postCode = '', city = '' } = input.dataset
  setHidden(ctx.root, 'name', name)
  setHidden(ctx.root, 'street', street)
  setHidden(ctx.root, 'postCode', postCode)
  setHidden(ctx.root, 'city', city)
  const summary = ctx.selected?.querySelector<HTMLElement>('[data-pickup-selected-text]')
  if (summary) summary.textContent = `${name} — ${street}, ${postCode} ${city}`
  if (ctx.selected) ctx.selected.hidden = false
  const point: PickupPoint = { code: input.value, name, type: '', street, postCode, city, openingHours: '', isCodAvailable: false }
  ctx.root.dispatchEvent(new CustomEvent<{ point: PickupPoint }>('pickup-point:select', { bubbles: true, detail: { point } }))
}

const announce = (ctx: PickerContext, text: string) => {
  ctx.status.textContent = text
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

/** A point as InPost Geowidget v5 hands it to `onpoint` (the ShipX point shape) → the picker's point. */
export const pointFromGeowidget = (raw: unknown): PickupPoint | null => {
  if (!isRecord(raw)) return null
  const code = asText(raw.name)
  if (!code) return null
  const address = isRecord(raw.address) ? raw.address : {}
  const details = isRecord(raw.address_details) ? raw.address_details : {}
  const types = Array.isArray(raw.type) ? raw.type.filter((entry): entry is string => typeof entry === 'string') : []
  const isShop = types.includes('pop') && !types.includes('parcel_locker_only') && raw.partner_id !== 0
  return {
    code,
    name: code,
    type: isShop ? 'shop' : 'locker',
    street: asText(address.line1) || [asText(details.street), asText(details.building_number)].filter(Boolean).join(' '),
    postCode: asText(details.post_code),
    city: asText(details.city),
    openingHours: asText(raw.opening_hours),
    isCodAvailable: raw.payment_available === true,
  }
}

const loadOnce = (tag: 'link' | 'script', url: string) => {
  const attribute = tag === 'link' ? 'href' : 'src'
  if (document.querySelector(`${tag}[${attribute}="${url}"]`)) return
  const node = document.createElement(tag)
  if (node instanceof HTMLLinkElement) node.rel = 'stylesheet'
  node.setAttribute(attribute, url)
  if (node instanceof HTMLScriptElement) node.defer = true
  document.head.append(node)
}

const isHttps = (url: string | undefined): url is string => {
  try {
    return url !== undefined && new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}

/** The carrier's own map widget (InPost Geowidget v5): loaded when the shopper first opens it; its pick becomes the chosen radio. */
const mountMap = (ctx: PickerContext, map: HTMLElement) => {
  const toggle = map.querySelector<HTMLButtonElement>('[data-pickup-map-toggle]')
  const frame = map.querySelector<HTMLElement>('[data-pickup-map-frame]')
  const { token, scriptUrl, styleUrl, config, language, openLabel = '', closeLabel = '' } = map.dataset
  if (!toggle || !frame || !token || !isHttps(scriptUrl) || !isHttps(styleUrl)) return
  const toggleText = toggle.querySelector<HTMLElement>('[data-pickup-map-toggle-text]')
  const callbackName = `pickupPointGeowidget_${ctx.root.id.replace(/\W/g, '_')}`
  let isLoaded = false

  const setOpen = (isOpen: boolean) => {
    frame.hidden = !isOpen
    toggle.setAttribute('aria-expanded', String(isOpen))
    if (toggleText) toggleText.textContent = isOpen ? closeLabel : openLabel
  }

  // The widget's point is completed with the shop's own lookup of the code (address, hours, COD flag as the carrier's points API reports them).
  const completed = async (point: PickupPoint): Promise<PickupPoint> => {
    const endpoint = ctx.root.dataset.endpoint
    if (!endpoint) return point
    try {
      const url = new URL(endpoint, window.location.href)
      url.searchParams.set('code', point.code)
      const response = await fetch(url, { headers: { accept: 'application/json' } })
      return response.ok ? (toPoints(await response.json())[0] ?? point) : point
    } catch {
      return point
    }
  }

  ;(window as unknown as Record<string, unknown>)[callbackName] = async (raw: unknown) => {
    const widgetPoint = pointFromGeowidget(raw)
    if (!widgetPoint) return
    const point = await completed(widgetPoint)
    ctx.list.replaceChildren(renderPoint(ctx, point, 0))
    const input = ctx.list.querySelector<HTMLInputElement>('input[type="radio"]')
    if (!input) return
    input.checked = true
    select(ctx, input)
    announce(ctx, '')
    setOpen(false)
  }

  const load = () => {
    loadOnce('link', styleUrl)
    loadOnce('script', scriptUrl)
    const widget = document.createElement('inpost-geowidget')
    widget.setAttribute('token', token)
    widget.setAttribute('language', language ?? 'pl')
    widget.setAttribute('config', config ?? 'parcelCollect')
    widget.setAttribute('onpoint', callbackName)
    frame.append(widget)
  }

  toggle.hidden = false
  toggle.addEventListener('click', () => {
    if (!frame.hidden) return setOpen(false)
    if (!isLoaded) {
      load()
      isLoaded = true
    }
    setOpen(true)
  })
}

const mountPicker = (root: HTMLElement) => {
  const list = root.querySelector<HTMLElement>('[data-pickup-results]')
  const status = root.querySelector<HTMLElement>('[data-pickup-status]')
  const search = root.querySelector<HTMLInputElement>('[data-pickup-search]')
  const endpoint = root.dataset.endpoint
  if (!list || !status || !search || root.dataset.pickupMounted) return
  root.dataset.pickupMounted = 'true'
  const ctx: PickerContext = {
    root,
    list,
    status,
    selected: root.querySelector<HTMLElement>('[data-pickup-selected]'),
    radioName: root.dataset.radioName ?? 'pickupPointCode',
    typeLabels: parseTypeLabels(root.dataset.typeLabels),
  }
  const map = root.querySelector<HTMLElement>('[data-pickup-map]')
  if (map) mountMap(ctx, map)
  const minLength = Number(root.dataset.minLength) || 2
  const button = root.querySelector<HTMLButtonElement>('[data-pickup-search-button]')
  if (button) button.hidden = false
  let controller: AbortController | undefined

  list.addEventListener('change', (event) => {
    const input = event.target as HTMLInputElement
    if (input.type === 'radio' && input.checked) select(ctx, input)
  })

  const render = (points: PickupPoint[]) => {
    list.replaceChildren(...points.map((point, index) => renderPoint(ctx, point, index)))
    const template = root.dataset.countTemplate ?? '{count}'
    announce(ctx, points.length === 0 ? (root.dataset.emptyLabel ?? '') : template.replace('{count}', String(points.length)))
  }

  const runSearch = async () => {
    const query = search.value.trim()
    if (!endpoint || query.length < minLength) return
    controller?.abort()
    controller = new AbortController()
    announce(ctx, root.dataset.loadingLabel ?? '')
    root.setAttribute('aria-busy', 'true')
    try {
      const url = new URL(endpoint, window.location.href)
      url.searchParams.set(root.dataset.queryParam ?? 'q', query)
      const response = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } })
      if (!response.ok) throw new Error(String(response.status))
      render(toPoints(await response.json()))
    } catch (error) {
      if ((error as Error).name === 'AbortError') return
      announce(ctx, root.dataset.errorLabel ?? '')
    } finally {
      root.removeAttribute('aria-busy')
    }
  }

  let timer: number | undefined
  search.addEventListener('input', () => {
    window.clearTimeout(timer)
    timer = window.setTimeout(runSearch, searchDelay)
  })
  // Enter searches instead of submitting the surrounding checkout form.
  search.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    window.clearTimeout(timer)
    void runSearch()
  })
  button?.addEventListener('click', () => void runSearch())
}

export const mountPickupPointPickers = (scope: ParentNode = document) => {
  for (const root of scope.querySelectorAll<HTMLElement>('[data-pickup-point-picker]')) mountPicker(root)
}

mountPickupPointPickers()
