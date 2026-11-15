import { describe, expect, it } from 'vitest'
import { buildPrompt, type PromptContext } from './prompt'
import type { Annotation, ElementInfo, SiteSchema } from './types'

const SCHEMA: SiteSchema = [
  { slug: 'home', label: 'Homepage', fields: [{ slug: 'title', type: 'string', label: 'Title', isRequired: true }, { slug: 'hero_image', type: 'image', label: 'Intro image', isRequired: false }] },
  { slug: 'posts', label: 'Posts', fields: [{ slug: 'title', type: 'string', label: 'Title', isRequired: true }, { slug: 'featured_image', type: 'image', label: 'Featured Image', isRequired: false }, { slug: 'excerpt', type: 'text', label: 'Excerpt', isRequired: false }] },
]

const context = (overrides: Partial<PromptContext> = {}): PromptContext => ({
  url: 'http://localhost:4360/posts/notes',
  viewportWidth: 1280,
  viewportHeight: 800,
  pageCollections: ['posts'],
  schema: SCHEMA,
  ...overrides,
})

const element = (overrides: Partial<ElementInfo> = {}): ElementInfo => ({
  tag: 'header',
  classNames: ['band', 'intro'],
  selector: '#main > header.band.intro',
  text: 'My Blog',
  width: 1280,
  height: 347,
  ref: null,
  island: null,
  source: null,
  ...overrides,
})

const note = (comment: string, info: ElementInfo = element(), id = '01NOTE1'): Annotation => ({ id, comment, element: info, state: 'open', resolution: '', pagePath: '/', pageUrl: 'http://localhost:4360/', createdAt: 0 })

const TITLE_REF = { collection: 'posts', id: '01ABC', field: 'title', status: 'published' }

describe('buildPrompt — the basics', () => {
  it('is empty without comments', () => {
    expect(buildPrompt([], context())).toBe('')
  })

  it('names the page, the element, selector, text and comment, and pluralises', () => {
    const prompt = buildPrompt([note('Bigger'), note('Smaller', element({ tag: 'p', selector: 'p' }), '01NOTE2')], context())
    expect(prompt).toContain('Page: http://localhost:4360/posts/notes')
    expect(prompt).toContain('Feedback on 2 elements')
    expect(prompt).toContain('`#main > header.band.intro`')
    expect(prompt).toContain('Current text: "My Blog"')
    expect(prompt).toContain('## 1.')
    expect(prompt).toContain('## 2.')
  })

  it('includes link, image, island and source details when known', () => {
    const info = element({ tag: 'img', href: '/posts', src: '/a.png', alt: 'A "cat"', island: 'Search', source: 'src/pages/index.astro:12:3' })
    const prompt = buildPrompt([note('x', info)], context())
    expect(prompt).toContain('Link target: /posts')
    expect(prompt).toContain('Image: /a.png (alt "A \\"cat\\"")')
    expect(prompt).toContain('Astro island: Search')
    expect(prompt).toContain('Source: src/pages/index.astro:12:3')
  })
})

describe('buildPrompt — an element that is already a CMS field', () => {
  it('says it is content only and names the field with its live type', () => {
    const prompt = buildPrompt([note('Make it shorter', element({ tag: 'h1', ref: TITLE_REF }))], context())
    expect(prompt).toContain('## 1. posts › title (CMS field)')
    expect(prompt).toContain('Binding: existing CMS field `posts.title` (string, "Title") → a content change, no schema change.')
    expect(prompt).toContain('collection `posts`, entry `01ABC`, field `title`, status published')
    expect(prompt).toContain('/_emdash/admin/content/posts/01ABC')
  })

  it('flags a request the field type cannot hold', () => {
    const prompt = buildPrompt([note('Put a photo here', element({ ref: TITLE_REF }))], context())
    expect(prompt).toContain('looks like it asks for an image, but this field is `string`')
  })

  it('does not flag a request the field fits', () => {
    const imageRef = { collection: 'posts', id: '01ABC', field: 'featured_image', status: 'published' }
    const prompt = buildPrompt([note('Use a darker photo', element({ tag: 'img', ref: imageRef }))], context())
    expect(prompt).not.toContain('Check:')
  })

  it('still names the field when the schema could not be read', () => {
    const prompt = buildPrompt([note('Shorter', element({ ref: TITLE_REF }))], context({ schema: null }))
    expect(prompt).toContain('existing CMS field `posts.title` (type unknown)')
  })
})

