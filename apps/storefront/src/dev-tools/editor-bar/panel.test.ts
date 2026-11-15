import { describe, expect, it, vi } from 'vitest'
import { notesView, type NotesHandlers } from './panel'
import type { Annotation, ElementInfo } from './types'

const ELEMENT: ElementInfo = { tag: 'h1', classNames: [], selector: 'main > h1', text: '', width: 1, height: 1, ref: { collection: 'posts', id: '1', field: 'title' }, island: null, source: null }

const note = (id: string, overrides: Partial<Annotation> = {}): Annotation => ({ id, comment: `comment ${id}`, element: ELEMENT, state: 'open', resolution: '', pagePath: '/', pageUrl: 'http://localhost/', createdAt: 0, ...overrides })

const handlers = (): NotesHandlers => ({ onCopyAll: vi.fn(), onClearDone: vi.fn(), onRemove: vi.fn(), onRetry: vi.fn() })

describe('notesView', () => {
  it('shows open comments with their id and field, and counts them', () => {
    const view = notesView({ open: [note('01A'), note('01B')], finished: [], error: null }, handlers())
    expect(view.title).toBe('Notes — 2 open on this page')
    expect(view.rows).toContain('comment 01A')
    expect(view.rows).toContain('ID 01A')
    expect(view.rows).toContain('posts › title')
    expect(view.isEmpty).toBe(false)
    expect(view.actions?.map((a) => a.id)).toEqual(['copy'])
  })

  it('moves finished comments to a Done section with the agent’s resolution, and offers to clear them', () => {
    const view = notesView({ open: [note('01A')], finished: [note('01B', { state: 'done', resolution: 'Shortened the title' }), note('01C', { state: 'wontfix', resolution: 'Needs a design' })], error: null }, handlers())
    expect(view.title).toBe('Notes — 1 open, 2 done on this page')
    expect(view.rows).toContain('Done — the agent has applied or declined these')
    expect(view.rows).toContain('✓ done — Shortened the title')
    expect(view.rows).toContain('✗ won’t fix — Needs a design')
    expect(view.actions?.map((a) => a.id)).toEqual(['copy', 'clear-done'])
  })

  it('only open comments can be scrolled to', () => {
    const view = notesView({ open: [note('01A')], finished: [note('01B', { state: 'done' })], error: null }, handlers())
    expect(view.rows.match(/data-selector=/g)).toHaveLength(1)
  })

  it('is empty, with guidance, when there are no comments', () => {
    const view = notesView({ open: [], finished: [], error: null }, handlers())
    expect(view.isEmpty).toBe(true)
    expect(view.emptyText).toContain('moves to Done')
    expect(view.actions).toEqual([])
  })

  it('shows why comments cannot be loaded, with a Retry', () => {
    const view = notesView({ open: [], finished: [], error: 'The "feedback" collection does not exist' }, handlers())
    expect(view.emptyText).toContain('feedback')
    expect(view.actions?.map((a) => a.id)).toEqual(['retry'])
  })

  it('shows the problem above comments that were loaded earlier', () => {
    const view = notesView({ open: [note('01A')], finished: [], error: 'The dev server could not be reached.' }, handlers())
    expect(view.rows.indexOf('could not be reached')).toBeLessThan(view.rows.indexOf('comment 01A'))
  })

  it('routes the row buttons: remove passes the entry id', () => {
    const h = handlers()
    const view = notesView({ open: [note('01A')], finished: [], error: null }, h)
    view.onRowAction?.('remove', '01A')
    view.onRowAction?.('other', 'x')
    expect(h.onRemove).toHaveBeenCalledWith('01A')
    expect(h.onRemove).toHaveBeenCalledTimes(1)
  })

  it('escapes what a comment or a resolution contains', () => {
    const view = notesView({ open: [note('01A', { comment: '<img src=x onerror=alert(1)>' })], finished: [note('01B', { state: 'done', resolution: '<script>x</script>' })], error: null }, handlers())
    expect(view.rows).not.toContain('<img src=x')
    expect(view.rows).not.toContain('<script>')
  })
})
