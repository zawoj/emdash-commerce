---
name: headless-chrome-window-size-floor
description: headless Chrome --window-size below about 500px still lays the page out at ~500px and crops the screenshot, so a "390px" screenshot made that way lies; emulate the viewport over DevTools instead
---

# A 390 px headless screenshot is not 390 px wide

`chrome --headless=new --window-size=390,844 --screenshot=…` lays the page out at roughly 500 px and then crops the image to
390 px: the wordmark sits off-centre, the grid's right column and the sort control are cut off, and it looks like a
horizontal overflow that does not exist.

**How to apply:** for phone screenshots and overflow checks drive Chrome over the DevTools protocol (Node 24 has a global
`WebSocket`, start Chrome with `--remote-debugging-port`) and call `Emulation.setDeviceMetricsOverride` with width 390, then
assert `document.documentElement.scrollWidth <= innerWidth`. Open states (a dialog, a drawer, a sticky bar) need the same
route, the CLI screenshot cannot click.
