#!/usr/bin/env node
/**
 * Enforce the `.ai/` layout documented in `.ai/README.md` (CI runs it as `pnpm check:ai`; the pack
 * ships it as `scripts/check-ai-structure.mjs`, and the pack's tests run it on every packed starter):
 *   - the folders exist: decisions/, runs/, memory/
 *   - every file in decisions/ and runs/ is `YYYY-MM-DD-slug.md` with a real date and a lowercase
 *     kebab-case ASCII slug; neither holds subfolders (status is not encoded in a folder)
 *   - memory/MEMORY.md exists, every memory/*.md (except the index) is linked from it exactly once,
 *     and every link in the index points at a file that exists
 *   - monorepo only (the `.ai` folder has a `docs` folder, which a packed starter lacks): every
 *     relative Markdown link in `.ai`, `AGENTS.md` and under `apps` resolves; every file in that
 *     docs folder is linked from somewhere; each app's own `.ai` holds only `memory/`, and each of
 *     its files has a `# heading` and a `description:` (the pack builds that starter's memory
 *     index from them); memory files are kebab-case, their `name:` equals the file name, every
 *     `[[name]]` link resolves, and a repo path in backticks (`.ai/…`, `tools/…`, `packages/…`,
 *     `plugins/…`, `apps/<app>/…`) with a file extension or a trailing slash points at something that
 *     exists
 * Dotfiles (`.gitkeep`) are ignored. Exits 1 and lists the problems otherwise.
 *
 * Usage: node check-ai-structure.mjs [projectRoot]   (default: the current directory — run it from the repo root)
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const DATED_FOLDERS = ['decisions', 'runs']
const REQUIRED_FOLDERS = [...DATED_FOLDERS, 'memory']
const MEMORY_INDEX = 'MEMORY.md'
const NAME_RE = /^(\d{4})-(\d{2})-(\d{2})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/

const isRealDate = (year, month, day) => {
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export const isValidDatedName = (name) => {
  const match = NAME_RE.exec(name)
  return match !== null && isRealDate(Number(match[1]), Number(match[2]), Number(match[3]))
}

const visibleEntries = (dir) => readdirSync(dir).filter((name) => !name.startsWith('.'))

const namingProblems = (aiDir, folder) => {
  const dir = join(aiDir, folder)
  if (!existsSync(dir)) return []
  return visibleEntries(dir).flatMap((name) => {
    const isFolder = statSync(join(dir, name)).isDirectory()
    if (isFolder) return [`.ai/${folder}/${name}/ is not allowed — .ai/${folder}/ holds dated files only`]
    return isValidDatedName(name) ? [] : [`.ai/${folder}/${name} must be named YYYY-MM-DD-slug.md (real date, lowercase kebab-case slug)`]
  })
}

const memoryProblems = (aiDir) => {
  const dir = join(aiDir, 'memory')
  const indexFile = join(dir, MEMORY_INDEX)
  if (!existsSync(dir)) return []
  if (!existsSync(indexFile)) return [`.ai/memory/${MEMORY_INDEX} is missing`]
  const linked = [...readFileSync(indexFile, 'utf8').matchAll(/\]\(([^)\s#]+\.md)\)/g)].map((m) => m[1])
  const entries = readdirSync(dir).filter((name) => name.endsWith('.md') && name !== MEMORY_INDEX)
  return [
    ...entries.filter((name) => !linked.includes(name)).map((name) => `.ai/memory/${name} is not in the index`),
    ...entries.filter((name) => linked.filter((l) => l === name).length > 1).map((name) => `.ai/memory/${name} is indexed more than once`),
    ...linked.filter((l) => !existsSync(join(dir, l))).map((l) => `.ai/memory/${MEMORY_INDEX} links to ${l}, which does not exist`),
  ]
}

// `.pack/` holds files that exist only in a packed project (an AGENTS.md overlay): their paths are not the monorepo's.
const SKIPPED_DIRS = new Set(['node_modules', '.git', '.astro', 'dist', '.pack'])

const markdownFiles = (dir) =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        if (SKIPPED_DIRS.has(entry.name)) return []
        const path = join(dir, entry.name)
        if (entry.isDirectory()) return markdownFiles(path)
        return entry.name.endsWith('.md') ? [path] : []
      })
    : []

/** Relative link targets of a Markdown file; code fences and inline code are examples, not links. */
const linkTargets = (file) => {
  const text = readFileSync(file, 'utf8').replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '')
  return [...text.matchAll(/\]\(([^)\s]+)\)/g)]
    .map((m) => m[1].split('#')[0])
    .filter((target) => target && !/^(https?:|mailto:|t3-|\/)/.test(target) && !/[<{]/.test(target))
}

const resolveTarget = (file, target) => {
  const path = resolve(dirname(file), target)
  if (!existsSync(path)) return undefined
  if (!statSync(path).isDirectory()) return [path]
  return markdownFiles(path)
}

const KEBAB_MD_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/
const REPO_PATH_RE = /`((?:\.ai|tools|packages|plugins|apps\/[a-z0-9-]+)\/[A-Za-z0-9_.\/-]*[A-Za-z0-9_\/])`/g

const withoutExamples = (text) => text.replace(/```[\s\S]*?```/g, '').replace(/<!--[\s\S]*?-->/g, '')

