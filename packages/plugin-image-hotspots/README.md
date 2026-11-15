# @emdash-commerce/plugin-image-hotspots

A native EmDash plugin with one field widget, `image-hotspots:hotspots`: an image with numbered points on it. Editors
pick an image from the media library, click it to place points, drag or arrow-key them, and fill in what each point
means. Used on the storefront home for "Shop the look" (a product per point) and the spotlight callouts (title, text,
side per point).

## Value (a `json` field)

```ts
{
  image: <EmDash image value as the core image field stores it> | null,
  points: Array<{
    id: string,            // point-1, point-2, ... unique within the field
    x: number, y: number,  // 0-100, percent of the image, two decimals
    title?: string,        // callouts mode
    text?: string,         // callouts mode
    side?: "start" | "end",// callouts mode: which side the card opens on
    productSlug?: string,  // products mode
  }>,
}
```

Zod schemas and types are exported from `@emdash-commerce/plugin-image-hotspots/value` (`hotspotsValueSchema`,
`HotspotsValue`, `HotspotPoint`). On the site call `normaliseValue(entry.data.field)`: it never throws, drops points
without coordinates, clamps and rounds, trims text and caps the count. `imageUrlOf(value.image)` gives the image URL.

## Use it on a field

1. Register the plugin in `emdash({ plugins: [...] })` (see `apps/storefront/astro.config.mjs`): `id`, `entrypoint`,
   `adminEntry: "@emdash-commerce/plugin-image-hotspots/admin"` and the `fieldWidgets` entry.
2. Create a `json` field with `widget: "image-hotspots:hotspots"` and `options`:
   - `mode`: `"products"` (a searchable product picker per point, stores the slug) or `"callouts"` (title, text, side).
   - `maxPoints`: optional, default 12, at most 50.

   The `emdash schema add-field` CLI has no `widget`/`options` flags: create the field with
   `POST /_emdash/api/schema/collections/<collection>/fields` (or the seed, which supports both), then mirror it in
   `seed/seed.json` and run `emdash types`.
3. Alias `@emdash-cms/admin` to the copy `emdash` renders with (see the comment in `astro.config.mjs`), otherwise the
   widget can load a second copy of the admin and its media picker loses its React contexts.

## Widget behaviour

- Image: choose, replace or remove through the admin's own `MediaPickerModal`. Points survive an image change.
- Click the image to add a point; "Add point" does the same from the keyboard. Drag a point with the pointer, or focus it
  and use the arrow keys (1%, Shift 5%); Delete removes it. X/Y number inputs allow exact values.
- The side list edits each point (product picker or title/text/side), reorders (up/down) and deletes.
- Points are positioned in percent of the image, so they stay put at any width. The stage keeps the image's aspect
  ratio. Colours come from the admin's `--color-kumo-*` tokens (light and dark); the markers keep a white ring for
  contrast on photos.
- Every change calls `onChange` with the full value. The admin saves a draft; the site shows it after Publish.

## Limitation: React entry vs Block Kit

A plugin with `admin.entry` (React) is a "react" admin plugin. EmDash then returns no Block Kit editor panels or actions
for it (`getPluginEditorExtension` in `emdash/src/emdash-runtime.ts`). That is why this widget is its own plugin and not
part of `@emdash-commerce/plugin-stripe`, which relies on editor panels and actions. A React plugin is trusted code: it is
not sandboxable or registry-installable.

## Layout

`src/value/` pure logic (schema, geometry, point operations, normalisation, image URL), `src/admin/` the React widget and
its CSS, `src/plugin.ts` the `definePlugin` definition. Tests: `pnpm nx test emdash-plugin-image-hotspots`.
