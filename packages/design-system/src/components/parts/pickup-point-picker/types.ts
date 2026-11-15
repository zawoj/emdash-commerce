/** A pickup point (parcel locker, shop, branch) in the carrier-agnostic shape the picker renders. */
export interface PickupPointContent {
  /** The carrier's code for the point ("DEMO-WAW01"); what the order stores. */
  readonly code: string
  readonly name: string
  /** A key into `typeLabels` ("locker", "shop"). */
  readonly type: string
  readonly street: string
  readonly postCode: string
  readonly city: string
  readonly openingHours: string
  readonly isCodAvailable: boolean
  /** Distance from the searched place in km, when the carrier returns it. */
  readonly distance?: number
}

export interface PickupPointPickerLabels {
  /** The group's name ("Choose a pickup point"). */
  readonly legend: string
  readonly searchLabel: string
  readonly searchPlaceholder: string
  readonly searchButton: string
  /** Accessible name of the result list ("Pickup points"). */
  readonly resultsLabel: string
  /** Caption of the chosen point's summary ("Selected point"). */
  readonly selectedLabel: string
  readonly emptyLabel: string
  readonly loadingLabel: string
  readonly errorLabel: string
  /** Marks a point that takes cash on delivery ("Cash on delivery available"). */
  readonly codLabel: string
  /** The result count with `{count}` ("{count} points found"). */
  readonly countTemplate: string
  /** The distance with `{distance}` ("{distance} km"). */
  readonly distanceTemplate?: string
  /** Words for point types, by `type` key. */
  readonly typeLabels?: Readonly<Record<string, string>>
}

/**
 * A carrier's own map widget (InPost Geowidget v5) offered next to the text search. The script loads the widget only when
 * the shopper opens the map; without a script the button stays hidden. `config` is the widget's point filter
 * ("parcelCollect" for prepaid, "parcelCollectPayment" for cash on delivery).
 */
export interface PickupPointGeowidget {
  /** The widget's public token. */
  readonly token: string
  readonly scriptUrl: string
  readonly styleUrl: string
  readonly config?: string
  readonly language?: string
  readonly openLabel: string
  readonly closeLabel: string
}

export interface PickupPointFieldNames {
  readonly name: string
  readonly street: string
  readonly postCode: string
  readonly city: string
}

export interface PickupPointPickerProps {
  /** Prefix of the control ids; unique per picker on a page. */
  id: string
  labels: PickupPointPickerLabels
  /** The JSON endpoint of the carrier's search (`GET ?<queryParam>=<text>` → `{ points }` or an array); without it the field only submits. */
  endpoint?: string
  /** The query parameter the endpoint reads (`q`). */
  queryParam?: string
  /** Shortest query that is searched (2). */
  minLength?: number
  /** Points already known (the server's search, or the nearest ones). */
  points?: readonly PickupPointContent[]
  /** The code of the chosen point. */
  selectedCode?: string
  /** The search field's name and current value; without a script this postcode text field posts to the server. */
  queryName?: string
  queryValue?: string
  /** The radios' name: the chosen point's code. */
  codeName?: string
  /** Names of the hidden inputs the script fills from the chosen point. */
  fieldNames?: PickupPointFieldNames
  /** The carrier's map widget; omit it and only the text search shows. */
  geowidget?: PickupPointGeowidget
  error?: string
  errorLabel?: string
}
