import { CATEGORY, LIMITS, SEVERITY } from './constants'
import { cssPath, isIgnored } from './selector'
import type { AuditIssue } from './types'

const issue = (id: string, severity: AuditIssue['severity'], message: string, element?: Element): AuditIssue => ({
  id,
  category: CATEGORY.PERFORMANCE,
  severity,
  message,
  selector: element ? cssPath(element) : undefined,
})

const imageName = (img: HTMLImageElement): string => (img.currentSrc || img.src).split('/').pop()?.split('?')[0] || 'image'

const isBelowFold = (img: HTMLImageElement, viewportHeight: number): boolean => img.getBoundingClientRect().top > viewportHeight

const checkImage = (img: HTMLImageElement, viewportHeight: number): AuditIssue[] => {
  const issues: AuditIssue[] = []
  const name = imageName(img)
  if (!img.getAttribute('width') || !img.getAttribute('height')) {
    issues.push(issue('perf-img-dimensions', SEVERITY.WARNING, `${name}: no width/height attributes — causes layout shift.`, img))
  }
  if (img.loading !== 'lazy' && isBelowFold(img, viewportHeight)) {
    issues.push(issue('perf-img-lazy', SEVERITY.INFO, `${name}: below the fold but not loading="lazy".`, img))
  }
  const rendered = img.getBoundingClientRect().width
  if (rendered > 0 && img.naturalWidth > rendered * LIMITS.IMAGE_OVERSIZE_RATIO) {
    issues.push(issue('perf-img-oversized', SEVERITY.WARNING, `${name}: ${img.naturalWidth}px wide but shown at ${Math.round(rendered)}px.`, img))
  }
  return issues
}

export const perfChecks = (doc: Document, viewportHeight = doc.defaultView?.innerHeight ?? 0): AuditIssue[] => {
  const images = [...doc.body.querySelectorAll('img')].filter((img) => !isIgnored(img))
  const issues = images.flatMap((img) => checkImage(img, viewportHeight))
  const nodes = doc.body.querySelectorAll('*').length
  if (nodes > LIMITS.DOM_NODES_WARN) issues.push(issue('perf-dom-size', SEVERITY.WARNING, `${nodes} DOM nodes (above ${LIMITS.DOM_NODES_WARN}) — large DOMs slow rendering.`))
  const origin = doc.location?.origin
  const external = [...doc.querySelectorAll<HTMLScriptElement>('script[src]')].filter((s) => origin && new URL(s.src, origin).origin !== origin)
  for (const script of external) issues.push(issue('perf-third-party-script', SEVERITY.INFO, `Third-party script: ${new URL(script.src).host}`, script))
  return issues
}
