#!/usr/bin/env node
// Design-token lint: flags raw values in .astro <style> blocks and .css files that have a design
// token (the token file is this package's src/tokens/index.css):
//   - hex colors equal to — or within 4/255 per channel of — a token color → var(--token)
//   - font-size/line-height/weight/family sets that are a named design text style → font: var(--type-*)
//   - font-size px equal to a --font-size-* token; padding/gap/margin px equal to a --space-* token;
//     border-radius px equal to a --radius-* token
// A line containing `token-lint-ignore` is skipped (use it, with a reason, for values the design itself has
// no token for). Usage: token-lint <file-or-dir>… [--summary]. Exits 1 when anything is found.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const normHex = (h) => {
  let x = h.toLowerCase().replace('#', '')
  if (x.length === 3) x = [...x].map((c) => c + c).join('')
  if (x.length === 8 && x.endsWith('ff')) x = x.slice(0, 6)
  return '#' + x
}

const loadTokens = () => {
  const css = readFileSync(fileURLToPath(new URL('../src/tokens/index.css', import.meta.url)), 'utf8')
  const root = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')))
  const decls = {}
  for (const m of root.matchAll(/--([\w-]+):\s*([^;]+);/g)) decls[m[1]] = m[2].trim()
  const resolve = (v, depth = 0) => {
    const m = v.match(/^var\(--([\w-]+)\)$/)
    return m && depth < 10 && decls[m[1]] ? resolve(decls[m[1]], depth + 1) : v
  }
  const colors = new Map() // hex → [token…]
  const spaces = new Map() // px → token
  const radii = new Map()
  const fontSizes = new Map()
  const tileBreakpoints = new Set()
  const types = [] // { name, weight, size, lineHeight, family, tracking }
  for (const [name, raw] of Object.entries(decls)) {
    const tm = name.startsWith('type-') && raw.match(/^(\d+)\s+([\d.]+)px\s*\/\s*([\d.]+)px\s+var\(--font-(display|body)\)$/)
    if (tm) {
      const style = name.slice(5)
      types.push({ name, weight: Number(tm[1]), size: Number(tm[2]), lineHeight: Number(tm[3]), family: tm[4], tracking: decls[`tracking-${style}`] ?? '0px' })
      continue
    }
    const value = resolve(raw)
    if (/^#[0-9a-f]{3,8}$/i.test(value)) {
      const hex = normHex(value)
      const isPrimitive = !raw.startsWith('var(')
      const list = colors.get(hex) ?? []
      if (isPrimitive) list.unshift(name)
      else list.push(name)
      colors.set(hex, list)
    } else if (name.startsWith('space-')) spaces.set(value, name)
    else if (name.startsWith('radius-')) radii.set(value, name)
    else if (name.startsWith('font-size-')) fontSizes.set(value, name)
    else if (name.startsWith('tile-breakpoint-')) tileBreakpoints.add(value)
  }
  return { decls, colors, spaces, radii, fontSizes, tileBreakpoints, types, normHex }
}

const args = process.argv.slice(2)
const isSummary = args.includes('--summary')
const T = loadTokens()
const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const nearestColor = (hex) => {
  const exact = T.colors.get(hex)
  if (exact) return { token: exact[0], isExact: true }
  const [r, g, b] = hexToRgb(hex)
  let best = null
  for (const [h, names] of T.colors) {
    const [r2, g2, b2] = hexToRgb(h)
    const d = Math.max(Math.abs(r - r2), Math.abs(g - g2), Math.abs(b - b2))
    if (d <= 4 && (!best || d < best.d)) best = { token: names[0], d }
  }
  return best ? { token: best.token, isExact: false } : null
}

const files = []
const walk = (p) => {
  if (statSync(p).isDirectory()) for (const f of readdirSync(p)) walk(join(p, f))
  else if (/\.(astro|css)$/.test(p) && !p.endsWith('tokens/index.css')) files.push(p)
}
for (const a of args.filter((x) => !x.startsWith('--'))) walk(a)

