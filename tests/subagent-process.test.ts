import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { runSubagentProcess, updateAssistantPreview } from "../extensions/lib/subagent-process.ts";

const run = (script: string, extra: Partial<Parameters<typeof runSubagentProcess>[0]> = {}) =>
	runSubagentProcess({ command: process.execPath, args: ["-e", script], cwd: process.cwd(), onEvent() {}, onStderr() {}, completionTimeoutMs: 30, killTimeoutMs: 40, exitDrainTimeoutMs: 80, ...extra });
const emit = (event: object) => `console.log(${JSON.stringify(JSON.stringify(event))});`;

test("decodes split UTF-8 and LF-only JSON records, including CRLF and final unterminated record", async () => {
	const records: unknown[] = [];
	const text = JSON.stringify({ type: "test", text: "hello 🦀\u2028world\u2029" });
	const bytes = Buffer.from(text + "\r\n" + text);
	const split = bytes.indexOf(Buffer.from("🦀")) + 2;
	const script = `const b = Buffer.from(${JSON.stringify([...bytes])}); process.stdout.write(b.subarray(0, ${split})); setTimeout(() => process.stdout.write(b.subarray(${split})), 20);`;
	const result = await run(script, { onEvent: (event) => records.push(event) });
	assert.equal(result.exitCode, 0);
	assert.deepEqual(records, [JSON.parse(text), JSON.parse(text)]);
});

test("agent_end does not kill automatic recovery before agent_settled", async () => {
	const events: string[] = [];
	const result = await run(emit({ type: "agent_end", willRetry: true }) + `setTimeout(() => { ${emit({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "recovered" }] } })} ${emit({ type: "agent_settled", aborted: false })} }, 160);`, { onEvent: (event) => events.push(event.type) });
	assert.equal(result.exitCode, 0);
	assert.deepEqual(events, ["agent_end", "message_end", "agent_settled"]);
});

test("settled watchdog escalates SIGTERM-ignoring children and cleans listeners", { skip: process.platform === "win32" }, async () => {
	const signal = new AbortController().signal;
	const exits = process.listenerCount("exit");
	const result = await run(`process.on('SIGTERM', () => {}); ${emit({ type: "agent_settled", aborted: false })} setInterval(() => {}, 1000);`, { signal });
	assert.equal(result.exitCode, 0);
	assert.equal(result.aborted, false);
	assert.equal(getEventListeners(signal, "abort").length, 0);
	assert.equal(process.listenerCount("exit"), exits);
});

test("cancellation after settlement cannot be reported as successful forced completion", { skip: process.platform === "win32" }, async () => {
	const controller = new AbortController();
	const result = await run(`process.on('SIGTERM', () => {}); ${emit({ type: "agent_settled", aborted: false })} setInterval(() => {}, 1000);`, {
		signal: controller.signal,
		onEvent: () => controller.abort(),
	});
	assert.equal(result.exitCode, 1);
	assert.equal(result.aborted, true);
	assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});

test("cancellation kills SIGTERM-ignoring descendants holding the output pipe", { skip: process.platform !== "linux" }, async () => {
	const controller = new AbortController();
	let descendantPid = 0;
	const grandchild = `process.on('SIGTERM', () => {}); console.log(JSON.stringify({pid: process.pid})); setInterval(() => {}, 1000);`;
	const script = `process.on('SIGTERM', () => {}); require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(grandchild)}], {stdio: ['ignore', 'inherit', 'inherit']}); setInterval(() => {}, 1000);`;
	const result = await run(script, {
		signal: controller.signal,
		onEvent: (event) => { descendantPid = event.pid; controller.abort(); },
	});
	assert.equal(result.exitCode, 1);
	assert.ok(descendantPid > 0);
	try {
		const stat = readFileSync(`/proc/${descendantPid}/stat`, 'utf8');
		assert.match(stat, /\) Z /, 'descendant must be gone or an already-dead zombie');
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
	}
});

test("pre-aborted invocation does not spawn", async () => {
	const result = await run("throw Error('must not execute')", { signal: AbortSignal.abort() });
	assert.deepEqual(result, { exitCode: 1, aborted: true });
});

test("signal-caused exit without cancellation is not success", { skip: process.platform === "win32" }, async () => {
	const result = await run("process.kill(process.pid, 'SIGTERM')");
	assert.equal(result.exitCode, 1);
});

test("spawn failure settles and removes abort listener", async () => {
	const signal = new AbortController().signal;
	const result = await run("", { command: "/nonexistent/pi-subagents-cli", signal });
	assert.equal(result.exitCode, 1);
	assert.match(result.errorMessage ?? "", /ENOENT/);
	assert.equal(getEventListeners(signal, "abort").length, 0);
});

test("event callback failure kills the child rather than crashing the host", async () => {
	const result = await run(emit({ type: "test" }) + "setInterval(() => {}, 1000)", { onEvent: () => { throw Error("renderer failed"); } });
	assert.equal(result.exitCode, 1);
	assert.equal(result.errorMessage, "renderer failed");
});

