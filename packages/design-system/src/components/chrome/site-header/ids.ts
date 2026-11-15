// The ids the header gives its two dialogs; the phone tab bar's "categories" and "search" tabs point at them
// (`aria-controls`) and the dialogs' scripts bind every opener that does.
export const SITE_ID_PREFIX = 'site'
export const drawerIdOf = (idPrefix: string = SITE_ID_PREFIX): string => `${idPrefix}-drawer`
export const SEARCH_DIALOG_ID = 'site-search'
