import { candidateFields, findField, fitsKind, inferWantedKind } from './field-hints'
import { adminUrlFor, refLabel } from './ref'
import type { FieldKind } from './constants'
import { COMMENT_STATE, FEEDBACK } from './constants'
import type { Annotation, SiteSchema } from './types'

export interface PromptContext {
  url: string
  viewportWidth: number
  viewportHeight: number
  /** Collections with an editable field somewhere on the page. */
  pageCollections: readonly string[]
  /** The live content model, or null when it could not be read. */
  schema: SiteSchema | null
}

const quote = (value: string): string => `"${value.replace(/"/g, '\\"')}"`

const KIND_LABEL: Record<FieldKind, string> = {
  image: 'an image',
  link: 'a link',
  'long-text': 'long text',
  'short-text': 'short text',
}

const fieldName = (collection: string, field: string, type: string, label?: string): string => `\`${collection}.${field}\` (${type}${label && label !== field ? `, "${label}"` : ''})`

/** The verdict for one comment: reuse an existing field, create one, or change only code. */
const bindingLines = (annotation: Annotation, context: PromptContext): string[] => {
  const { element, comment } = annotation
  const kind = inferWantedKind(comment)
  const { schema } = context
  const ref = element.ref
  if (ref?.field) {
    const known = schema ? findField(schema, ref.collection, ref.field) : null
    const type = known?.type
    const lines = [`Binding: existing CMS field ${fieldName(ref.collection, ref.field, type ?? 'type unknown', known?.label)} → a content change, no schema change.`]
    if (kind && type && !fitsKind(type, kind)) {
      lines.push(`Check: the comment looks like it asks for ${KIND_LABEL[kind]}, but this field is \`${type}\` — it may need a different or new field instead.`)
    }
    return lines
  }
  const lines = ['Binding: not a CMS field — this is template markup or static text.']
  if (!kind) {
    lines.push('Wants: not clear from the comment — decide from the schema snapshot.')
    return lines
  }
  lines.push(`Wants: ${KIND_LABEL[kind]}.`)
  if (!schema) return lines
  const candidates = candidateFields(schema, context.pageCollections, kind)
  if (candidates.length === 0) {
    lines.push(`Existing fields: none of the right type on this page's collections → create a new field (schema change), fill it, and render it in the template.`)
  } else {
    const list = candidates.map((c) => fieldName(c.collection, c.field.slug, c.field.type, c.field.label)).join(', ')
    lines.push(`Existing fields that fit: ${list}. If one is free for this spot, only add content to it (and render it here); if they are already used for something else, create a new field.`)
  }
  return lines
}

const describeOne = (annotation: Annotation, index: number, context: PromptContext): string => {
  const { element, comment } = annotation
  const ref = element.ref
  const title = ref ? `${refLabel(ref)} (CMS field)` : `<${element.tag}${element.id ? `#${element.id}` : ''}>`
  const lines = [`## ${index + 1}. ${title}`, `Comment ID: ${annotation.id}`, `Comment: ${comment}`, ...bindingLines(annotation, context)]
  lines.push(`Element: \`${element.tag}${element.classNames.length ? `.${element.classNames.slice(0, 3).join('.')}` : ''}\` ${element.width}×${element.height}px`, `Selector: \`${element.selector}\``)
  if (element.text) lines.push(`Current text: ${quote(element.text)}`)
  if (element.href) lines.push(`Link target: ${element.href}`)
  if (element.src) lines.push(`Image: ${element.src}${element.alt ? ` (alt ${quote(element.alt)})` : ''}`)
  if (ref) {
    lines.push(`EmDash content: collection \`${ref.collection}\`, entry \`${ref.id}\`${ref.field ? `, field \`${ref.field}\`` : ''}${ref.status ? `, status ${ref.status}` : ''}`)
    lines.push(`Admin: ${adminUrlFor(ref)}`)
  }
  if (element.island) lines.push(`Astro island: ${element.island}`)
  if (element.source) lines.push(`Source: ${element.source}`)
  return lines.join('\n')
}

const snapshot = (context: PromptContext): string => {
  if (!context.schema) {
    return '## Schema\nThe live schema could not be read from the page — call `schema_list_collections` and `schema_get_collection` (EmDash MCP) or run `pnpm exec emdash schema get <collection>` before deciding.'
  }
  const lines = context.schema.map((collection) => {
    const fields = collection.fields.map((f) => `${f.slug}:${f.type}${f.isRequired ? '*' : ''}`).join(', ')
    const onPage = context.pageCollections.includes(collection.slug) ? ' — on this page' : ''
    return `- \`${collection.slug}\` (${collection.label})${onPage}: ${fields || 'no fields'}`
  })
  return ['## Schema (live from this site, * = required)', ...lines].join('\n')
}

