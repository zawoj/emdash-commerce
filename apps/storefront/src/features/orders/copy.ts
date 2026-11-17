const en = {
	pageTitle: "Your order",
	heading: "Your order",
	text: "Here is where it stands. Keep this link private: anyone who has it can see the order.",
	numberLabel: "Order number",
	paymentLabel: "Payment",
	fulfillmentLabel: "Fulfilment",
	placedLabel: "Placed",
	itemsLabel: "Items in your order",
	summaryHeading: "Order summary",
	quantity: "× {count}",
	subtotal: "Subtotal",
	discount: "Discount",
	shipping: "Shipping",
	tax: "Tax",
	refunded: "Refunded",
	total: "Total",
	progressLabel: "Order progress",
	stepPlaced: "Placed",
	stepPaid: "Paid",
	stepFulfilled: "Sent",
	stateDone: "Completed",
	stateCurrent: "Current step",
	stateUpcoming: "Upcoming",
	paymentStatus: {
		pending: "Waiting for payment",
		paid: "Paid",
		failed: "Payment failed",
		partially_refunded: "Partially refunded",
		refunded: "Refunded",
		disputed: "Disputed",
		dispute_lost: "Dispute lost",
		cancelled: "Cancelled",
	},
	fulfillmentStatus: {
		unfulfilled: "Not sent yet",
		partially_fulfilled: "Partly sent",
		fulfilled: "Sent",
		partially_returned: "Partly returned",
		returned: "Returned",
	},
	unknownStatus: "Unknown",
	invalidTitle: "This link has expired or is not valid",
	invalidText: "Order links stop working after a while. Open the latest email about your order, or ask for a new link from the shop.",
	unavailableTitle: "We cannot show this order right now",
	unavailableText: "Please try again in a few minutes.",
	backToShop: "Back to the shop",
} as const;

export interface OrdersCopy {
	pageTitle: string;
	heading: string;
	text: string;
	numberLabel: string;
	paymentLabel: string;
	fulfillmentLabel: string;
	placedLabel: string;
	itemsLabel: string;
	summaryHeading: string;
	quantity: string;
	subtotal: string;
	discount: string;
	shipping: string;
	tax: string;
	refunded: string;
	total: string;
	progressLabel: string;
	stepPlaced: string;
	stepPaid: string;
	stepFulfilled: string;
	stateDone: string;
	stateCurrent: string;
	stateUpcoming: string;
	paymentStatus: Record<keyof typeof en.paymentStatus, string>;
	fulfillmentStatus: Record<keyof typeof en.fulfillmentStatus, string>;
	unknownStatus: string;
	invalidTitle: string;
	invalidText: string;
	unavailableTitle: string;
	unavailableText: string;
	backToShop: string;
}

const pl: OrdersCopy = {
	pageTitle: "Twoje zamówienie",
	heading: "Twoje zamówienie",
	text: "Tak wygląda jego stan. Nie udostępniaj tego linku: każdy, kto go ma, widzi zamówienie.",
	numberLabel: "Numer zamówienia",
	paymentLabel: "Płatność",
	fulfillmentLabel: "Realizacja",
	placedLabel: "Złożone",
	itemsLabel: "Produkty w zamówieniu",
	summaryHeading: "Podsumowanie zamówienia",
	quantity: "× {count}",
	subtotal: "Suma częściowa",
	discount: "Rabat",
	shipping: "Dostawa",
	tax: "Podatek",
	refunded: "Zwrócono",
	total: "Razem",
	progressLabel: "Postęp zamówienia",
	stepPlaced: "Złożone",
	stepPaid: "Opłacone",
	stepFulfilled: "Wysłane",
	stateDone: "Zakończony",
	stateCurrent: "Bieżący krok",
	stateUpcoming: "Następny",
	paymentStatus: {
		pending: "Czeka na płatność",
		paid: "Opłacone",
		failed: "Płatność nieudana",
		partially_refunded: "Zwrócono częściowo",
		refunded: "Zwrócono",
		disputed: "Spór",
		dispute_lost: "Spór przegrany",
		cancelled: "Anulowane",
	},
	fulfillmentStatus: {
		unfulfilled: "Jeszcze nie wysłane",
		partially_fulfilled: "Wysłane częściowo",
		fulfilled: "Wysłane",
		partially_returned: "Zwrócone częściowo",
		returned: "Zwrócone",
	},
	unknownStatus: "Nieznany",
	invalidTitle: "Ten link wygasł lub jest nieprawidłowy",
	invalidText: "Linki do zamówień przestają działać po pewnym czasie. Otwórz najnowszy e-mail o zamówieniu albo poproś w sklepie o nowy link.",
	unavailableTitle: "Nie możemy teraz pokazać tego zamówienia",
	unavailableText: "Spróbuj ponownie za kilka minut.",
	backToShop: "Wróć do sklepu",
};

export const ordersCopy = { en: en as OrdersCopy, pl };
