import { FIELD_KIND, FIELD_TYPES, type FieldKind } from './constants'
import type { SchemaField, SiteSchema } from './types'

// Words (English and Polish, diacritics stripped) that tell what kind of content a comment asks for.
// Checked in this order: "a photo for the title" is an image request.
const KEYWORDS: ReadonlyArray<readonly [FieldKind, readonly string[]]> = [
  [FIELD_KIND.IMAGE, ['image', 'photo', 'picture', 'banner', 'thumbnail', 'logo', 'icon', 'illustration', 'zdjec', 'foto', 'obraz', 'grafik', 'ikon', 'ilustracj']],
  [FIELD_KIND.LINK, ['link', 'url', 'button', 'cta', 'przycisk', 'odnosnik']],
  [FIELD_KIND.LONG_TEXT, ['paragraph', 'description', 'body text', 'article', 'akapit', 'opis', 'tresc', 'artykul']],
  [FIELD_KIND.SHORT_TEXT, ['title', 'heading', 'headline', 'label', 'tagline', 'subtitle', 'tytul', 'naglowek', 'podtytul']],
]

const normalise = (text: string): string => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/ł/g, 'l').toLowerCase()

/** What kind of content the comment seems to ask for, or null when it does not say. */
export const inferWantedKind = (comment: string): FieldKind | null => {
  const text = normalise(comment)
  for (const [kind, words] of KEYWORDS) {
    if (words.some((word) => new RegExp(`\\b${word}`).test(text))) return kind
  }
  return null
}

export const fitsKind = (fieldType: string, kind: FieldKind): boolean => FIELD_TYPES[kind].includes(fieldType)

export interface CandidateField {
  collection: string
  field: SchemaField
}

/** Existing fields of the given collections that could hold this kind of content. */
export const candidateFields = (schema: SiteSchema, collections: readonly string[], kind: FieldKind): CandidateField[] =>
  schema
    .filter((collection) => collections.includes(collection.slug))
    .flatMap((collection) => collection.fields.filter((field) => fitsKind(field.type, kind)).map((field) => ({ collection: collection.slug, field })))

export const findField = (schema: SiteSchema, collection: string, field: string): SchemaField | null =>
  schema.find((c) => c.slug === collection)?.fields.find((f) => f.slug === field) ?? null
