---
"@emdash-commerce/design-system": patch
---

`ProductCard` (sold out) and `CartLine` (not ready for checkout) keep their text readable: only the photo is faded now, and the title, name and prices use the `--text-secondary` token instead of a reduced opacity, which had dropped them below WCAG AA contrast (4.34:1 and 3.73:1, now 5.97:1 on the light surface).
