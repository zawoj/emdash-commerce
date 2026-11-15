#!/usr/bin/env node
// Wireframe lint: the design system is a blue wireframe with no decoration. This fails on anything that
// decorates, in `<style>` blocks of .astro files and in .css files (package and app):
//   radius (anything but 0 or a --radius-* token), box-shadow / drop-shadow, gradients, blur,
//   uppercase / capitalize, non-zero letter-spacing, rotate / skew / scale, transform / translate other
//   than centring, @keyframes / animation / transition / @starting-style, the motion tokens, raw colours
//   (hex, rgb(), hsl(), named) outside the token file, the removed brand tokens, webfonts, `filter` on a
//   photo, and (in tokens/index.css) a non-square radius, tracking, a red --hot or a hue outside the ink ramp.
// A line carrying `wireframe-ignore: <reason>` is skipped (use it, with the reason, for the one-colour
// logo silhouette). Usage: wireframe-lint <file-or-dir>… ; exits 1 when anything is found.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const RULES = {
  radius: 'border-radius must be 0 or a --radius-* token',
  shadow: 'box-shadow must be none (an outline is a border or outline)',
  gradient: 'no gradients (the scrim is a flat colour)',
  blur: 'no blur or backdrop-filter',
  case: 'no text-transform: uppercase / capitalize',
  tracking: 'no letter-spacing other than 0',
  stretch: 'no font-stretch other than 100%',
  rotate: 'no rotate / skew / scale',
  transform: 'no transform or translate other than centring (translate(-50%, …))',
  motion: 'no @keyframes, animation, transition or @starting-style',
  'motion-token': 'no hover-zoom / duration / ease tokens in components',
  colour: 'raw colour outside the tokens',
  brand: 'removed brand token (volt, shadow-overlay)',
  font: 'no webfont and no font-family other than var(--font-*)',
  photo: 'filter on a photo overrides the global tint',
  tokens: 'token file value breaks the wireframe',
}

const NAMED_COLOURS = 'white|black|red|green|blue|gray|grey|yellow|orange|purple|pink|brown|navy|teal|lime|silver|gold|cyan|magenta'
const CENTRING = /^(translate|translateX|translateY)\(\s*-?50%(\s*,\s*-?50%)?\s*\)$|^translate:\s*-50%/

const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))

const hexHue = (hex) => {
  const h = hex.length === 4 ? [...hex.slice(1)].map((c) => c + c).join('') : hex.slice(1, 7)
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  if (max - min < 0.02) return null // grey
  const d = max - min
  const hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return (hue * 60 + 360) % 360
}

// Lines of a file that are CSS: the whole file for .css, the <style> blocks for .astro.
const cssLines = (file, text) => {
  const lines = stripComments(text).split('\n')
  const raw = text.split('\n')
  let inStyle = file.endsWith('.css')
  const out = []
  lines.forEach((line, i) => {
    if (/<style\b/.test(line)) inStyle = true
    const isCss = inStyle
    if (/<\/style>/.test(line)) inStyle = false
    if (isCss && !/wireframe-ignore:/.test(raw[i])) out.push({ n: i + 1, line })
  })
  return out
}

