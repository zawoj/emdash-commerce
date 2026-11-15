import { describe, expect, it } from 'vitest'
import { FIELD_KIND } from './constants'
import { candidateFields, findField, fitsKind, inferWantedKind } from './field-hints'
import type { SiteSchema } from './types'

const SCHEMA: SiteSchema = [
  { slug: 'home', label: 'Homepage', fields: [{ slug: 'hero_image', type: 'image', label: 'Intro image', isRequired: false }] },
  { slug: 'posts', label: 'Posts', fields: [{ slug: 'title', type: 'string', label: 'Title', isRequired: true }, { slug: 'content', type: 'portableText', label: 'Content', isRequired: false }] },
]

describe('inferWantedKind', () => {
  it.each([
    ['I need an image here', FIELD_KIND.IMAGE],
    ['Potrzebuję tutaj zdjęcia', FIELD_KIND.IMAGE],
    ['dodaj obrazek', FIELD_KIND.IMAGE],
    ['Add a CTA button', FIELD_KIND.LINK],
    ['dodaj przycisk', FIELD_KIND.LINK],
    ['Rewrite this paragraph', FIELD_KIND.LONG_TEXT],
    ['zmień opis', FIELD_KIND.LONG_TEXT],
    ['Shorter title please', FIELD_KIND.SHORT_TEXT],
    ['zmień nagłówek', FIELD_KIND.SHORT_TEXT],
  ])('"%s" → %s', (comment, kind) => {
    expect(inferWantedKind(comment)).toBe(kind)
  })

  it('treats a photo for the title as an image request', () => {
    expect(inferWantedKind('a photo next to the title')).toBe(FIELD_KIND.IMAGE)
  })

  it('returns null when the comment does not say', () => {
    expect(inferWantedKind('make this better')).toBeNull()
    expect(inferWantedKind('')).toBeNull()
  })

  it('does not match inside other words', () => {
    expect(inferWantedKind('the unlinked part')).toBeNull()
  })
})

describe('field lookup', () => {
  it('knows which types fit which kind', () => {
    expect(fitsKind('image', FIELD_KIND.IMAGE)).toBe(true)
    expect(fitsKind('string', FIELD_KIND.IMAGE)).toBe(false)
    expect(fitsKind('portableText', FIELD_KIND.LONG_TEXT)).toBe(true)
    expect(fitsKind('url', FIELD_KIND.LINK)).toBe(true)
    expect(fitsKind('string', FIELD_KIND.LINK)).toBe(false)
  })

  it('lists matching fields only from the collections it is given', () => {
    expect(candidateFields(SCHEMA, ['home', 'posts'], FIELD_KIND.IMAGE).map((c) => `${c.collection}.${c.field.slug}`)).toEqual(['home.hero_image'])
    expect(candidateFields(SCHEMA, ['posts'], FIELD_KIND.IMAGE)).toEqual([])
  })

  it('finds a field by collection and slug', () => {
    expect(findField(SCHEMA, 'posts', 'title')?.type).toBe('string')
    expect(findField(SCHEMA, 'posts', 'nope')).toBeNull()
    expect(findField(SCHEMA, 'nope', 'title')).toBeNull()
  })
})