test("aborted settled event is failure even with zero process exit", async () => {
	const result = await run(emit({ type: "agent_settled", aborted: true }));
	assert.equal(result.exitCode, 1);
	assert.equal(result.aborted, true);
});

for (const stopReason of ["error", "aborted", "length"]) {
	test(`JSON zero exit does not hide assistant ${stopReason} failure`, async () => {
		const result = await run(emit({ type: "message_end", message: { role: "assistant", stopReason } }) + emit({ type: "agent_settled", aborted: false }));
		assert.equal(result.exitCode, 1);
	});
}

test("successful retry clears an earlier assistant error", async () => {
	const result = await run(emit({ type: "message_end", message: { role: "assistant", stopReason: "error" } }) + emit({ type: "agent_end", willRetry: true }) + emit({ type: "message_end", message: { role: "assistant", stopReason: "stop" } }) + emit({ type: "agent_settled", aborted: false }));
	assert.equal(result.exitCode, 0);
});

test("parent exit synchronously kills its active child group", { skip: process.platform !== "linux" }, async () => {
	const helperUrl = new URL("../extensions/lib/subagent-process.ts", import.meta.url).href;
	const childScript = `process.on('SIGTERM', () => {}); console.log(JSON.stringify({pid: process.pid})); setInterval(() => {}, 1000);`;
	const script = `(async () => { const {runSubagentProcess} = await import(${JSON.stringify(helperUrl)}); await runSubagentProcess({command: process.execPath, args: ['-e', ${JSON.stringify(childScript)}], cwd: process.cwd(), onStderr() {}, onEvent(event) { console.log(JSON.stringify(event)); setTimeout(() => process.exit(0), 10); }}); })();`;
	let pid = 0;
	const result = await run(script, { onEvent: (event) => { pid = event.pid; } });
	assert.equal(result.exitCode, 0);
	assert.ok(pid > 0);
	try {
		assert.match(readFileSync(`/proc/${pid}/stat`, 'utf8'), /\) Z /);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
	}
});

async function assertDead(pid: number): Promise<void> {
	assert.ok(pid > 0);
	for (let attempt = 0; attempt < 100; attempt++) {
		try {
			if (/\) Z /.test(readFileSync(`/proc/${pid}/stat`, "utf8"))) return;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
			throw error;
		}
		await delay(10);
	}
	assert.fail(`process ${pid} survived cleanup`);
}

function cleanupPid(pid: number): void {
	if (pid > 0) {
		try { process.kill(-pid, "SIGKILL"); } catch { /* already gone */ }
		try { process.kill(pid, "SIGKILL"); } catch { /* already gone */ }
	}
}

test("parent exit synchronously kills a detached grandchild in a separate group", { skip: process.platform !== "linux", timeout: 5000 }, async () => {
	const helperUrl = new URL("../extensions/lib/subagent-process.ts", import.meta.url).href;
	const grandchild = `process.on('SIGTERM', () => {}); console.log(JSON.stringify({grandchild: process.pid})); setInterval(() => {}, 1000);`;
	const leader = `process.on('SIGTERM', () => {}); console.log(JSON.stringify({leader: process.pid})); require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(grandchild)}], {detached: true, stdio: ['ignore', 'inherit', 'inherit']}); setInterval(() => {}, 1000);`;
	const parent = `const {runSubagentProcess} = await import(${JSON.stringify(helperUrl)}); await runSubagentProcess({command: process.execPath, args: ['-e', ${JSON.stringify(leader)}], cwd: process.cwd(), onStderr() {}, onEvent(event) { console.log(JSON.stringify(event)); if (event.grandchild) setTimeout(() => process.exit(0), 10); }});`;
	let leaderPid = 0;
	let grandchildPid = 0;
	try {
		const result = await run(parent, { onEvent: (event) => { leaderPid ||= event.leader ?? 0; grandchildPid ||= event.grandchild ?? 0; } });
		assert.equal(result.exitCode, 0);
		await assertDead(leaderPid);
		await assertDead(grandchildPid);
	} finally {
		cleanupPid(leaderPid);
		cleanupPid(grandchildPid);
	}
});

test("cancellation preserves graceful leader SIGTERM but also kills its detached descendants", { skip: process.platform !== "linux", timeout: 5000 }, async () => {
	const controller = new AbortController();
	const grandchild = `process.on('SIGTERM', () => {}); process.send(process.pid); setInterval(() => {}, 1000);`;
	const script = `process.on('SIGTERM', () => { console.error('graceful cleanup'); process.exit(143); }); const child = require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(grandchild)}], {detached: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc']}); child.once('message', pid => console.log(JSON.stringify({pid}))); setInterval(() => {}, 1000);`;
	let pid = 0;
	let stderr = "";
	try {
		const result = await run(script, {
			signal: controller.signal, killTimeoutMs: 1000,
			onEvent: (event) => { pid = event.pid; controller.abort(); },
			onStderr: (text) => { stderr += text; },
		});
		assert.equal(result.exitCode, 1);
		assert.equal(result.aborted, true);
		assert.match(stderr, /graceful cleanup/);
		await assertDead(pid);
	} finally { cleanupPid(pid); }
});

