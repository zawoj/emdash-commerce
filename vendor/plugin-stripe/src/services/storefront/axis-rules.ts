import type { Attribute } from "../../core/product-type.js";

const SIZE_PATTERN = /size|rozmiar/i;
const COLOUR_PATTERN = /colou?r|kolor/i;

/** What an axis is called for matching: its code, else its name. */
const matchTextOf = (attribute: Attribute): string => attribute.code ?? attribute.name;

/** The size axis: the attribute whose code (or name) matches size / rozmiar. Drives the card's size chips. */
export const isSizeAxis = (attribute: Attribute): boolean => SIZE_PATTERN.test(matchTextOf(attribute));

/** The axis whose value changes the product photo (colour / kolor). */
export const isImageAxis = (attribute: Attribute): boolean => COLOUR_PATTERN.test(matchTextOf(attribute));
