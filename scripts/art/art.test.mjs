import { stat } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { HOTSPOTS } from './hotspots.mjs'
import { OUT_DIR } from './index.mjs'
import { MANIFEST } from './manifest.mjs'

const KEBAB_PNG = /^[a-z0-9]+(-[a-z0-9]+)*\.png$/
const MAX_BYTES = 200 * 1024

it('the manifest lists 59 uniquely named lowercase kebab-case PNG files', () => {
  expect(MANIFEST).toHaveLength(59)
  const names = MANIFEST.map((entry) => entry.file)
  expect(new Set(names).size, 'duplicate file name').toBe(names.length)
  for (const name of names) expect(name).toMatch(KEBAB_PNG)
})

it('every manifest entry has a PNG on disk with the declared pixel size, under 200 KB', async () => {
  for (const entry of MANIFEST) {
    const file = path.join(OUT_DIR, entry.file)
    const { size } = await stat(file)
    expect(size, entry.file).toBeLessThanOrEqual(MAX_BYTES)
    const meta = await sharp(file).metadata()
    expect(meta.format, entry.file).toBe('png')
    expect([meta.width, meta.height], entry.file).toEqual([entry.w, entry.h])
  }
})

it('variant products follow the file contract (<slug>.png, <slug>-2.png, <slug>-<colour>.png)', () => {
  const names = new Set(MANIFEST.map((entry) => entry.file))
  const expected = {
    'workers-tee': ['', '-2', '-amber', '-black', '-white'],
    'zero-trust-tee': ['', '-2', '-white'],
    'edge-hoodie': ['', '-2', '-orange'],
    'packet-jacket': ['', '-2', '-orange'],
    'workers-fit-bundle': ['', '-2', '-orange'],
  }
  for (const [slug, suffixes] of Object.entries(expected)) {
    for (const suffix of suffixes) expect(names.has(`${slug}${suffix}.png`), `${slug}${suffix}.png`).toBe(true)
  }
})

const points = (group) => Object.entries(group).flatMap(([name, p]) => [[`${name}.x`, p.x], [`${name}.y`, p.y]])

it('hotspot coordinates are percentages between 0 and 100', () => {
  for (const [scene, group] of Object.entries(HOTSPOTS)) {
    for (const [label, value] of points(group)) {
      expect(Number.isFinite(value) && value >= 0 && value <= 100, `${scene}.${label} = ${value}`).toBe(true)
    }
  }
})

it('look-desk hotspots sit at least 12 points apart so numbered markers do not overlap', () => {
  const entries = Object.entries(HOTSPOTS.lookDesk)
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const [a, pa] = entries[i]
      const [b, pb] = entries[j]
      expect(Math.hypot(pa.x - pb.x, pa.y - pb.y), `${a} and ${b} are too close`).toBeGreaterThanOrEqual(12)
    }
  }
})
