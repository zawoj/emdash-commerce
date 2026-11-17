const en = {
	pageTitle: "Thank you",
	headingPaid: "Payment received",
	headingPending: "Confirming payment",
	headingFailed: "Payment not completed",
	textPaid: "We are preparing your order. Watch this page for your order number.",
	textPaidWithEmail: "We sent a confirmation to {email}.",
	textPending: "Your payment is being confirmed. This usually takes a few seconds.",
	textFailed: "This checkout session ended before payment went through.",
	textNoSession: "Your payment is being confirmed.",
	numberLabel: "Order number",
	numberPending: "—",
	statusPaid: "Paid",
	statusUnpaid: "Waiting for payment",
	statusNoPayment: "No payment required",
	statusExpired: "Checkout expired",
	backToShop: "Back to the shop",
} as const;

export type CheckoutCopy = { [K in keyof typeof en]: string };

const pl: CheckoutCopy = {
	pageTitle: "Dziękujemy",
	headingPaid: "Płatność otrzymana",
	headingPending: "Potwierdzanie płatności",
	headingFailed: "Płatność nie została zakończona",
	textPaid: "Przygotowujemy zamówienie. Na tej stronie pojawi się numer zamówienia.",
	textPaidWithEmail: "Wysłaliśmy potwierdzenie na {email}.",
	textPending: "Twoja płatność jest potwierdzana. Zwykle trwa to kilka sekund.",
	textFailed: "Sesja płatności zakończyła się, zanim płatność przeszła.",
	textNoSession: "Twoja płatność jest potwierdzana.",
	numberLabel: "Numer zamówienia",
	numberPending: "—",
	statusPaid: "Opłacone",
	statusUnpaid: "Oczekiwanie na płatność",
	statusNoPayment: "Płatność niewymagana",
	statusExpired: "Sesja wygasła",
	backToShop: "Wróć do sklepu",
};

export const checkoutCopy = { en, pl };