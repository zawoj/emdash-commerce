// Pure decisions behind the phone's bottom bars (`utils/action-bar.ts`, `chrome/tab-bar`): when the
// page's action bar takes the tab bar's place (the CSS side is `chrome/bottom-bars.css`). No DOM access, so they run (and are tested) anywhere.

/** What an IntersectionObserver reports about the element an action bar watches. */
export interface WatchedTarget {
  readonly isIntersecting: boolean
  /** The target's top edge relative to the viewport's top edge (negative = above the screen). */
  readonly top: number
}

/**
 * An action bar with nothing to watch is always shown. One that watches an element (the inline buy
 * button) appears once that element has scrolled up out of the screen — not while it is still below the
 * fold, so the tab bar stays the way around the page until the shopper has passed the buy box.
 */
export const isActionBarShown = (target: WatchedTarget | null): boolean => {
  if (target === null) return true
  return !target.isIntersecting && target.top < 0
}