const decisionGuide = (): string =>
  [
    '## Decide first: new field, or only content?',
    'Before editing, say for each comment which of these it is:',
    '1. **Existing field → content only.** The element is a CMS field, or the schema above already has a field of the right type that fits. Change the entry, not the template: with the EmDash MCP server `emdash-site` use `content_get` (it returns `_rev`), then `content_update` with that `_rev`, and `content_publish` only if it should go live (updating a published entry stages a draft). Without MCP, edit it in the admin at the path shown. If the template does not render that field here yet, add that rendering.',
    '2. **No suitable field → schema change, then content.** Create the field first — `schema_create_field` over MCP or `pnpm exec emdash schema add-field <collection> <slug> --type <type> --label "<Label>"` (snake_case slug; types: string, text, url, number, integer, boolean, datetime, select, multiSelect, portableText, image, file, reference, json, slug). Then fill it with content, and render it in the template (`apps/storefront/src/pages/…`) with `{...entry.edit.<field>}` so it stays editable inline, and `Image` from `emdash/ui` for images. A page-level piece of content with no entry to hold it belongs in a collection (the homepage uses the one-entry collection `home`), not in site settings.',
    '3. **Layout, markup or styles → code only.** Those live in `apps/storefront/src` (`layouts/`, `pages/`, `components/`, `styles/`). Find the element with the selector, classes and current text above.',
    'After a schema change: `pnpm exec emdash types --url http://localhost:4360`, and mirror the collection or field in `seed/seed.json`. Keep the change minimal, then check it in the browser on the page above.',
  ].join('\n')

const originOf = (url: string): string => {
  try {
    return new URL(url).origin
  } catch {
    return 'http://localhost:4360'
  }
}

/** How an agent reports back, so the comment leaves the page (done) or says why it stays (wontfix). */
const reportBack = (annotations: readonly Annotation[], context: PromptContext): string => {
  const ids = annotations.map((a) => a.id)
  const first = ids[0] ?? '<Comment ID>'
  return [
    '## When a comment is applied',
    `Each comment above is a row in the \`${FEEDBACK.COLLECTION}\` collection, and its Comment ID is the entry id (${ids.map((id) => `\`${id}\``).join(', ')}). Once you have applied a comment and checked the result in the browser, mark it done — it then disappears from the page for the person who wrote it:`,
    `- EmDash MCP: \`content_get\` (collection \`${FEEDBACK.COLLECTION}\`, id = the Comment ID) for its \`_rev\`, then \`content_update\` with that \`_rev\` and data \`{"state":"${COMMENT_STATE.DONE}","resolution":"<what you changed, one or two sentences>"}\`.`,
    `- CLI: \`pnpm exec emdash content update ${FEEDBACK.COLLECTION} ${first} --rev <_rev from content get> --draft --url ${originOf(context.url)} --data '{"state":"${COMMENT_STATE.DONE}","resolution":"<what you changed>"}'\``,
    `If you decide not to apply a comment, set \`state\` to \`${COMMENT_STATE.WONTFIX}\` and put the reason in \`resolution\`. Leave it \`${COMMENT_STATE.OPEN}\` if you did not finish. Never delete the entry.`,
  ].join('\n')
}

/** Markdown prompt for an AI agent: the page, what was clicked, what the person wants, and how to tell field vs content. */
export const buildPrompt = (annotations: readonly Annotation[], context: PromptContext): string => {
  if (annotations.length === 0) return ''
  const header = [
    'You are working on an EmDash site (Astro + EmDash CMS) in `apps/storefront`.',
    `Page: ${context.url}`,
    `Viewport: ${context.viewportWidth}×${context.viewportHeight}`,
    '',
    `Feedback on ${annotations.length} element${annotations.length === 1 ? '' : 's'} of this page:`,
  ].join('\n')
  return [header, ...annotations.map((a, i) => describeOne(a, i, context)), snapshot(context), decisionGuide(), reportBack(annotations, context)].join('\n\n')
}
