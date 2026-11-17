---
"@emdash-commerce/plugin-stripe": patch
---

A fresh shop can now receive `emdash site import`. EmDash's importer treats every relation definition as content, and the plugin creates 19 of them on its first start, so the import was refused with `TRANSFER_TARGET_NOT_EMPTY`. Start the target shop with `COMMERCE_DEFER_RELATIONS=1` (a plain environment variable, not a secret): while the site has no relation, the plugin creates its collections without relations and without the fields bound to them, and skips its data migrations. Import the package, then remove the variable and restart: the plugin completes the schema as it does for any upgrade, without duplicating a relation. A site that already has relations is not affected by the variable. Do not create products by hand while it is set, because the product form has no variant, price or category pickers until the relations exist.
