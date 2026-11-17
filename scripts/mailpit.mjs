#!/usr/bin/env node
/**
 * `pnpm mail:dev`: a local SMTP sink that EmDash's SMTP provider accepts (STARTTLS, a verified certificate, a login).
 * Generates a throwaway CA and a `localhost` certificate into `.mailpit/` (ignored by the repo), starts the pinned
 * Mailpit container and prints the environment to start the storefront with. `pnpm mail:dev stop` removes the container.
 * Needs Docker and openssl. Holds no real secret: the CA is thrown away with the folder.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { certExtensions, certPaths, dockerRunArgs, MAILPIT_CONTAINER, report } from "./lib/mailpit.mjs";

const CERT_DIR = join(import.meta.dirname, "..", ".mailpit");
const DOCKER = process.env.DOCKER_BIN ?? "docker";

const run = (command, args) => {
	const result = spawnSync(command, args, { encoding: "utf8" });
	if (result.error?.code === "ENOENT") throw new Error(`${command} was not found; this needs it on the PATH`);
	return result;
};
const must = (command, args, what) => {
	const result = run(command, args);
	if (result.status !== 0) throw new Error(`${what} failed: ${(result.stderr || result.stdout).trim()}`);
};

const makeCertificates = () => {
	const p = certPaths(CERT_DIR);
	if (existsSync(p.cert) && existsSync(p.caCert)) return;
	mkdirSync(CERT_DIR, { recursive: true });
	writeFileSync(p.ext, certExtensions());
	must("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "30", "-subj", "/CN=Mailpit local CA", "-keyout", p.caKey, "-out", p.caCert], "creating the CA");
	must("openssl", ["req", "-newkey", "rsa:2048", "-nodes", "-subj", "/CN=localhost", "-keyout", p.key, "-out", p.csr], "creating the certificate request");
	must("openssl", ["x509", "-req", "-in", p.csr, "-CA", p.caCert, "-CAkey", p.caKey, "-CAcreateserial", "-days", "30", "-extfile", p.ext, "-out", p.cert], "signing the certificate");
};

try {
	if (process.argv[2] === "stop") {
		run(DOCKER, ["rm", "-f", MAILPIT_CONTAINER]);
		console.log(`${MAILPIT_CONTAINER} removed`);
	} else {
		if (run(DOCKER, ["info"]).status !== 0) throw new Error("the Docker daemon is not running; start it first");
		makeCertificates();
		run(DOCKER, ["rm", "-f", MAILPIT_CONTAINER]);
		must(DOCKER, dockerRunArgs(CERT_DIR), "starting Mailpit");
		console.log(report(CERT_DIR));
	}
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
}