// Exercise the actual pinned Pi 1.3.0 print-mode handler, not a simulated exit(143).
const printModeUrl = new URL("../node_modules/@earendil-works/pi-coding-agent/dist/modes/print-mode.js", import.meta.url).href;
const realPiSignalHandler = (events: object[]) => `
	const {runPrintMode} = await import(${JSON.stringify(printModeUrl)});
	let listener;
	const session = {
		sessionManager: {getHeader() { return null; }},
		agent: {subscribe() { return () => {}; }},
		async bindExtensions() {},
		subscribe(callback) { listener = callback; return () => {}; },
		async prompt() { for (const event of ${JSON.stringify(events)}) listener(event); await new Promise(() => {}); },
	};
	setInterval(() => {}, 1000);
	await runPrintMode({session, setRebindSession() {}, async dispose() { console.error('Pi runtime disposed'); }}, {mode: 'json', initialMessage: 'test'});
`;

test("watchdog recognizes the installed Pi SIGTERM handler's graceful exit 143", { skip: process.platform === "win32", timeout: 10000 }, async () => {
	let stderr = "";
	const result = await run(realPiSignalHandler([{ type: "agent_settled", aborted: false }]), {
		killTimeoutMs: 1000, onStderr: (text) => { stderr += text; },
	});
	assert.equal(result.exitCode, 0);
	assert.equal(result.aborted, false);
	assert.match(stderr, /Pi runtime disposed/);
});

for (const failure of ["cancel", "assistant", "callback", "stderr"] as const) {
	test(`real Pi graceful SIGTERM exit cannot hide ${failure} failure`, { skip: process.platform === "win32", timeout: 10000 }, async () => {
		const controller = new AbortController();
		const events: object[] = failure === "assistant" ? [{ type: "message_end", message: { role: "assistant", stopReason: "error" } }] : [];
		events.push({ type: "agent_settled", aborted: false });
		const result = await run(realPiSignalHandler(events), {
			signal: controller.signal, killTimeoutMs: 1000,
			onEvent: (event) => {
				if (event.type !== "agent_settled") return;
				if (failure === "cancel") controller.abort();
				if (failure === "callback") throw Error("callback failed");
			},
			onStderr: () => { if (failure === "stderr") throw Error("stderr callback failed"); },
		});
		assert.equal(result.exitCode, 1);
		assert.equal(result.aborted, failure === "cancel");
		if (failure === "callback" || failure === "stderr") assert.match(result.errorMessage ?? "", /callback failed/);
	});
}

test("exit 143 without watchdog initiation remains failure", async () => {
	const result = await run(emit({ type: "agent_settled", aborted: false }) + "process.exit(143)");
	assert.equal(result.exitCode, 143);
});

test("watchdog does not normalize unrelated nonzero exits", { skip: process.platform === "win32" }, async () => {
	const result = await run(`process.on('SIGTERM', () => process.exit(2)); ${emit({ type: "agent_settled", aborted: false })} setInterval(() => {}, 1000);`);
	assert.equal(result.exitCode, 2);
});

for (const leaderCode of [0, 7]) {
	test(`leader exit ${leaderCode} before settlement drains final records and bounds inherited-pipe cleanup`, { skip: process.platform !== "linux", timeout: 5000 }, async () => {
		const signal = new AbortController().signal;
		const exits = process.listenerCount("exit");
		const grandchild = `process.on('SIGTERM', () => {}); console.log(JSON.stringify({pid: process.pid})); process.send('ready'); setTimeout(() => process.stdout.write(JSON.stringify({type: 'tail', text: '🦀'})), 30); setInterval(() => {}, 1000);`;
		const script = `const child = require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(grandchild)}], {stdio: ['ignore', 'inherit', 'inherit', 'ipc']}); child.once('message', () => process.exit(${leaderCode}));`;
		let pid = 0;
		const records: any[] = [];
		try {
			const result = await run(script, { signal, onEvent: (event) => { pid ||= event.pid ?? 0; records.push(event); } });
			assert.equal(result.exitCode, leaderCode);
			assert.ok(records.some((event) => event.type === "tail" && event.text === "🦀"));
			await assertDead(pid);
			assert.equal(getEventListeners(signal, "abort").length, 0);
			assert.equal(process.listenerCount("exit"), exits);
		} finally { cleanupPid(pid); }
	});
}

test("delta-only previews assemble ordered blocks and respect authoritative text_end", () => {
	const blocks = new Map<number, string>();
	const update = (type: string, contentIndex: number, value: string) => updateAssistantPreview(blocks, { type: "message_update", assistantMessageEvent: { type, contentIndex, delta: value, content: value } });
	assert.equal(update("text_delta", 1, "second"), "second");
	assert.equal(update("text_delta", 0, "hel"), "hel\nsecond");
	assert.equal(update("text_delta", 0, "lo"), "hello\nsecond");
	assert.equal(update("text_end", 0, "Hello!"), "Hello!\nsecond");
	blocks.clear();
	assert.equal(update("text_delta", 0, "next turn"), "next turn");
});
