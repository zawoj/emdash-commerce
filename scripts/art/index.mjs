// Renders the merch art (SVG strings -> PNG via sharp) into apps/storefront/public/merch/.
// Usage: node scripts/art/index.mjs [file-name.png ...]   (no arguments renders everything)
import { mkdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { MANIFEST } from './manifest.mjs'

export const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../apps/storefront/public/merch')

export const renderEntry = async (entry, outDir = OUT_DIR) => {
  const svg = entry.draw()
  const target = path.join(outDir, entry.file)
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true, colours: 128, effort: 10, dither: 0 }).toFile(target)
  return { file: entry.file, bytes: (await stat(target)).size }
}

const main = async () => {
  const wanted = process.argv.slice(2)
  const unknown = wanted.filter((name) => !MANIFEST.some((entry) => entry.file === name))
  if (unknown.length > 0) throw new Error(`Unknown file(s): ${unknown.join(', ')}`)
  const entries = wanted.length > 0 ? MANIFEST.filter((entry) => wanted.includes(entry.file)) : MANIFEST
  await mkdir(OUT_DIR, { recursive: true })
  let total = 0
  for (const entry of entries) {
    const { file, bytes } = await renderEntry(entry)
    total += bytes
    console.log(`${file.padEnd(34)} ${entry.w}x${entry.h}  ${(bytes / 1024).toFixed(1)} KB`)
  }
  console.log(`rendered ${entries.length} file(s), ${(total / 1024).toFixed(0)} KB total -> ${path.relative(process.cwd(), OUT_DIR)}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
