// Proves the wireframe lint catches each decoration it exists to forbid, and passes the clean fixture.
// The fixtures are real .astro / .css files; the lint is run exactly as `pnpm test` runs it (as a CLI).
import { strict as assert } from 'node:assert'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { HOT_TOKEN_VALUE, lintText, RULES } from './wireframe-lint.mjs'

const here = (p) => fileURLToPath(new URL(p, import.meta.url))
const fixture = (name) => here(`./fixtures/wireframe/${name}`)
const lintFixture = (name) => lintText(fixture(name), readFileSync(fixture(name), 'utf8'))
const rulesOf = (findings) => new Set(findings.map((f) => f.rule))
const hit = (findings, needle) => findings.some((f) => f.text.includes(needle))

test('the clean fixture has no finding', () => {
  assert.deepEqual(lintFixture('clean.astro'), [])
})

test('every forbidden pattern is caught, each on its own line', () => {
  const findings = lintFixture('bad.astro')
  const expected = [
    ['radius', '.radius'],
    ['shadow', '.shadow'],
    ['shadow', '.ring'], // an inset ring is a shadow too: use a border or an outline
    ['gradient', 'linear-gradient'],
    ['blur', 'backdrop-filter'],
    ['case', 'uppercase'],
    ['tracking', 'letter-spacing'],
    ['stretch', 'font-stretch'],
    ['rotate', 'rotate(45deg)'],
    ['rotate', 'skewX'],
    ['rotate', 'scale: 1.1'],
    ['transform', 'translateY(100%)'],
    ['motion', 'animation: pulse'],
    ['motion', '@keyframes'],
    ['motion', 'transition: opacity'],
    ['motion', '@starting-style'],
    ['motion-token', '--hover-zoom'],
    ['colour', '#d7261e'],
    ['colour', 'rgb('],
    ['colour', 'color: red'],
    ['brand', '--volt'],
    ['font', 'Archivo'],
    ['photo', 'brightness(0.7)'],
  ]
  for (const [rule, needle] of expected) {
    assert.ok(findings.some((f) => f.rule === rule && f.text.includes(needle)), `${rule} not reported for "${needle}"`)
  }
  for (const rule of Object.keys(RULES).filter((r) => r !== 'tokens')) assert.ok(rulesOf(findings).has(rule), `rule ${rule} never fired`)
})

test('the token file must stay a wireframe', () => {
  const text = readFileSync(fixture('bad-tokens.css'), 'utf8')
  const findings = lintText('src/tokens/index.css', text)
  assert.ok(hit(findings, '--tracking-label'), 'non-zero tracking token')
  assert.ok(hit(findings, '--text-case'), 'uppercase case token')
  assert.ok(hit(findings, '--hot'), 'a --hot that is not the dark orange step')
  assert.ok(hit(findings, '#4caf50'), 'a green outside the warm range')
  assert.ok(hit(findings, '--ink-700: #d7261e'), 'a red hue (under 15deg) outside the warm range')
  assert.ok(hit(findings, '--image-scrim'), 'a gradient scrim')
})

test('the token file palette is grey or warm: a blue ramp fails, orange and charcoal pass', () => {
  const lint = (decl) => lintText('src/tokens/index.css', `:root {\n  ${decl}\n}\n`)
  assert.ok(hit(lint('--ink-600: #3a63d1;'), '#3a63d1'), 'the old blue ink fails')
  assert.ok(hit(lint('--ink-300: #b4c9fb;'), '#b4c9fb'), 'a pale blue fails')
  assert.ok(hit(lint('--x: #8a2be2;'), '#8a2be2'), 'a purple fails')
  assert.deepEqual(lint('--orange-500: #f6821f;'), [], 'the Cloudflare orange passes')
  assert.deepEqual(lint('--orange-300: #fbad41;'), [], 'the amber passes')
  assert.deepEqual(lint('--ink-800: #404041;'), [], 'the charcoal passes')
  assert.deepEqual(lint('--ink-0: #ffffff;'), [], 'white passes')
  assert.deepEqual(lint(`--hot: ${HOT_TOKEN_VALUE};`), [], '--hot as the dark orange step passes')
  assert.ok(hit(lint('--hot: var(--orange-500);'), '--hot'), '--hot as another step fails')
  assert.ok(hit(lint('--hot: var(--ink-700);'), '--hot'), 'the old ink --hot fails')
})

test('the real token file passes', () => {
  const file = here('../src/tokens/index.css')
  assert.deepEqual(lintText(file, readFileSync(file, 'utf8')), [])
})

test('the CLI exits 1 on a bad fixture and 0 on a clean one', () => {
  const cli = here('./wireframe-lint.mjs')
  const bad = spawnSync(process.execPath, [cli, fixture('bad.astro')], { encoding: 'utf8' })
  assert.equal(bad.status, 1)
  assert.match(bad.stdout, /bad\.astro:\d+ {2}\[radius]/)
  const clean = spawnSync(process.execPath, [cli, fixture('clean.astro')], { encoding: 'utf8' })
  assert.equal(clean.status, 0)
})

test('an ignore comment with a reason skips exactly its line', () => {
  const findings = lintText('a.css', '.a { filter: brightness(0); } /* x */\n.b { filter: brightness(0); /* wireframe-ignore: logo silhouette */ }')
  assert.deepEqual(findings.map((f) => f.line), [1])
})
