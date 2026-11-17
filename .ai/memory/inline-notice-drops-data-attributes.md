---
name: inline-notice-drops-data-attributes
description: the design system's InlineNotice does not forward data-* attributes, so a data-testid or script hook placed on it never reaches the DOM - put hooks on a wrapper element
metadata:
  type: feedback
---

# `<InlineNotice data-testid=...>` renders without the attribute

`packages/design-system/src/components/atoms/inline-notice/index.astro` reads only `tone`, `title`, `toneLabel`, `id` and `role`
and renders one root `div`; any other prop (`data-testid`, `data-order-lookup-notice`) is silently dropped. On the order-lookup page
that made the notice untestable and, worse, the script's `[data-order-lookup-notice]` query returned null, so its rate-limit and
invalid-input messages were never written.

**How to apply:** put the hook on a wrapper the page owns (`.order-lookup__notice`), or add a pass-through to the component in
the design system. Check a new hook in the rendered DOM (`getByTestId(...).count()`), not in the template. Related
[[button-label-state-lives-in-data-not-in-the-dom-text]].
