import { spawn, type ChildProcess } from "node:child_process";
import { closeSync, openSync, readFileSync } from "node:fs";

const POLL_MS = 250;
const KILL_GRACE_MS = 5_000;

export interface ManagedProcess {
	name: string;
	child: ChildProcess;
	logFile: string;
	stop: () => Promise<void>;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const isAlive = (pid: number): boolean => {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
};

export const readLog = (file: string): string => {
	try {
		return readFileSync(file, "utf8");
	} catch {
		return "";
	}
};

interface SpawnOptions {
	name: string;
	command: string;
	args: string[];
	env: NodeJS.ProcessEnv;
	cwd: string;
	logFile: string;
}

/**
 * A long-running child in its own process group (so the dev server's helpers die with it), output appended to a log
 * file. `stop` ends the whole group: SIGTERM first, SIGKILL after a grace period.
 */
export const spawnManaged = ({ name, command, args, env, cwd, logFile }: SpawnOptions): ManagedProcess => {
	const fd = openSync(logFile, "a");
	const child = spawn(command, args, { cwd, env, detached: true, stdio: ["ignore", fd, fd] });
	closeSync(fd);
	child.unref();
	// Safety net for a run that dies without its teardown (a crash, a second Ctrl-C): never leave a server behind.
	const killOnExit = (): void => {
		try {
			if (child.pid !== undefined) process.kill(-child.pid, "SIGKILL");
		} catch {
			// already gone
		}
	};
	process.once("exit", killOnExit);
	const stop = async (): Promise<void> => {
		const pid = child.pid;
		process.off("exit", killOnExit);
		if (pid === undefined || !isAlive(pid)) return;
		const signalGroup = (signal: NodeJS.Signals): void => {
			try {
				process.kill(-pid, signal);
			} catch {
				// already gone
			}
		};
		signalGroup("SIGTERM");
		const deadline = Date.now() + KILL_GRACE_MS;
		while (Date.now() < deadline && isAlive(pid)) await sleep(100);
		if (isAlive(pid)) signalGroup("SIGKILL");
	};
	return { name, child, logFile, stop };
};

/** Resolves when `pattern` shows up in the process's log; rejects when it exits first or the timeout passes. */
export const waitForLog = async (proc: ManagedProcess, pattern: RegExp, timeoutMs: number): Promise<void> => {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (pattern.test(readLog(proc.logFile))) return;
		if (proc.child.exitCode !== null) throw new Error(`${proc.name} exited (code ${proc.child.exitCode}) before it was ready; see ${proc.logFile}`);
		await sleep(POLL_MS);
	}
	throw new Error(`${proc.name} was not ready after ${Math.round(timeoutMs / 1000)}s; see ${proc.logFile}`);
};

/** Polls a URL until it answers with a status below 500 (a 404 means the server is up). */
export const waitForHttp = async (url: string, proc: ManagedProcess, timeoutMs: number): Promise<void> => {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (proc.child.exitCode !== null) throw new Error(`${proc.name} exited (code ${proc.child.exitCode}) before it answered; see ${proc.logFile}`);
		try {
			const response = await fetch(url, { signal: AbortSignal.timeout(10_000), redirect: "manual" });
			if (response.status < 500) return;
		} catch {
			// not listening yet
		}
		await sleep(POLL_MS);
	}
	throw new Error(`${proc.name} did not answer ${url} within ${Math.round(timeoutMs / 1000)}s; see ${proc.logFile}`);
};

/** Is something already listening on the URL's port? A second server on the port would make the suite test the wrong app. */
export const isPortServed = async (url: string): Promise<boolean> => {
	try {
		await fetch(url, { signal: AbortSignal.timeout(2_000), redirect: "manual" });
		return true;
	} catch {
		return false;
	}
};

/** Runs a short command to completion with its output in a log file; resolves to the exit code. */
export const runToCompletion = (options: Omit<SpawnOptions, "name"> & { timeoutMs: number }): Promise<number> =>
	new Promise((resolve, reject) => {
		const fd = openSync(options.logFile, "a");
		const child = spawn(options.command, options.args, { cwd: options.cwd, env: options.env, stdio: ["ignore", fd, fd] });
		closeSync(fd);
		const timer = setTimeout(() => {
			child.kill("SIGKILL");
			reject(new Error(`${options.command} ${options.args.join(" ")} timed out after ${Math.round(options.timeoutMs / 1000)}s; see ${options.logFile}`));
		}, options.timeoutMs);
		child.on("exit", (code) => {
			clearTimeout(timer);
			resolve(code ?? 1);
		});
		child.on("error", reject);
	});
