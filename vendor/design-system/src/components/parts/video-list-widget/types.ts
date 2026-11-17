import type { WidgetHeading } from '../../../types/heading'

/** One "movie-card" row of the "Polecane filmy" list: thumbnail beside the title and author. */
export interface VideoListItem {
  readonly title: string
  readonly href: string
  readonly author: string
  readonly thumbnail: string
}

/** Figma "X_old_widget-R-polecane-filmy" ("Polecane filmy", partner / wpisy-z-kategorii). */
export interface VideoListWidgetContent extends WidgetHeading {
  readonly items: readonly VideoListItem[]
}
