/**
 * Pure helpers of `scripts/mailpit.mjs`: the arguments of the pinned Mailpit container and the `EMAIL_SMTP_*` block that
 * points EmDash's SMTP provider at it. Nothing here touches Docker, openssl or the disk.
 */
import { join } from "node:path";

/** An exact tag, never `latest`: pick a release at least two weeks old when you bump it. */
export const MAILPIT_IMAGE = "axllent/mailpit:v1.33.0";
export const MAILPIT_CONTAINER = "emdash-commerce-mailpit";
export const MAILPIT_PORTS = { smtp: 2526, ui: 8026 };
/** Mailpit accepts any login when started with `--smtp-auth-accept-any`; EmDash still needs a non-empty pair. */
export const MAILPIT_LOGIN = { user: "mailpit", pass: "mailpit" };
export const MAILPIT_SENDER = "shop@localhost";
const CERT_MOUNT = "/certs";

/** Where the throwaway CA and the `localhost` certificate live: an ignored folder at the repository root. */
export const certPaths = (dir) => ({
	caKey: join(dir, "ca.key"),
	caCert: join(dir, "ca.pem"),
	key: join(dir, "localhost.key"),
	csr: join(dir, "localhost.csr"),
	cert: join(dir, "localhost.pem"),
	ext: join(dir, "localhost.ext"),
});

/** The server certificate must name `localhost`: Node verifies the host name against its subject alternative names. */
export const certExtensions = () => "subjectAltName=DNS:localhost,IP:127.0.0.1\nbasicConstraints=CA:FALSE\nextendedKeyUsage=serverAuth\n";

/** `docker run` arguments. STARTTLS is required (EmDash refuses a server that does not offer it), any login is accepted. */
export const dockerRunArgs = (certDir) => [
	"run",
	"-d",
	"--rm",
	"--name",
	MAILPIT_CONTAINER,
	"-p",
	`127.0.0.1:${MAILPIT_PORTS.smtp}:1025`,
	"-p",
	`127.0.0.1:${MAILPIT_PORTS.ui}:8025`,
	"-v",
	`${certDir}:${CERT_MOUNT}:ro`,
	"-e",
	`MP_SMTP_TLS_CERT=${CERT_MOUNT}/localhost.pem`,
	"-e",
	`MP_SMTP_TLS_KEY=${CERT_MOUNT}/localhost.key`,
	"-e",
	"MP_SMTP_REQUIRE_STARTTLS=true",
	"-e",
	"MP_SMTP_AUTH_ACCEPT_ANY=true",
	MAILPIT_IMAGE,
];

/** The environment of the storefront process (never `.env`: a complete `EMAIL_SMTP_*` set hides the dev console for good). */
export const smtpEnvLines = () => [
	"EMAIL_SMTP_HOST=localhost",
	`EMAIL_SMTP_PORT=${MAILPIT_PORTS.smtp}`,
	"EMAIL_SMTP_SECURE=starttls",
	`EMAIL_SMTP_USER=${MAILPIT_LOGIN.user}`,
	`EMAIL_SMTP_PASS=${MAILPIT_LOGIN.pass}`,
	`EMAIL_SMTP_FROM_EMAIL=${MAILPIT_SENDER}`,
	"EMAIL_SMTP_FROM_NAME=Mailpit Shop",
];

export const report = (certDir) =>
	[
		`Mailpit ${MAILPIT_IMAGE} is running. Mail: http://localhost:${MAILPIT_PORTS.ui}`,
		"",
		"Start the storefront with this environment (a shell export or an inline prefix, not .env):",
		`NODE_EXTRA_CA_CERTS=${certPaths(certDir).caCert}`,
		...smtpEnvLines(),
		"",
		`Stop it: docker stop ${MAILPIT_CONTAINER}`,
	].join("\n");
