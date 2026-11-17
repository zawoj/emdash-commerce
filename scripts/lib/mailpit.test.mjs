import { describe, expect, it } from "vitest";

import { smtpEnvStatus, SMTP_STATES } from "./bootstrap-env.mjs";
import { certExtensions, certPaths, dockerRunArgs, MAILPIT_IMAGE, MAILPIT_PORTS, report, smtpEnvLines } from "./mailpit.mjs";

const toEnv = (lines) => Object.fromEntries(lines.map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]));

describe("smtpEnvLines", () => {
	it("is a set EmDash's SMTP provider accepts (the seam with the doctor's rules)", () => {
		expect(smtpEnvStatus(toEnv(smtpEnvLines()))).toEqual({ state: SMTP_STATES.ready });
	});

	it("points at the port the container publishes, and never at 25", () => {
		const env = toEnv(smtpEnvLines());
		expect(env.EMAIL_SMTP_PORT).toBe(String(MAILPIT_PORTS.smtp));
		expect(env.EMAIL_SMTP_PORT).not.toBe("25");
	});
});

describe("dockerRunArgs", () => {
	const args = dockerRunArgs("/x/certs");

	it("pins an exact tag", () => {
		expect(args.at(-1)).toBe(MAILPIT_IMAGE);
		expect(MAILPIT_IMAGE).toMatch(/:v\d+\.\d+\.\d+$/);
	});

	it("requires STARTTLS and mounts the certificate folder read-only", () => {
		expect(args).toContain("MP_SMTP_REQUIRE_STARTTLS=true");
		expect(args).toContain("/x/certs:/certs:ro");
	});

	it("binds the published ports to loopback only", () => {
		const published = args.filter((arg) => /^127\.0\.0\.1:\d+:\d+$/.test(arg));
		expect(published).toEqual([`127.0.0.1:${MAILPIT_PORTS.smtp}:1025`, `127.0.0.1:${MAILPIT_PORTS.ui}:8025`]);
	});
});

describe("certificate files", () => {
	it("names localhost in the subject alternative names", () => {
		expect(certExtensions()).toContain("DNS:localhost");
	});

	it("keeps every file in the given folder", () => {
		for (const path of Object.values(certPaths("/x/certs"))) expect(path.startsWith("/x/certs/")).toBe(true);
	});
});

describe("report", () => {
	it("prints the CA path Node must trust and the UI address", () => {
		const text = report("/x/certs");
		expect(text).toContain("NODE_EXTRA_CA_CERTS=/x/certs/ca.pem");
		expect(text).toContain(`http://localhost:${MAILPIT_PORTS.ui}`);
	});
});
