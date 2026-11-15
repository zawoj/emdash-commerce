---
name: emdash-react-field-widgets
description: custom React field widgets in EmDash 1.5 (how a field selects one, what props it gets, how the entry is bundled) and why a React admin entry disables a plugin's Block Kit panels
metadata:
  type: project
---

# EmDash React field widgets (verified on emdash / @emdash-cms/admin 1.5.0)

- A field selects a widget with `widget: "<pluginId>:<widgetName>"`. The admin looks it up in
  `pluginAdmins[pluginId].fields[widgetName]` and renders it with `{ value, onChange, label, id, required, options,
  validation, minimal }` (`@emdash-cms/admin` `dist/index.js` `FieldRenderer`, ~line 50476). `options` is the field's
  `options` object; `onChange` takes the new value only. A widget that is not a React component falls back to the
  declarative Block Kit `fieldWidgets[].elements`.
- `pluginAdmins` comes from the plugin descriptor's `adminEntry` (`emdash/src/astro/integration/virtual-modules.ts`
  `generateAdminRegistryModule` does `import * as adminN from adminEntry`); the module's `fields` export is used. The
  native plugin itself must also set `admin.entry` (and `admin.fieldWidgets`) in `definePlugin`.
- A plugin with `admin.entry` has `adminMode: "react"` and `getPluginEditorExtension` returns null for it
  (`emdash/src/emdash-runtime.ts`), so its Block Kit editor panels and actions are not shown. Keep React widgets in their
  own plugin (`image-hotspots`), not in the Stripe commerce plugin.
- The admin exports `MediaPickerModal`, `fetchContentList`, `apiFetch` and friends for plugin code, but pnpm can link a
  workspace package to a different copy of `@emdash-cms/admin` than `emdash` uses; a second copy means second React
  contexts. `apps/storefront/astro.config.mjs` aliases `@emdash-cms/admin` to the copy `emdash` resolves.
- Plugin CSS is not run through the admin's Tailwind: write plain CSS on the `--color-kumo-*` / `--text-color-kumo-*`
  variables (they switch with light/dark).
- `emdash schema add-field` has no `widget`/`options` flags; the schema REST API and the seed accept both.
- The admin saves edits as a draft revision; the public site reads the published one, so publish (confirm dialog) before
  checking the site. `emdash content update` publishes automatically.
- Do not trim text in the controlled value the widget reads back, or a typed trailing space disappears.