/** Memory files of the monorepo and of every app: names, `name:` and `[[links]]`. */
const memoryFiles = (root) => {
  const dirs = [join(root, '.ai', 'memory'), ...(existsSync(join(root, 'apps')) ? readdirSync(join(root, 'apps')).map((app) => join(root, 'apps', app, '.ai', 'memory')) : [])]
  return dirs.filter(existsSync).flatMap((dir) => readdirSync(dir).filter((name) => name.endsWith('.md') && name !== MEMORY_INDEX).map((name) => join(dir, name)))
}

const memoryContentProblems = (root) => {
  const files = memoryFiles(root)
  const slugs = new Set(files.map((file) => file.replace(/^.*\//, '').replace(/\.md$/, '')))
  return files.flatMap((file) => {
    const label = relative(root, file)
    const base = file.replace(/^.*\//, '')
    const text = readFileSync(file, 'utf8')
    const declared = /^name:\s*"?([^"\n]+?)"?\s*$/m.exec(text.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? '')?.[1]
    return [
      ...(KEBAB_MD_RE.test(base) ? [] : [`${label} must be kebab-case (lowercase words joined by -)`]),
      ...(declared && declared !== base.replace(/\.md$/, '') ? [`${label} declares name: ${declared}, which is not its file name`] : []),
      ...[...text.matchAll(/\[\[([^\]]+)\]\]/g)].filter((m) => !slugs.has(m[1])).map((m) => `${label} links to [[${m[1]}]], which is not a memory file`),
    ]
  })
}

/**
 * A dated decision or run log is a record of one day, so it may quote a repo path that a later
 * change removed. Living docs, memory and `AGENTS.md` may not — they describe what exists now.
 */
const isDatedRecord = (root, file) => DATED_FOLDERS.some((folder) => relative(root, file).startsWith(`.ai/${folder}/`))

const repoPathProblems = (root, files) =>
  files
    .filter((file) => !isDatedRecord(root, file))
    .flatMap((file) =>
      [...withoutExamples(readFileSync(file, 'utf8')).matchAll(REPO_PATH_RE)]
        .map((m) => m[1])
        .filter((path) => /\.[a-z0-9]+$|\/$/.test(path) && !/YYYY|\.env$/.test(path) && !existsSync(join(root, path)))
        .map((path) => `${relative(root, file)} mentions ${path}, which does not exist`),
    )

const monorepoProblems = (root) => {
  const docsDir = join(root, '.ai', 'docs')
  if (!existsSync(docsDir)) return []
  const rel = (path) => relative(root, path)
  const files = [...markdownFiles(join(root, '.ai')), ...markdownFiles(join(root, 'apps')), join(root, 'AGENTS.md')].filter(existsSync)
  const linkedFrom = new Map()
  const broken = files.flatMap((file) =>
    linkTargets(file).flatMap((target) => {
      const resolved = resolveTarget(file, target)
      if (!resolved) return [`${rel(file)} links to ${target}, which does not exist`]
      for (const path of resolved) if (path !== file) linkedFrom.set(path, file)
      return []
    }),
  )
  const orphans = markdownFiles(docsDir)
    .filter((file) => !linkedFrom.has(file))
    .map((file) => `${rel(file)} is not linked from any other Markdown file`)
  return [...broken, ...orphans, ...starterMemoryProblems(root), ...memoryContentProblems(root), ...repoPathProblems(root, files)]
}

const starterMemoryProblems = (root) => {
  const appsDir = join(root, 'apps')
  if (!existsSync(appsDir)) return []
  return readdirSync(appsDir).flatMap((app) => {
    const aiDir = join(appsDir, app, '.ai')
    if (!existsSync(aiDir)) return []
    const label = `apps/${app}/.ai`
    const stray = visibleEntries(aiDir).filter((name) => name !== 'memory').map((name) => `${label}/${name} is not allowed — an app's .ai/ holds memory/ only`)
    const memoryDir = join(aiDir, 'memory')
    const files = existsSync(memoryDir) ? readdirSync(memoryDir).filter((name) => name.endsWith('.md') && name !== MEMORY_INDEX) : []
    const incomplete = files.flatMap((name) => {
      const text = readFileSync(join(memoryDir, name), 'utf8')
      const body = text.replace(/^---\n[\s\S]*?\n---\n/, '')
      return [
        ...(/^description:\s*\S/m.test(text.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? '') ? [] : [`${label}/memory/${name} needs a description: in its frontmatter (it becomes the index line)`]),
        ...(/^#\s+\S/m.test(body) ? [] : [`${label}/memory/${name} needs a # heading (it becomes the index title)`]),
      ]
    })
    return [...stray, ...incomplete]
  })
}

/** Every problem under `<root>/.ai`, as human-readable lines. */
export const findProblems = (root) => {
  const aiDir = join(root, '.ai')
  if (!existsSync(aiDir)) return ['.ai/ is missing']
  const missing = REQUIRED_FOLDERS.filter((folder) => !existsSync(join(aiDir, folder))).map((folder) => `.ai/${folder}/ is missing`)
  return [
    ...missing,
    ...DATED_FOLDERS.flatMap((folder) => namingProblems(aiDir, folder)),
    ...memoryProblems(aiDir),
    ...monorepoProblems(root),
  ]
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isCli) {
  const root = resolve(process.argv[2] ?? process.cwd())
  const problems = findProblems(root)
  if (problems.length) {
    console.error(`check-ai-structure: ${problems.length} problem(s)\n  ${problems.join('\n  ')}`)
    process.exit(1)
  }
  console.log('check-ai-structure: .ai/ layout, names and memory index are consistent')
}