describe('buildPrompt — an element that is not a CMS field', () => {
  it('says it is template markup and lists existing fields that could hold the image', () => {
    const prompt = buildPrompt([note('I need a photo here')], context({ pageCollections: ['home', 'posts'] }))
    expect(prompt).toContain('Binding: not a CMS field — this is template markup or static text.')
    expect(prompt).toContain('Wants: an image.')
    expect(prompt).toContain('Existing fields that fit: `home.hero_image` (image, "Intro image"), `posts.featured_image` (image, "Featured Image")')
  })

  it('says to create a field when no existing one has the right type on this page (a title is not a link field)', () => {
    const prompt = buildPrompt([note('Add a link button here')], context())
    expect(prompt).toContain('Wants: a link.')
    expect(prompt).toContain('none of the right type on this page\'s collections → create a new field')
  })

  it('only considers the collections that are on the page', () => {
    const prompt = buildPrompt([note('Need a banner image')], context({ pageCollections: ['posts'] }))
    expect(prompt).toContain('`posts.featured_image`')
    expect(prompt).not.toContain('`home.hero_image` (image')
  })

  it('does not guess when the comment does not say what kind of content', () => {
    const prompt = buildPrompt([note('Make this better')], context())
    expect(prompt).toContain('Wants: not clear from the comment')
  })

  it('understands Polish', () => {
    const prompt = buildPrompt([note('Potrzebuję tutaj zdjęcia')], context({ pageCollections: ['posts'] }))
    expect(prompt).toContain('Wants: an image.')
  })

  it('stops at the kind when the schema is unavailable', () => {
    const prompt = buildPrompt([note('A photo please')], context({ schema: null }))
    expect(prompt).toContain('Wants: an image.')
    expect(prompt).not.toContain('Existing fields')
  })
})

describe('buildPrompt — schema snapshot and decision guide', () => {
  it('prints the live schema, marking required fields and the collections on the page', () => {
    const prompt = buildPrompt([note('x')], context({ pageCollections: ['home'] }))
    expect(prompt).toContain('## Schema (live from this site, * = required)')
    expect(prompt).toContain('- `home` (Homepage) — on this page: title:string*, hero_image:image')
    expect(prompt).toContain('- `posts` (Posts): title:string*, featured_image:image, excerpt:text')
  })

  it('tells the agent to read the schema itself when the page could not', () => {
    const prompt = buildPrompt([note('x')], context({ schema: null }))
    expect(prompt).toContain('The live schema could not be read')
    expect(prompt).toContain('schema_get_collection')
  })

  it('always carries the three-way decision: existing field, new field, code only', () => {
    const prompt = buildPrompt([note('x')], context())
    expect(prompt).toContain('Decide first: new field, or only content?')
    expect(prompt).toContain('**Existing field → content only.**')
    expect(prompt).toContain('content_update')
    expect(prompt).toContain('**No suitable field → schema change, then content.**')
    expect(prompt).toContain('schema_create_field')
    expect(prompt).toContain('emdash schema add-field')
    expect(prompt).toContain('**Layout, markup or styles → code only.**')
    expect(prompt).toContain('seed/seed.json')
  })
})

describe('buildPrompt — comment ids and reporting back', () => {
  it('gives every comment its id', () => {
    const prompt = buildPrompt([note('One'), note('Two', element(), '01NOTE2')], context())
    expect(prompt).toContain('Comment ID: 01NOTE1')
    expect(prompt).toContain('Comment ID: 01NOTE2')
  })

  it('tells the agent how to mark a comment done, over MCP and over the CLI', () => {
    const prompt = buildPrompt([note('One')], context())
    expect(prompt).toContain('## When a comment is applied')
    expect(prompt).toContain('collection `feedback`')
    expect(prompt).toContain('`{"state":"done","resolution":"<what you changed, one or two sentences>"}`')
    expect(prompt).toContain("pnpm exec emdash content update feedback 01NOTE1 --rev <_rev from content get> --draft --url http://localhost:4360 --data '{\"state\":\"done\"")
  })

  it('lists every id and says what to do when a comment is not applied', () => {
    const prompt = buildPrompt([note('One'), note('Two', element(), '01NOTE2')], context())
    expect(prompt).toContain('(`01NOTE1`, `01NOTE2`)')
    expect(prompt).toContain('set `state` to `wontfix`')
    expect(prompt).toContain('Never delete the entry.')
  })

  it('points the CLI at the origin of the page the comment was made on', () => {
    const prompt = buildPrompt([note('One')], context({ url: 'http://localhost:4400/posts/x' }))
    expect(prompt).toContain('--url http://localhost:4400 ')
  })
})
