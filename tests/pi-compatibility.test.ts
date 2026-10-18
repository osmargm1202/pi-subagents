import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { DefaultResourceLoader, SettingsManager, type ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import { getPiInvocation } from "../extensions/subagents.ts";

test("installed Pi CLI really is 1.3.0", async () => {
	const invocation = getPiInvocation(["--version"]);
	assert.equal(invocation.command, process.execPath);
	assert.match(invocation.args[0], /pi-coding-agent\/dist\/bundle\/cli\.js$/);
	assert.notEqual(invocation.args[0], process.argv[1], "must not relaunch the SDK/test host");
	// --version is plain output, so collect stdout through a child independently.
	const { execFileSync } = await import("node:child_process");
	assert.equal(execFileSync(invocation.command, invocation.args, { encoding: "utf8" }).trim(), "1.3.0");
});

test("Pi 1.3.0 SDK resource loader loads both published entrypoints without factory resources", async () => {
	const root = mkdtempSync(join(tmpdir(), "pi-subagents-sdk-"));
	const previousHome = process.env.HOME;
	const previousPath = process.env.PATH;
	const previousOffline = process.env.PI_OFFLINE;
	const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
	process.env.PI_CODING_AGENT_DIR = join(root, "agent");
	process.env.HOME = root;
	const initialExitListeners = process.listenerCount("exit");
	const initialSigintListeners = process.listenerCount("SIGINT");
	try {
		const loader = new DefaultResourceLoader({
			cwd: root, agentDir: join(root, "agent"), settingsManager: SettingsManager.inMemory(),
			noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
			additionalExtensionPaths: [resolve("extensions/subagents.ts"), resolve("extensions/agent-status.ts")],
		});
		await loader.reload();
		const result = loader.getExtensions();
		assert.deepEqual(result.errors, []);
		assert.equal(result.extensions.length, 2);
		assert.equal(result.extensions.some((extension) => extension.tools.has("deploy_agent")), true);
		assert.equal(result.extensions.some((extension) => extension.commands.has("orgm-agent-status")), true);
		assert.equal(process.listenerCount("exit"), initialExitListeners);
		assert.equal(process.listenerCount("SIGINT"), initialSigintListeners);

		// Invoke the Jiti-loaded tool with no PATH fallback and a deliberately
		// nonexistent model. This exercises CLI resolution/spawning without auth
		// or network access, and ensures we did not relaunch this test runner.
		const agentDir = join(root, ".pi", "assets", "subagents");
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(join(agentDir, "compat-worker.md"), "---\nname: compat-worker\nmodel: pi-compat-test/no-such-model\ntools: read\n---\nCompatibility test");
		process.env.PATH = "";
		process.env.PI_OFFLINE = "1";
		const ctx = {
			cwd: root, mode: "json", hasUI: false,
			sessionManager: { getBranch: () => [], getSessionFile: () => undefined },
			modelRegistry: { find: () => undefined },
		} as unknown as ExtensionToolContext;
		const tool = result.extensions.flatMap((extension) => [...extension.tools.values()]).find((tool) => tool.definition.name === "deploy_agent")!;
		const output = await tool.definition.execute("compat", { agent: "compat-worker", task: "do not call a model", scope: "project", projectTrust: "approve" }, undefined, undefined, ctx);
		assert.equal(output.isError, true);
		const details = output.details as { exitCode: number; errorMessage?: string; fullOutput?: string };
		assert.equal(details.exitCode, 1);
		assert.doesNotMatch(details.errorMessage ?? "", /ENOENT|spawn pi/);
		assert.match(details.fullOutput ?? "", /no-such-model|Unknown provider|No models|model.*not found/i);
		for (const extension of result.extensions) {
			for (const shutdown of extension.handlers.get("session_shutdown") ?? [])
				await shutdown({ type: "session_shutdown" }, ctx);
		}
	} finally {
		if (previousHome === undefined) delete process.env.HOME; else process.env.HOME = previousHome;
		if (previousPath === undefined) delete process.env.PATH; else process.env.PATH = previousPath;
		if (previousOffline === undefined) delete process.env.PI_OFFLINE; else process.env.PI_OFFLINE = previousOffline;
		if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
		rmSync(root, { recursive: true, force: true });
	}
});
