import { CART_ID_PATTERN } from "@emdash-commerce/plugin-stripe/contracts";

export const isValidCartId = (cartId: string): boolean => CART_ID_PATTERN.test(cartId);
