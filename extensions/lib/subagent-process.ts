import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { StringDecoder } from "node:string_decoder";

/** Snapshot before signaling: killing the leader reparents detached bash descendants. */
function snapshotDescendants(root: number, pids: Set<number>, groups: Set<number>): void {
	if (process.platform === "win32") return;
	try {
		const result = spawnSync("ps", ["-A", "-o", "pid=,ppid=,pgid="], {
			encoding: "utf8", timeout: 1000, maxBuffer: 16 * 1024 * 1024,
		});
		if (result.status !== 0) return;
		const rows = result.stdout.trim().split("\n").map((row) => row.trim().split(/\s+/).map(Number));
		let changed: boolean;
		do {
			changed = false;
			for (const [pid, parent, group] of rows) {
				if (pid === root || pid === process.pid || pids.has(pid)) continue;
				if (parent === root || pids.has(parent) || group === root || groups.has(group)) {
					pids.add(pid);
					changed = true;
				}
			}
		} while (changed);
		// Only signal groups whose leader belongs to this tree, never the host group.
		for (const [pid, , group] of rows) {
			if (pids.has(pid) && (group === root || pids.has(group))) groups.add(group);
		}
	} catch { /* Best effort if process enumeration is unavailable; still kill the child group. */ }
}

/** JSON mode is one-shot. Only agent_settled, not agent_end, permits a stall watchdog. */
export async function runSubagentProcess(options: {
	command: string;
	args: string[];
	cwd: string;
	env?: NodeJS.ProcessEnv;
	signal?: AbortSignal;
	onEvent: (event: any) => void;
	onStderr: (text: string) => void;
	completionTimeoutMs?: number;
	killTimeoutMs?: number;
	exitDrainTimeoutMs?: number;
}): Promise<{ exitCode: number; aborted: boolean; errorMessage?: string }> {
	if (options.signal?.aborted) return { exitCode: 1, aborted: true };
	return await new Promise((resolve) => {
		let child: ChildProcess;
		let finished = false;
		let aborted = false;
		let forcedCompletion = false;
		let settled = false;
		let assistantFailed = false;
		let errorMessage: string | undefined;
		let completionTimer: ReturnType<typeof setTimeout> | undefined;
		let killTimer: ReturnType<typeof setTimeout> | undefined;
		let drainTimer: ReturnType<typeof setTimeout> | undefined;
		let exited = false;
		let exitCode: number | null = null;
		const descendantPids = new Set<number>();
		const descendantGroups = new Set<number>();
		const decoder = new StringDecoder("utf8");
		let buffer = "";
		const terminate = (signal: NodeJS.Signals) => {
			if (!child.pid) return;
			snapshotDescendants(child.pid, descendantPids, descendantGroups);
			if (signal === "SIGKILL") {
				for (const group of descendantGroups) {
					try { process.kill(-group, signal); } catch { /* already gone */ }
				}
				for (const pid of descendantPids) {
					try { process.kill(pid, signal); } catch { /* already gone */ }
				}
			}
			// child.killed means a signal was sent, NOT that the process exited.
			try {
				if (process.platform !== "win32") process.kill(-child.pid, signal);
				else child.kill(signal);
			} catch {
				try { child.kill(signal); } catch { /* already gone */ }
			}
		};
		const stop = () => {
			if (finished || killTimer) return;
			// Let Pi's SIGTERM handler dispose the runtime and tracked bash jobs first.
			terminate("SIGTERM");
			killTimer = setTimeout(() => {
				terminate("SIGKILL");
				if (exited) finish(exitCode);
			}, options.killTimeoutMs ?? 3000);
		};
		const abort = () => { aborted = true; stop(); };
		const line = (text: string) => {
			if (!text.trim()) return;
			let event: any;
			try { event = JSON.parse(text); } catch { return; }
			if (event?.type === "message_end" && event.message?.role === "assistant")
				assistantFailed = ["error", "aborted", "length"].includes(event.message.stopReason);
			if (event?.type === "agent_settled") {
				settled = true;
				aborted ||= event.aborted === true;
				if (!finished && !exited && !completionTimer) completionTimer = setTimeout(() => {
					forcedCompletion = !killTimer;
					// A prior cancellation/callback failure owns termination, not this watchdog.
					stop();
				}, options.completionTimeoutMs ?? 4000);
			}
			if (!event || typeof event !== "object") return;
			try { options.onEvent(event); } catch (error) {
				errorMessage = error instanceof Error ? error.message : String(error);
				stop();
			}
		};
		const finish = (code: number | null) => {
			if (finished) return;
			finished = true;
			options.signal?.removeEventListener("abort", abort);
			process.removeListener("exit", onParentExit);
			if (completionTimer) clearTimeout(completionTimer);
			if (killTimer) {
				clearTimeout(killTimer);
				terminate("SIGKILL");
			}
			if (drainTimer) clearTimeout(drainTimer);
			buffer += decoder.end();
			if (buffer.trim()) line(buffer);
			child?.stdout?.destroy();
			child?.stderr?.destroy();
			resolve({
				// Pi 1.3.0's real SIGTERM handler exits 143 after graceful disposal.
				exitCode: aborted || assistantFailed || errorMessage ? 1 : forcedCompletion && settled && (code === null || code === 143) ? 0 : code ?? 1,
				aborted,
				errorMessage,
			});
		};
		// Do not take over the host's SIGINT/SIGTERM handlers. An actual process
		// exit cannot wait for escalation. Snapshot and kill detached descendant groups too.
		const onParentExit = () => terminate("SIGKILL");
		try {
			child = spawn(options.command, options.args, {
				cwd: options.cwd, env: options.env, stdio: ["ignore", "pipe", "pipe"],
				shell: false, detached: process.platform !== "win32",
			});
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : String(error);
			finish(1);
			return;
		}
		process.once("exit", onParentExit);
		child.stdout!.on("data", (chunk: Buffer) => {
			buffer += decoder.write(chunk);
			let index: number;
			while ((index = buffer.indexOf("\n")) !== -1) {
				const record = buffer.slice(0, index);
				buffer = buffer.slice(index + 1);
				line(record);
			}
		});
		child.stderr!.setEncoding("utf8");
		child.stderr!.on("data", (text: string) => {
			try { options.onStderr(text); } catch (error) {
				errorMessage = error instanceof Error ? error.message : String(error);
				stop();
			}
		});
		child.once("error", (error) => { errorMessage = error.message; });
		// Prefer close so buffered protocol output remains authoritative, but inherited
		// pipes must not keep an already-exited leader pending forever (even pre-settlement).
		child.once("exit", (code) => {
			exited = true;
			exitCode = code;
			if (completionTimer) clearTimeout(completionTimer);
			snapshotDescendants(child.pid!, descendantPids, descendantGroups);
			drainTimer = setTimeout(stop, options.exitDrainTimeoutMs ?? 1000);
		});
		child.once("close", finish);
		options.signal?.addEventListener("abort", abort, { once: true });
		if (options.signal?.aborted) abort();
	});
}

/** JSON wire updates have no cumulative message snapshot in Pi 1.3.0. */
export function updateAssistantPreview(blocks: Map<number, string>, event: any): string {
	const delta = event.assistantMessageEvent;
	if (delta?.type === "text_delta") blocks.set(delta.contentIndex, (blocks.get(delta.contentIndex) ?? "") + delta.delta);
	if (delta?.type === "text_end") blocks.set(delta.contentIndex, delta.content);
	return [...blocks.entries()].sort(([a], [b]) => a - b).map(([, text]) => text).join("\n");
}
