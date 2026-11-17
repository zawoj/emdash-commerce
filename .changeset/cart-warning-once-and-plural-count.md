---
"@emdash-commerce/design-system": patch
---

`CountBadge`, the site header's cart link (`countLabelForms`, `countLocale`) and the tab bar badge can speak the count in the plural form of the language ("1 item in the cart", "5 items in the cart") through the new optional `labelForms` and `locale` props; without them the single `labelTemplate` is used as before. `CartLine` takes an optional `unavailableLabel` ("Warning") that is spoken before `unavailableText`, so an unavailable line needs only `unavailableText` and shows its reason once.
