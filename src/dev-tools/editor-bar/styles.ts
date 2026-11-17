import { DEV_TOOLS, EMDASH, IGNORED_SELECTOR } from './constants'

const X = `html.${DEV_TOOLS.XRAY_CLASS}`
const NOT_OURS = `:not(:is(${IGNORED_SELECTOR}) *):not(:is(${IGNORED_SELECTOR}))`
const ROOT = `#${DEV_TOOLS.ROOT_ID}`
const PANEL = `#${DEV_TOOLS.PANEL_ID}`
const EMDASH_TOOLBAR = EMDASH.TOOLBAR_ID

// Colours of the X-ray outlines: layout, text, media, interactive, EmDash field, Astro island.
export const STYLES = `
${ROOT} { display: contents; }
${ROOT} .emdash-tb-devtool {
  position: relative; display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; padding: 0; border: 0; border-radius: 999px;
  background: transparent; color: #b0b0b0; cursor: pointer; transition: background .15s, color .15s;
}
${ROOT} .emdash-tb-devtool:hover { background: rgba(255,255,255,.1); color: #fff; }
${ROOT} .emdash-tb-devtool[aria-pressed="true"] { background: #3b82f6; color: #fff; }
${ROOT} .emdash-tb-devtool svg { width: 15px; height: 15px; pointer-events: none; }
${ROOT} .emdash-tb-devtool-badge {
  position: absolute; top: -3px; right: -3px; min-width: 15px; height: 15px; padding: 0 4px;
  border-radius: 999px; background: #ef4444; color: #fff; font: 600 10px/15px system-ui, sans-serif; text-align: center;
}
${ROOT} .emdash-tb-devtool-badge[data-tone="info"] { background: #3b82f6; }
${ROOT} .emdash-tb-devtool-badge[hidden] { display: none; }

/* Collapsed pill: only a round handle stays; the × of the pill hides instead of closing. */
#${EMDASH_TOOLBAR}.${DEV_TOOLS.COLLAPSED_CLASS} .emdash-tb-inner { display: none; }
#${DEV_TOOLS.HANDLE_ID} {
  display: none; align-items: center; justify-content: center; width: 36px; height: 36px; padding: 0; border: 0;
  border-radius: 999px; background: #1a1a1a; color: #e0e0e0; cursor: pointer;
  box-shadow: 0 4px 24px rgba(0,0,0,.3), 0 0 0 1px rgba(255,255,255,.08); transition: background .15s, color .15s;
}
#${DEV_TOOLS.HANDLE_ID}:hover { background: #2a2a2a; color: #fff; }
#${DEV_TOOLS.HANDLE_ID} svg { width: 18px; height: 18px; pointer-events: none; }
#${EMDASH_TOOLBAR}.${DEV_TOOLS.COLLAPSED_CLASS} #${DEV_TOOLS.HANDLE_ID} { display: flex; }
#${EMDASH_TOOLBAR} #${EMDASH.DISMISS_ID} svg { width: 14px; height: 14px; display: block; }

${PANEL} {
  position: fixed; bottom: 68px; left: 50%; transform: translateX(-50%); z-index: 999999;
  width: min(640px, calc(100vw - 32px)); max-height: min(60vh, 520px); display: flex; flex-direction: column;
  background: #1a1a1a; color: #e0e0e0; border-radius: 14px; overflow: hidden;
  box-shadow: 0 8px 32px rgba(0,0,0,.4), 0 0 0 1px rgba(255,255,255,.08);
  font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
${PANEL}[hidden] { display: none; }
${PANEL} header { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-bottom: 1px solid rgba(255,255,255,.1); }
${PANEL} header h2 { margin: 0; font-size: 13px; font-weight: 600; flex: 1; color: #fff; }
${PANEL} header button { background: rgba(255,255,255,.08); border: 0; color: #e0e0e0; border-radius: 6px; padding: 4px 10px; font: inherit; cursor: pointer; }
${PANEL} header button:hover { background: rgba(255,255,255,.16); }
${PANEL} ul { list-style: none; margin: 0; padding: 4px; overflow-y: auto; }
${PANEL} li { display: flex; gap: 10px; align-items: flex-start; padding: 8px 10px; border-radius: 8px; }
${PANEL} li[data-selector] { cursor: pointer; }
${PANEL} li[data-selector]:hover { background: rgba(255,255,255,.07); }
${PANEL} .dt-dot { flex: none; width: 8px; height: 8px; margin-top: 5px; border-radius: 50%; background: #60a5fa; }
${PANEL} .dt-dot[data-severity="error"] { background: #ef4444; }
${PANEL} .dt-dot[data-severity="warning"] { background: #f59e0b; }
${PANEL} .dt-dot[data-severity="done"] { background: #22c55e; }
${PANEL} .dt-dot[data-severity="wontfix"] { background: #6b7280; }
${PANEL} .dt-section { padding: 10px 10px 4px; color: #8a8a8a; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; }
${PANEL} .dt-problem { display: block; margin: 4px; padding: 10px 12px; border-radius: 8px; background: rgba(239,68,68,.12); color: #fca5a5; font-size: 12px; word-break: break-word; }
${PANEL} .dt-body { min-width: 0; flex: 1; }
${PANEL} .dt-msg { word-break: break-word; }
${PANEL} .dt-meta { margin-top: 2px; color: #8a8a8a; font-size: 11px; word-break: break-all; }
${PANEL} .dt-tag { flex: none; padding: 1px 6px; border-radius: 4px; background: rgba(255,255,255,.1); color: #bbb; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; }
${PANEL} .dt-empty { padding: 24px; text-align: center; color: #8a8a8a; }
${PANEL} a { color: #93c5fd; }

#${DEV_TOOLS.OVERLAY_ID} {
  position: fixed; z-index: 999998; pointer-events: none; border: 2px solid #3b82f6;
  background: rgba(59,130,246,.15); border-radius: 3px; transition: all .06s;
}
#${DEV_TOOLS.OVERLAY_ID}[hidden], #${DEV_TOOLS.TOOLTIP_ID}[hidden] { display: none; }
#${DEV_TOOLS.TOOLTIP_ID} {
  position: fixed; z-index: 999999; pointer-events: none; max-width: 360px; padding: 8px 10px; border-radius: 8px;
  background: #1a1a1a; color: #e0e0e0; box-shadow: 0 4px 16px rgba(0,0,0,.4);
  font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
}
#${DEV_TOOLS.TOOLTIP_ID} b { color: #fff; }
#${DEV_TOOLS.TOOLTIP_ID} .dt-field { color: #34d399; }
#${DEV_TOOLS.TOOLTIP_ID} .dt-island { color: #c084fc; }
#${DEV_TOOLS.TOOLTIP_ID} .dt-hint { color: #8a8a8a; }

/* X-ray: outline the structure of the page — layout blue, text grey, media orange, controls green. */
${X} body ${NOT_OURS} { outline: 1px dashed rgba(59,130,246,.55); outline-offset: -1px; }
${X} body :is(p, h1, h2, h3, h4, h5, h6, li, span, blockquote, time, label)${NOT_OURS} { outline-color: rgba(120,120,120,.6); }
${X} body :is(img, picture, video, svg, canvas, figure)${NOT_OURS} { outline: 1px solid rgba(245,158,11,.9); }
${X} body :is(a, button, input, select, textarea, summary)${NOT_OURS} { outline: 1px solid rgba(16,185,129,.9); }
${X} body :is(header, footer, main, nav, aside, section, article)${NOT_OURS} { outline: 2px solid rgba(37,99,235,.9); }
${X} body [data-emdash-ref]${NOT_OURS} { outline: 2px solid rgba(5,150,105,1); background: rgba(5,150,105,.08); }
${X} body astro-island > *${NOT_OURS} { outline: 2px dashed rgba(168,85,247,1); background: rgba(168,85,247,.08); }
#${DEV_TOOLS.LABELS_ID} { position: absolute; top: 0; left: 0; width: 0; height: 0; z-index: 999990; pointer-events: none; }
#${DEV_TOOLS.LABELS_ID} span {
  position: absolute; padding: 1px 5px; border-radius: 0 0 4px 0; white-space: nowrap;
  font: 600 10px/1.4 ui-monospace, Menlo, monospace; color: #fff; background: #2563eb;
}
#${DEV_TOOLS.LABELS_ID} span[data-kind="field"] { background: #059669; }
#${DEV_TOOLS.LABELS_ID} span[data-kind="island"] { background: #9333ea; }

/* Notes: numbered pins, the comment box, row buttons */
#${DEV_TOOLS.PINS_ID} { position: absolute; top: 0; left: 0; width: 0; height: 0; z-index: 999991; pointer-events: none; }
#${DEV_TOOLS.PINS_ID} span {
  position: absolute; display: grid; place-items: center; width: 18px; height: 18px; border-radius: 50%;
  background: #f59e0b; color: #1a1a1a; font: 700 11px/1 system-ui, sans-serif; box-shadow: 0 1px 4px rgba(0,0,0,.4);
}
#${DEV_TOOLS.COMPOSER_ID} {
  position: fixed; z-index: 1000000; width: ${340}px; box-sizing: border-box; padding: 12px;
  background: #1a1a1a; color: #e0e0e0; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,.45), 0 0 0 1px rgba(255,255,255,.1);
  font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
#${DEV_TOOLS.COMPOSER_ID} header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
#${DEV_TOOLS.COMPOSER_ID} header b { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #fff; font-weight: 600; }
#${DEV_TOOLS.COMPOSER_ID} .dt-size { color: #8a8a8a; font-size: 11px; }
#${DEV_TOOLS.COMPOSER_ID} .dt-selector { color: #8a8a8a; font: 11px/1.4 ui-monospace, Menlo, monospace; word-break: break-all; }
#${DEV_TOOLS.COMPOSER_ID} .dt-text { margin-top: 4px; color: #b0b0b0; font-size: 12px; max-height: 3.2em; overflow: hidden; }
#${DEV_TOOLS.COMPOSER_ID} textarea {
  display: block; width: 100%; box-sizing: border-box; margin-top: 10px; padding: 8px 10px; resize: vertical; min-height: 64px;
  background: #0f0f0f; color: #fff; border: 1px solid rgba(255,255,255,.15); border-radius: 8px; font: inherit;
}
#${DEV_TOOLS.COMPOSER_ID} textarea:focus { outline: 2px solid #3b82f6; outline-offset: -1px; border-color: transparent; }
#${DEV_TOOLS.COMPOSER_ID} .dt-error { margin-top: 8px; padding: 8px 10px; border-radius: 8px; background: rgba(239,68,68,.12); color: #fca5a5; font-size: 12px; word-break: break-word; }
#${DEV_TOOLS.COMPOSER_ID} .dt-error[hidden] { display: none; }
#${DEV_TOOLS.COMPOSER_ID} footer { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
#${DEV_TOOLS.COMPOSER_ID} footer a { flex: 1; color: #93c5fd; font-size: 12px; }
#${DEV_TOOLS.COMPOSER_ID} button {
  padding: 5px 10px; border: 0; border-radius: 6px; background: rgba(255,255,255,.1); color: #e0e0e0; font: inherit; cursor: pointer;
}
#${DEV_TOOLS.COMPOSER_ID} button:hover:not(:disabled) { background: rgba(255,255,255,.18); }
#${DEV_TOOLS.COMPOSER_ID} button:disabled { opacity: .4; cursor: default; }
#${DEV_TOOLS.COMPOSER_ID} button.primary { background: #3b82f6; color: #fff; }
#${DEV_TOOLS.COMPOSER_ID} button.primary:hover:not(:disabled) { background: #2563eb; }
${PANEL} .dt-x { flex: none; align-self: center; width: 22px; height: 22px; padding: 0; border: 0; border-radius: 50%; background: transparent; color: #8a8a8a; font-size: 16px; line-height: 1; cursor: pointer; }
${PANEL} .dt-x:hover { background: rgba(255,255,255,.12); color: #fff; }
#${DEV_TOOLS.TOAST_ID} {
  position: fixed; left: 50%; bottom: 76px; transform: translateX(-50%); z-index: 1000001; max-width: min(520px, calc(100vw - 32px));
  padding: 10px 14px; border-radius: 10px; background: #14532d; color: #dcfce7; font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  box-shadow: 0 6px 24px rgba(0,0,0,.35); pointer-events: none;
}
#${DEV_TOOLS.TOAST_ID}[hidden] { display: none; }
`
