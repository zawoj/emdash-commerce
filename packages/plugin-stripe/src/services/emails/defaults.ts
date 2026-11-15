import type { EmailMessage, EmailRenderers } from "../../contracts/extensions.js";
import { variantOptionsLabelOf } from "../../core/catalog-rules.js";
import type { Order } from "../../core/order.js";
import { escapeHtml, formatAmount, singleLine } from "./html.js";

/**
 * Built-in email templates: plain text first (every client shows it), and simple semantic HTML with no
 * external assets, inline styles only for spacing, a language attribute and real table headers. Every
 * interpolated value is escaped; the text parts are not HTML and are left as they are.
 */

type Required<T> = { [K in keyof T]-?: NonNullable<T[K]> };

const page = (title: string, body: string): string =>
	`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>` +
	`<body style="font-family:sans-serif;line-height:1.5;color:#111"><main><h1 style="font-size:20px">${escapeHtml(title)}</h1>${body}</main></body></html>`;

const paragraph = (text: string): string => `<p>${escapeHtml(text)}</p>`;

const button = (label: string, url: string): string =>
	`<p><a href="${escapeHtml(url)}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;text-decoration:none;border-radius:4px">${escapeHtml(label)}</a></p>` +
	`<p>If the button does not work, copy this link into your browser: ${escapeHtml(url)}</p>`;

/** "Shirt (Blue M)": the variant title, or the option labels when the variant has no title of its own. */
const lineLabel = (line: Order["lines"][number]): string => {
	const detail = (line.variantTitle ? variantOptionsLabelOf(line.title, line.variantTitle) : "") || line.optionsText;
	return detail ? `${line.title} (${detail})` : line.title;
};

const linesTable = (order: Order): string => {
	const currency = order.totals.currency;
	const rows = order.lines
		.map((line) => {
			return `<tr><td>${escapeHtml(lineLabel(line))}</td><td>${line.quantity}</td><td>${escapeHtml(formatAmount(line.amountTotal, currency))}</td></tr>`;
		})
		.join("");
	return (
		`<table style="border-collapse:collapse" cellpadding="6"><caption style="text-align:left">Items</caption>` +
		`<thead><tr><th scope="col" align="left">Item</th><th scope="col" align="left">Qty</th><th scope="col" align="left">Total</th></tr></thead>` +
		`<tbody>${rows}</tbody></table>`
	);
};

const linesText = (order: Order): string =>
	order.lines
		.map((line) => `- ${lineLabel(line)} x ${line.quantity}: ${formatAmount(line.amountTotal, order.totals.currency)}`)
		.join("\n");

const greeting = (order: Order): string => (order.customerName ? `Hi ${singleLine(order.customerName)},` : "Hi,");

export const defaultEmailRenderers: Required<EmailRenderers> = {
	orderConfirmation({ order, viewUrl, storeName }): EmailMessage {
		const total = formatAmount(order.totals.total, order.totals.currency);
		const title = `Thank you for your order ${order.orderNumber}`;
		return {
			subject: singleLine(`${storeName}: order ${order.orderNumber} confirmed`),
			text: [greeting(order), "", `We received your payment of ${total} for order ${order.orderNumber}.`, "", linesText(order), "", `View your order: ${viewUrl}`, "", `${storeName}`].join("\n"),
			html: page(
				title,
				paragraph(greeting(order)) + paragraph(`We received your payment of ${total} for order ${order.orderNumber}.`) + linesTable(order) + button("View your order", viewUrl) + paragraph(storeName),
			),
		};
	},
	paymentFailed({ order, storeName }): EmailMessage {
		const title = `Payment for order ${order.orderNumber} failed`;
		return {
			subject: singleLine(`${storeName}: payment for order ${order.orderNumber} failed`),
			text: [greeting(order), "", `We could not process the payment for order ${order.orderNumber}. You have not been charged for it.`, "Please try again, or use another payment method.", "", storeName].join("\n"),
			html: page(
				title,
				paragraph(greeting(order)) +
					paragraph(`We could not process the payment for order ${order.orderNumber}. You have not been charged for it.`) +
					paragraph("Please try again, or use another payment method.") +
					paragraph(storeName),
			),
		};
	},
	refundIssued({ order, amount, storeName }): EmailMessage {
		const formatted = formatAmount(amount, order.totals.currency);
		const title = `Refund for order ${order.orderNumber}`;
		return {
			subject: singleLine(`${storeName}: refund for order ${order.orderNumber}`),
			text: [greeting(order), "", `We refunded ${formatted} for order ${order.orderNumber}. It can take a few days to appear on your statement.`, "", storeName].join("\n"),
			html: page(
				title,
				paragraph(greeting(order)) + paragraph(`We refunded ${formatted} for order ${order.orderNumber}. It can take a few days to appear on your statement.`) + paragraph(storeName),
			),
		};
	},
	orderAccessLink({ orderNumber, viewUrl, storeName }): EmailMessage {
		const title = `Your link to order ${orderNumber}`;
		return {
			subject: singleLine(`${storeName}: your link to order ${orderNumber}`),
			text: ["Hi,", "", `Use this link to view order ${orderNumber}. It expires, and anyone who has it can see the order, so do not forward it.`, "", viewUrl, "", "If you did not ask for this, you can ignore this email.", "", storeName].join("\n"),
			html: page(
				title,
				paragraph(`Use this link to view order ${orderNumber}. It expires, and anyone who has it can see the order, so do not forward it.`) +
					button("View your order", viewUrl) +
					paragraph("If you did not ask for this, you can ignore this email.") +
					paragraph(storeName),
			),
		};
	},
};
