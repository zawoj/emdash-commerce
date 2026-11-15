// Regression test for the palette: parses src/tokens/index.css, resolves every var() chain per surface and asserts the
// WCAG 2.x contrast of the pairs components actually draw (text on its background: 4.5:1; strokes and focus rings
// on the surface: 3:1). Swapping --on-accent to white, or a ramp step to a lighter value, fails here.
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const css = readFileSync(fileURLToPath(new URL('../src/tokens/index.css', import.meta.url)), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

// Every `selector { declarations }` block, in file order.
const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({
  selector: selector.trim(),
  decls: Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()])),
}))

// Tokens of a surface: `:root` and `[data-surface='light']` blocks are the light theme; the dark block overlays them.
const surfaceTokens = (surface) => {
  const wanted = (selector) => selector.includes(':root') || selector.includes(`[data-surface='${surface}']`)
  const tokens = {}
  for (const { selector, decls } of blocks) if (wanted(selector)) Object.assign(tokens, decls)
  return tokens
}

const resolve = (tokens, name, depth = 0) => {
  assert.ok(depth < 12, `var() chain too deep or cyclic at ${name}`)
  const value = tokens[name]
  assert.ok(value !== undefined, `token ${name} is not defined`)
  const ref = value.match(/^var\((--[\w-]+)\)$/)
  return ref ? resolve(tokens, ref[1], depth + 1) : value.toLowerCase()
}

const channel = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
const luminance = (hex) => {
  assert.match(hex, /^#[0-9a-f]{6}$/, `${hex} is not a resolved #rrggbb colour`)
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16) / 255))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const TEXT = 4.5
const UI = 3

// [foreground token, background token, minimum ratio]
const PAIRS = {
  light: [
    ['--text-primary', '--surface', TEXT], ['--text-primary', '--surface-muted', TEXT], ['--text-primary', '--surface-hover', TEXT], ['--text-primary', '--page-bg', TEXT],
    ['--text-body', '--surface', TEXT], ['--text-body', '--surface-muted', TEXT], ['--text-body', '--page-bg', TEXT],
    ['--text-secondary', '--surface', TEXT], ['--text-secondary', '--surface-muted', TEXT], ['--text-secondary', '--page-bg', TEXT],
    ['--text-muted', '--surface', TEXT], ['--text-muted', '--surface-muted', TEXT], ['--text-muted', '--page-bg', TEXT],
    ['--link', '--surface', TEXT], ['--link', '--surface-muted', TEXT],
    ['--tag-text', '--tag-bg', TEXT],
    ['--accent-text', '--surface', TEXT], ['--accent-text', '--page-bg', TEXT], ['--accent-text', '--surface-muted', TEXT],
    ['--hot', '--surface', TEXT], // the dark orange as text (sale price, error words)
    ['--on-control-solid', '--control-solid', TEXT],
    ['--on-control-solid', '--action-primary-hover', TEXT],
    ['--on-control-solid', '--accent-pressed', TEXT],
    ['--border-strong', '--surface', UI], ['--border-strong', '--surface-muted', UI],
    ['--control-edge', '--surface', UI], ['--control-edge', '--accent', UI], ['--control-edge', '--control-solid', UI],
    ['--focus-ring', '--surface', UI], ['--focus-ring', '--surface-muted', UI],
  ],
  dark: [
    ['--text-primary', '--surface', TEXT], ['--text-primary', '--surface-muted', TEXT], ['--text-primary', '--surface-hover', TEXT],
    ['--text-body', '--surface', TEXT], ['--text-body', '--surface-muted', TEXT],
    ['--text-secondary', '--surface', TEXT], ['--text-secondary', '--surface-muted', TEXT],
    ['--text-muted', '--surface', TEXT], ['--text-muted', '--surface-muted', TEXT],
    ['--link', '--surface', TEXT], ['--link', '--surface-muted', TEXT],
    ['--tag-text', '--tag-bg', TEXT],
    ['--accent-text', '--surface', TEXT], ['--accent-text', '--surface-muted', TEXT],
    ['--on-control-solid', '--control-solid', TEXT],
    ['--border-strong', '--surface', UI],
    ['--control-edge', '--surface', UI],
    ['--focus-ring', '--surface', UI], ['--focus-ring', '--surface-muted', UI],
  ],
}

// Fixed (surface-independent) fills and the text drawn on them; checked once per surface so a flip cannot break them.
const FIXED_PAIRS = [
  ['--on-accent', '--accent', TEXT], ['--on-accent', '--accent-hover', TEXT], ['--on-accent', '--accent-pressed', TEXT],
  ['--on-action-primary', '--action-primary', TEXT], ['--on-action-primary', '--action-primary-hover', TEXT],
  ['--on-color', '--hot', TEXT],
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ['--on-color', `--category-tone-${n}`, TEXT]),
]

const check = (tokens, [fg, bg, min]) => {
  const ratio = contrast(resolve(tokens, fg), resolve(tokens, bg))
  assert.ok(ratio >= min, `${fg} on ${bg} is ${ratio.toFixed(2)}:1, needs ${min}:1 (${resolve(tokens, fg)} on ${resolve(tokens, bg)})`)
}

for (const surface of ['light', 'dark']) {
  test(`${surface} surface: text, link, tag and control pairs hold their contrast`, () => {
    const tokens = surfaceTokens(surface)
    for (const pair of PAIRS[surface]) check(tokens, pair)
  })

  test(`${surface} surface: the orange accent, hot and category fills hold their text contrast`, () => {
    const tokens = surfaceTokens(surface)
    for (const pair of FIXED_PAIRS) check(tokens, pair)
  })
}

test('the orange is the accent and the solid control on the light surface', () => {
  const tokens = surfaceTokens('light')
  assert.equal(resolve(tokens, '--accent'), '#f6821f')
  assert.equal(resolve(tokens, '--control-solid'), '#f6821f')
  assert.equal(resolve(tokens, '--action-primary'), '#f6821f')
  assert.equal(resolve(tokens, '--ink-800'), '#404041')
})

test('the contrast maths matches known WCAG values', () => {
  assert.equal(contrast('#ffffff', '#000000').toFixed(2), '21.00')
  assert.equal(contrast('#ffffff', '#ffffff').toFixed(2), '1.00')
  assert.ok(contrast('#ffffff', '#f6821f') < 3, 'white on the Cloudflare orange is under 3:1, which is why the text on it is ink')
})
