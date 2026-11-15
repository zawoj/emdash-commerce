/**
 * Storefront-facing contracts (`@emdash-commerce/plugin-stripe/contracts`): the HTTP API schemas and types,
 * the options schema and the extension API. Importing this entry never loads EmDash or Stripe.
 */
export * from "./api.js";
export * from "./extensions.js";
export * from "./options.js";
export { variantDisplayNameOf, variantOptionsLabelOf } from "../core/catalog-rules.js";
