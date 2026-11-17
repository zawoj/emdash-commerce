import type { ProductGalleryProps } from "@emdash-commerce/design-system";
import type { ProductDetailView } from "@emdash-commerce/plugin-stripe/contracts";

import { imageFromUrl } from "../../../lib/media";
import type { VariantModel } from "./variants";

/**
 * Every photo of the product with the colour it belongs to: product photos carry no group (they fit every colour),
 * a variant's photos carry that variant's colour. The client filter shows the chosen colour's photos and falls back
 * to the untagged ones (or all) when that colour has none, so the DOM must hold all of them.
 */
export const galleryOf = (detail: ProductDetailView, model: VariantModel): ProductGalleryProps => {
	const photos: { src: string; alt: string; group?: string }[] = detail.images.map((image) => ({ src: image.url, alt: image.alt }));
	const imageAxis = model.axes.find((axis) => axis.isImageAxis);
	if (imageAxis) {
		const seen = new Set(photos.map((photo) => `${photo.group ?? ""}|${photo.src}`));
		for (const row of model.rows) {
			const group = row.options[imageAxis.code];
			for (const url of row.imageUrls) {
				const key = `${group}|${url}`;
				if (seen.has(key)) continue;
				seen.add(key);
				photos.push({ src: url, alt: detail.title, group });
			}
		}
	}
	const images = photos
		.map((photo, index) => {
			const image = imageFromUrl(photo.src, photo.alt, {
				sizes: "(min-width: 1024px) 50vw, 100vw",
				isEager: index === 0,
				isLead: index === 0,
			});
			return image ? { image, group: photo.group } : null;
		})
		.filter((entry): entry is NonNullable<typeof entry> => entry !== null);
	return {
		id: "pdp-gallery",
		images,
		label: "",
		thumbnailsLabel: "",
		thumbnailLabelTemplate: "",
		isEager: true,
	};
};
