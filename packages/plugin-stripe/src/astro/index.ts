// @ts-expect-error Resolved by the EmDash site bundler when componentsEntry is wired in astro.config.
import Product from "./Product.astro";

export const blockComponents = {
	product: Product,
};
