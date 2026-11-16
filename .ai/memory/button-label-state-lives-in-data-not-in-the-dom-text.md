---
name: button-label-state-lives-in-data-not-in-the-dom-text
description: the add-to-cart button must return to a label and an enabled state kept on the form (data-label-idle, data-is-purchasable), never to what its own text or disabled flag said when it was clicked
---

# The button's resting state is data, not whatever the DOM shows

`features/cart/client/add-to-cart.client.ts` changes the button to "Adding..." and then "Added". The first version saved
`button.textContent` at click time as the label to return to. A second click inside the 1.8 s "Added" window saved "Added" as
the resting label, and when that request was slow the first click's timer did nothing and the second one restored "Added":
the button stayed on it until the variant changed. Re-enabling in `finally` had the same flaw for a variant that sold out
while the request ran.

**The rule:** the form carries the resting state: `data-label-idle` and `data-is-purchasable`, rendered by `AddToCartForm`
and updated by `product-buy.client.ts` whenever the chosen variant changes. The cart script reads them when it settles,
keeps one feedback timer and clears it on every click. Any other script that changes a button's label temporarily should do
the same.

Regression tests: `add-to-cart.client.test.ts` (double click with a slow request, a failed second click, a variant that sells
out meanwhile, the label set by the variant script).
