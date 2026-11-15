/** Tools added to the EmDash visual editing pill. Order is the order of the buttons. */
export const TOOL = {
  XRAY: 'xray',
  INSPECT: 'inspect',
  NOTES: 'notes',
  AUDIT: 'audit',
  ERRORS: 'errors',
} as const

export type ToolId = (typeof TOOL)[keyof typeof TOOL]

/** Tools that open the results panel (the others are plain on/off switches). */
export const PANEL_TOOLS: readonly ToolId[] = [TOOL.NOTES, TOOL.AUDIT, TOOL.ERRORS]

export const SEVERITY = {
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
} as const

export type Severity = (typeof SEVERITY)[keyof typeof SEVERITY]

/** What kind of content a comment asks for, guessed from its words; maps to EmDash field types. */
export const FIELD_KIND = {
  IMAGE: 'image',
  LINK: 'link',
  LONG_TEXT: 'long-text',
  SHORT_TEXT: 'short-text',
} as const

export type FieldKind = (typeof FIELD_KIND)[keyof typeof FIELD_KIND]

export const FIELD_TYPES: Record<FieldKind, readonly string[]> = {
  [FIELD_KIND.IMAGE]: ['image'],
  [FIELD_KIND.LINK]: ['url'],
  [FIELD_KIND.LONG_TEXT]: ['portableText', 'text'],
  [FIELD_KIND.SHORT_TEXT]: ['string'],
}

export const SCHEMA_API = '/_emdash/api/schema/collections'

/** Comments are rows of this collection, so the browser and an agent (MCP or CLI) share them. */
export const FEEDBACK = {
  COLLECTION: 'feedback',
  API: '/_emdash/api/content/feedback',
  PAGE_SIZE: 100,
  MAX_PAGES: 5,
  TITLE_MAX: 80,
  POLL_MS: 4000,
} as const

export const COMMENT_STATE = {
  OPEN: 'open',
  DONE: 'done',
  WONTFIX: 'wontfix',
} as const

export type CommentState = (typeof COMMENT_STATE)[keyof typeof COMMENT_STATE]

export const CATEGORY = {
  A11Y: 'a11y',
  SEO: 'seo',
  PERFORMANCE: 'performance',
} as const

export type Category = (typeof CATEGORY)[keyof typeof CATEGORY]

export const ERROR_KIND = {
  SCRIPT: 'script',
  PROMISE: 'promise',
  CONSOLE_ERROR: 'console.error',
  CONSOLE_WARN: 'console.warn',
  RESOURCE: 'resource',
  REQUEST: 'request',
} as const

export type ErrorKind = (typeof ERROR_KIND)[keyof typeof ERROR_KIND]

/** Markup EmDash owns — the add-on attaches to it and must not break when it changes. */
export const EMDASH = {
  TOOLBAR_ID: 'emdash-toolbar',
  TOOLBAR_INNER: '#emdash-toolbar .emdash-tb-inner',
  DISMISS_ID: 'emdash-tb-dismiss',
  REF_ATTR: 'data-emdash-ref',
  REF_SELECTOR: '[data-emdash-ref]',
  ADMIN_CONTENT_PATH: '/_emdash/admin/content',
  /** localStorage flag EmDash sets when the pill is closed with ×; it then removes the pill and edit mode. */
  DISMISSED_KEY: 'emdash-toolbar-dismissed',
} as const

export const DEV_TOOLS = {
  ROOT_ID: 'emdash-dev-tools',
  PANEL_ID: 'emdash-dev-tools-panel',
  OVERLAY_ID: 'emdash-dev-tools-overlay',
  LABELS_ID: 'emdash-dev-tools-labels',
  PINS_ID: 'emdash-dev-tools-pins',
  COMPOSER_ID: 'emdash-dev-tools-composer',
  TOAST_ID: 'emdash-dev-tools-toast',
  TOOLTIP_ID: 'emdash-dev-tools-tooltip',
  STYLE_ID: 'emdash-dev-tools-style',
  XRAY_CLASS: 'emdash-dev-xray',
  STORAGE_KEY: 'emdash-dev-tools',
  HANDLE_ID: 'emdash-dev-tools-handle',
  COLLAPSED_CLASS: 'emdash-dev-collapsed',
  COLLAPSED_EVENT: 'emdash-dev-tools:collapsed',
} as const

/** Everything the add-on draws itself; audits, X-ray and inspect skip these subtrees. */
export const IGNORED_SELECTOR = `#${EMDASH.TOOLBAR_ID}, #${DEV_TOOLS.ROOT_ID}, #${DEV_TOOLS.PANEL_ID}, #${DEV_TOOLS.OVERLAY_ID}, #${DEV_TOOLS.LABELS_ID}, #${DEV_TOOLS.PINS_ID}, #${DEV_TOOLS.COMPOSER_ID}, #${DEV_TOOLS.TOAST_ID}, #${DEV_TOOLS.TOOLTIP_ID}, astro-dev-toolbar`

export const LIMITS = {
  TITLE_MIN: 15,
  TITLE_MAX: 60,
  DESCRIPTION_MIN: 70,
  DESCRIPTION_MAX: 160,
  DOM_NODES_WARN: 1500,
  /** An image decoded at more than this many times its rendered width is oversized. */
  IMAGE_OVERSIZE_RATIO: 2,
  MAX_ERRORS: 100,
  TEXT_SNIPPET: 160,
  MAX_NOTES: 50,
  HIGHLIGHT_MS: 2500,
} as const