const findings = []
for (const file of files) {
  const src = readFileSync(file, 'utf8')
  const lines = src.split('\n')
  let inStyle = file.endsWith('.css')
  lines.forEach((line, i) => {
    if (/<style\b/.test(line)) inStyle = true
    if (/<\/style>/.test(line)) inStyle = false
    if (!inStyle || line.includes('token-lint-ignore')) return
    const report = (msg) => findings.push({ file, line: i + 1, msg, text: line.trim() })
    for (const m of line.matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g)) {
      const hex = T.normHex(m[0])
      const n = nearestColor(hex)
      if (n) report(`${m[0]} → var(--${n.token})${n.isExact ? '' : ' (≈)'}`)
    }
    const tileQuery = line.match(/@container\s+content-tile\s*\(\s*width\s*<\s*(\d+(?:\.\d+)?px)\s*\)/)
    if (tileQuery && !T.tileBreakpoints.has(tileQuery[1])) report(`content-tile query ${tileQuery[1]} is not a --tile-breakpoint-* token`)
    const prop = line.match(/^\s*([a-z-]+)\s*:\s*([^;]+);/)
    if (!prop) return
    const [, name, value] = prop
    if (/^(padding|gap|row-gap|column-gap|margin)(-|$)/.test(name)) {
      for (const px of value.matchAll(/(?<![\w.-])(\d+(?:\.\d+)?)px/g)) if (T.spaces.get(`${px[1]}px`)) report(`${name} ${px[0]} → var(--${T.spaces.get(`${px[1]}px`)})`)
    }
    if (name === 'border-radius') for (const px of value.matchAll(/(\d+(?:\.\d+)?)px/g)) if (T.radii.get(`${px[1]}px`)) report(`radius ${px[0]} → var(--${T.radii.get(`${px[1]}px`)})`)
    if (name === 'font-size' && /^\d/.test(value) && T.fontSizes.get(value.trim())) report(`font-size ${value} → var(--${T.fontSizes.get(value.trim())}) or a --type-* style`)
  })
  // text-style detection per rule block: font-size + line-height (+ weight/family) matching a DS style
  for (const m of src.matchAll(/\{([^{}]*)\}/g)) {
    const body = m[1]
    if (/font:\s*var\(--type-/.test(body)) continue
    const get = (p) => body.match(new RegExp(`(?:^|[;\\s])${p}\\s*:\\s*([^;]+);`))?.[1]?.trim()
    const fs = get('font-size'), lh = get('line-height')
    if (!fs || !lh) continue
    const size = parseFloat(fs.replace(/var\(--font-size-(\d+)\)/, '$1'))
    const lineHeight = lh.endsWith('px') ? parseFloat(lh) : Math.round(parseFloat(lh) * size)
    const fam = /font-display/.test(get('font-family') ?? '') ? 'display' : 'body'
    const weight = Number(get('font-weight') ?? 400)
    const hit = T.types.find((t) => t.size === size && t.lineHeight === lineHeight && t.family === fam && t.weight === weight)
    if (hit) {
      const line = src.slice(0, m.index).split('\n').length
      findings.push({ file, line, msg: `text style ${fam} ${weight} ${size}/${lineHeight} → font: var(--${hit.name})`, text: '' })
    }
  }
}

if (isSummary) {
  const byFile = new Map()
  for (const f of findings) byFile.set(f.file, (byFile.get(f.file) ?? 0) + 1)
  for (const [f, n] of [...byFile].sort((a, b) => b[1] - a[1])) console.log(String(n).padStart(4), f)
} else for (const f of findings) console.log(`${f.file}:${f.line}  ${f.msg}${f.text ? `   | ${f.text}` : ''}`)
console.log(`\n${findings.length} finding(s) in ${files.length} file(s)`)
if (findings.length > 0) process.exitCode = 1
