import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

const BLOCKING_IMPACTS: ReadonlySet<string> = new Set(["serious", "critical"]);
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

interface ViolationSummary {
	rule: string;
	impact: string;
	help: string;
	targets: string[];
	/** The offending markup of the first node, cut short. */
	html: string;
}

/**
 * serious and critical axe violations of the page as it is now, with the selectors that break them.
 * `exclude` leaves out parts of the page that have a documented known issue (see a11y.spec.ts).
 */
export const blockingViolations = async (page: Page, exclude: readonly string[] = []): Promise<ViolationSummary[]> => {
	const builder = new AxeBuilder({ page }).withTags(WCAG_TAGS);
	for (const selector of exclude) builder.exclude(selector);
	const results = await builder.analyze();
	return results.violations
		.filter((violation) => BLOCKING_IMPACTS.has(violation.impact ?? ""))
		.map((violation) => ({
			rule: violation.id,
			impact: violation.impact ?? "unknown",
			help: violation.help,
			targets: violation.nodes.slice(0, 5).map((node) => node.target.join(" ")),
			html: (violation.nodes[0]?.html ?? "").slice(0, 240),
		}));
};

export const expectNoBlockingViolations = async (page: Page, exclude: readonly string[] = []): Promise<void> => {
	expect(await blockingViolations(page, exclude)).toEqual([]);
};
