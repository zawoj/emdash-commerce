import type { CategoryRef } from '../components/atoms/category-label/types'

/** The CSS colour of a category: its own `color`, else its palette token, else none. */
export const categoryColor = ({ color, key }: Pick<CategoryRef, 'color' | 'key'>): string | undefined =>
  color ?? (key ? `var(--category-${key})` : undefined)