export const lintText = (file, text) => {
  const findings = []
  const isTokenFile = /tokens\/index\.css$/.test(file)
  for (const { n, line } of cssLines(file, text)) {
    const add = (rule, detail) => findings.push({ file, line: n, rule, msg: `${RULES[rule]}${detail ? ` (${detail})` : ''}`, text: line.trim() })
    const decl = line.match(/(?:^|[\s;{])(-{0,2}[a-z][\w-]*)\s*:\s*([^;]*)/)
    const prop = decl?.[1]
    const value = (decl?.[2] ?? '').replace(/\s*!important\s*$/, '').trim()
    if (/@keyframes|@starting-style/.test(line)) add('motion', line.trim())
    if (/(?:drop-shadow)\(/.test(line)) add('shadow', 'drop-shadow')
    if (/-gradient\(/.test(line)) add('gradient')
    if (/backdrop-filter|\bblur\(/.test(line)) add('blur')
    if (/(?<![\w-])(rotate[XYZ3d]*|skew[XY]?|scale[XYZ3d]*)\s*\(/.test(line) || /(?:^|[\s;{])(rotate|scale)\s*:/.test(line)) add('rotate')
    if (/@font-face|@fontsource/.test(line)) add('font')
    if (/var\(--(hover-zoom|duration-(fast|base|slow)|ease-(in|in-out))\)/.test(line)) add('motion-token')
    if (/var\(--(volt|volt-strong|on-volt|shadow-overlay)\)|^\s*--(volt|volt-strong|on-volt|shadow-overlay)\s*:/.test(line)) add('brand')
    if (!prop) continue
    if (!isTokenFile) {
      if (/^border(-[a-z]+)*-radius$/.test(prop) && !value.split(/[\s/]+/).every((v) => v === '0' || v === 'inherit' || /^var\(--radius(-[\w-]+)?\)$/.test(v) || v === '')) add('radius', value)
      if (prop === 'box-shadow' && !/^(none|inherit|unset)$/.test(value)) add('shadow', value)
      if (/^(animation|transition)(-[a-z-]+)?$/.test(prop) && value !== 'none') add('motion', `${prop}: ${value}`)
      if (prop === 'text-transform' && /uppercase|capitalize|lowercase/.test(value)) add('case', value)
      if (prop === 'letter-spacing' && !/^(0|0px|normal|inherit|unset|var\(--tracking-[\w-]+\))$/.test(value)) add('tracking', value)
      if (prop === 'font-stretch' && !/^(100%|normal|var\(.+\))$/.test(value)) add('stretch', value)
      if (prop === 'transform' && value !== 'none' && !CENTRING.test(value)) add('transform', value)
      if (prop === 'translate' && value !== 'none' && !/^(0|-?50%)(\s+(0|-?50%))?$/.test(value)) add('transform', value)
      if (prop === 'font-family' && !/^(var\(--font-[\w-]+\)|inherit|monospace|ui-monospace\b.*)$/.test(value)) add('font', value)
      if (prop === 'filter' && !/^(none|var\(--(logo-filter-(ink|muted)|image-filter)\))$/.test(value)) add('photo', value)
      const afterColon = line.slice(line.indexOf(':') + 1)
      if (/#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/.test(afterColon) || new RegExp(`(?:^|[\\s:,(])(${NAMED_COLOURS})(?=[\\s;,)]|$)`, 'i').test(afterColon) && !/^(content|font|grid|animation-name|will-change|counter)/.test(prop)) add('colour', value)
    } else {
      if (/^--radius-/.test(prop) && value !== '0') add('tokens', `${prop}: ${value}`)
      if (/^--tracking-/.test(prop) && value !== '0') add('tokens', `${prop}: ${value}`)
      if (/^--(text|label)-case$/.test(prop) && value !== 'none') add('tokens', `${prop}: ${value}`)
      if (prop === '--hot' && value !== 'var(--ink-700)') add('tokens', `${prop}: ${value}`)
      if (/^--image-scrim$/.test(prop) && /gradient/.test(value)) add('gradient')
      for (const hex of value.match(/#[0-9a-fA-F]{6}\b/g) ?? []) {
        const hue = hexHue(hex)
        if (hue !== null && (hue < 205 || hue > 240)) add('tokens', `${hex} has hue ${Math.round(hue)}deg, outside the blue ramp`)
      }
    }
  }
  return findings
}

const SKIP = /(^|\/)(node_modules|dist|\.astro)(\/|$)|apps\/storefront\/src\/styles\/tokens\.css$/
const walk = (p, files) => {
  if (SKIP.test(p)) return
  if (statSync(p).isDirectory()) for (const f of readdirSync(p)) walk(join(p, f), files)
  else if (/\.(astro|css)$/.test(p)) files.push(p)
}

export const lintPaths = (paths) => {
  const files = []
  for (const p of paths) walk(p, files)
  return { files, findings: files.flatMap((f) => lintText(f, readFileSync(f, 'utf8'))) }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { files, findings } = lintPaths(process.argv.slice(2).filter((a) => !a.startsWith('--')))
  const summary = process.argv.includes('--summary')
  if (summary) {
    const by = new Map()
    for (const f of findings) by.set(f.rule, (by.get(f.rule) ?? 0) + 1)
    for (const [r, c] of [...by].sort((a, b) => b[1] - a[1])) console.log(String(c).padStart(5), r)
  } else for (const f of findings) console.log(`${f.file}:${f.line}  [${f.rule}] ${f.msg}   | ${f.text}`)
  console.log(`\nwireframe-lint: ${findings.length} finding(s) in ${files.length} file(s)`)
  if (findings.length > 0) process.exitCode = 1
}
