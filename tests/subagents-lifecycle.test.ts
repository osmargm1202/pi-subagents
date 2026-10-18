import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createEventBus, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import subagents from "../extensions/subagents.ts";
import agentStatus from "../extensions/agent-status.ts";

function harness(factory: (pi: ExtensionAPI) => void) {
	const bus = createEventBus();
	let subscriptions = 0;
	const tools = new Map<string, any>();
	const commands = new Map<string, any>();
	const handlers = new Map<string, Function>();
	factory({
		events: {
			emit: bus.emit.bind(bus),
			on: (channel: string, handler: (data: unknown) => void) => {
				subscriptions++;
				const unsubscribe = bus.on(channel, handler);
				return () => { subscriptions--; unsubscribe(); };
			},
		},
		on: (event: string, handler: Function) => { handlers.set(event, handler); },
		registerTool: (tool: any) => tools.set(tool.name, tool),
		registerCommand: (name: string, command: any) => commands.set(name, command),
		registerShortcut() {},
	} as unknown as ExtensionAPI);
	return { bus, tools, commands, handlers, subscriptions: () => subscriptions };
}

test("deploy_agent uses branch state and releases real EventBus subscriptions on cancellation", async () => {
	const root = mkdtempSync(join(tmpdir(), "pi-subagents-lifecycle-"));
	const oldHome = process.env.HOME;
	const oldDir = process.env.PI_CODING_AGENT_DIR;
	process.env.HOME = root;
	process.env.PI_CODING_AGENT_DIR = root;
	try {
		const dir = join(root, "assets", "subagents", "build");
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "worker.md"), "---\nname: worker\ntools: read\n---\nTest worker");
		const h = harness(subagents);
		const tool = h.tools.get("deploy_agent");
		assert.ok(tool);
		let branchReads = 0;
		const ctx = {
			cwd: root, hasUI: false, mode: "json",
			sessionManager: {
				getBranch: () => { branchReads++; return []; },
				getEntries: () => { throw Error("must not read abandoned branches"); },
				getSessionFile: () => undefined,
			},
			modelRegistry: { find: () => undefined },
		} as unknown as ExtensionContext;
		for (let i = 0; i < 20; i++) {
			const result = await tool.execute("test", { agent: "worker", task: "test", scope: "user", projectTrust: "no-approve" }, AbortSignal.abort(), undefined, ctx);
			assert.equal(result.isError, true);
			assert.match(result.content[0].text, /aborted/);
			assert.equal(h.subscriptions(), 0, "EventBus.on returns the disposer; there is no off method");
		}
		assert.equal(branchReads, 20);
		writeFileSync(join(dir, "worker.md"), "---\nname: worker\nmodel: pi-compat-test/no-such-model\ntools: read\n---\nTest worker");
		const active = tool.execute("active", { agent: "worker", task: "test shutdown", scope: "user", projectTrust: "no-approve" }, undefined, undefined, ctx);
		h.bus.emit("subagents:provider-stop", { deploymentId: "unrelated#999", summary: "must not cancel this deployment" });
		await h.handlers.get("session_shutdown")!({}, ctx);
		const stopped = await active;
		assert.equal(stopped.isError, true);
		assert.equal(stopped.details.stopReason, "aborted");
		assert.equal(stopped.details.providerStopDetails, undefined);
		assert.equal(h.subscriptions(), 0);
		await h.handlers.get("session_shutdown")!({}, ctx);
	} finally {
		if (oldHome === undefined) delete process.env.HOME; else process.env.HOME = oldHome;
		if (oldDir === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = oldDir;
		rmSync(root, { recursive: true, force: true });
	}
});

test("agent-status avoids custom terminal UI in RPC and unsubscribes on shutdown", async () => {
	const root = mkdtempSync(join(tmpdir(), "pi-agent-status-lifecycle-"));
	const previousHome = process.env.HOME;
	process.env.HOME = root;
	let h: ReturnType<typeof harness>;
	try { h = harness(agentStatus); } finally {
		if (previousHome === undefined) delete process.env.HOME; else process.env.HOME = previousHome;
		rmSync(root, { recursive: true, force: true });
	}
	assert.equal(h.subscriptions(), 1);
	const notifications: string[] = [];
	const ctx = {
		hasUI: true, mode: "rpc",
		ui: { notify: (text: string) => notifications.push(text), custom: () => { throw Error("RPC has no custom TUI"); } },
	} as unknown as ExtensionContext;
	await h.commands.get("orgm-agents").handler("", ctx);
	assert.match(notifications[0], /TUI/);
	await h.handlers.get("session_shutdown")!({}, ctx);
	assert.equal(h.subscriptions(), 0);
});
