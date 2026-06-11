import assert from "node:assert/strict";
import {
	deriveRuntimePlaceholder,
	formatBar,
	formatDeploymentLabel,
	formatTokens,
	getDeployAgentInlineRuntimeParts,
	getDeployAgentInlineStatusText,
	shortenMiddle,
	truncateStatusText,
	zeroUsage,
	type RuntimeSnapshot,
} from "../extensions/lib/subagent-runtime-model.ts";

assert.deepEqual(zeroUsage(), {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	cost: 0,
	contextTokens: 0,
	turns: 0,
});

assert.equal(formatTokens(0), "0");
assert.equal(formatTokens(999), "999");
assert.equal(formatTokens(1500), "1.5k");
assert.equal(formatTokens(15_000), "15k");
assert.equal(formatTokens(1_500_000), "1.5M");

assert.equal(formatBar(0), "[----------]0%");
assert.equal(formatBar(55), "[######----]55%");
assert.equal(formatBar(101), "[##########]100%");

assert.equal(truncateStatusText("  hello   world  ", 20), "hello world");
assert.equal(truncateStatusText("aaaaa", 3), "aa…");
assert.equal(shortenMiddle("abcdefghijkl", 7), "abc…jkl");

assert.equal(getDeployAgentInlineStatusText({ deploymentId: "tdd-implementer#6", source: "project" }), "#6 · project");
assert.deepEqual(getDeployAgentInlineRuntimeParts({ reusedRuntime: false, depth: 1 }), ["new", "depth: 1"]);
assert.deepEqual(getDeployAgentInlineRuntimeParts({ runtimeId: "abc", reusedRuntime: true, depth: 2 }), ["runtime: abc", "reused", "depth: 2"]);

assert.equal(formatDeploymentLabel({ agent: "tdd-verifier" }), "tdd-verifier 1");
assert.equal(formatDeploymentLabel({ agent: "tdd-verifier", instanceNumber: 3 }), "tdd-verifier 3");

const runtime: RuntimeSnapshot = {
	runtimeId: "rt-1",
	agent: "tdd-planner",
	source: "project",
	mode: "persistent",
	launchBackend: "embedded",
	model: "test-model",
	contextWindow: 200_000,
	contextTokens: 42_000,
	status: "idle",
	lastUsedAt: 1,
	createdAt: 1,
	runs: 2,
	reuseCount: 1,
	depth: 0,
};

const placeholder = deriveRuntimePlaceholder(runtime);
assert.equal(placeholder.deploymentId, "runtime:rt-1");
assert.equal(placeholder.status, "idle");
assert.equal(placeholder.summary, "persistent runtime idle · 2 runs");
assert.equal(placeholder.currentActivity, "idle · reusable · 1 reuses");
assert.equal(placeholder.usage.contextTokens, 42_000);

const paused = deriveRuntimePlaceholder({ ...runtime, recoverableReason: "provider_error", tmuxPaneId: "%12" });
assert.equal(paused.status, "paused_provider_error");
assert.equal(paused.summary, "provider paused · tdd-planner");
assert.equal(paused.currentActivity, "paused · provider error · %12");

const waiting = deriveRuntimePlaceholder({ ...runtime, awaitingUserInput: true });
assert.equal(waiting.status, "awaiting_user_input");
assert.equal(waiting.summary, "awaiting input · tdd-planner");
assert.equal(waiting.currentActivity, "awaiting user input");
