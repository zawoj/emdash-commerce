import { TOOL, type ToolId } from './constants'

const svg = (body: string): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`

export const ICONS: Record<ToolId, string> = {
  [TOOL.XRAY]: svg('<rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="3 3"/><rect x="7" y="7" width="10" height="4"/><rect x="7" y="13" width="6" height="4"/>'),
  [TOOL.INSPECT]: svg('<path d="M4 4l7 16 2.5-6.5L20 11z"/>'),
  [TOOL.NOTES]: svg('<path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 9h8M8 13h5"/>'),
  [TOOL.AUDIT]: svg('<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>'),
  [TOOL.ERRORS]: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5"/>'),
}

export const TITLES: Record<ToolId, string> = {
  [TOOL.XRAY]: 'X-ray — outline blocks, EmDash fields and islands',
  [TOOL.INSPECT]: 'Inspect — hover to see an element’s field, island and size; click it to comment and copy a prompt',
  [TOOL.NOTES]: 'Notes — your comments on elements; copy them as a prompt for an AI agent',
  [TOOL.AUDIT]: 'Audit — accessibility, SEO and performance',
  [TOOL.ERRORS]: 'Errors — script errors, failed requests and console output',
}
