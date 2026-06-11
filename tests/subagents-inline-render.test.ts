import assert from "node:assert/strict";
import {
	buildInlineTranscriptLines,
	getDeployAgentInlineRuntimeParts,
	getDeployAgentInlineStatusText,
	type InlineTranscriptGroup,
} from "../extensions/subagents.ts";
import type { DeploymentTranscriptEntry } from "../extensions/lib/subagent-runtime-model.ts";

const theme = {
	fg: (_tone: string, text: string) => text,
	bold: (text: string) => text,
};

const details = {
	deploymentId: "tdd-implementer#6",
	agent: "tdd-implementer",
	instanceNumber: 6,
	source: "user" as const,
	tools: [],
	mode: "ephemeral" as const,
	launchBackend: "embedded" as const,
	reusedRuntime: false,
	depth: 1,
	contextWindow: 272000,
	status: "running" as const,
	summary: "thinking",
	usage: { input: 35000, output: 1000, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 33000, turns: 7 },
	exitCode: 0,
};

const transcript: DeploymentTranscriptEntry[] = [
	{ kind: "task", title: "Task · tdd-implementer", text: "Implement inline transcript details", ts: 1 },
	{ kind: "thinking", title: "Assistant update", text: "Scanning current render path", ts: 2 },
	{ kind: "tool_call", title: "Tool · read", text: "{\n  \"path\": \"extensions/subagents.ts\"\n}", toolName: "read", ts: 3 },
	{ kind: "tool_result", title: "Result · read", text: "renderResult found", toolName: "read", ts: 4 },
	{ kind: "assistant", title: "Assistant", text: "Transcript preview ready", ts: 5 },
];

const statusText = getDeployAgentInlineStatusText(details);
assert.equal(statusText.includes("tdd-implementer"), false, "inline status should not repeat agent name already shown in deploy_agent title");
assert.equal(statusText.includes("#6"), true, "inline status should keep deployment instance identifier");

const runtimeParts = getDeployAgentInlineRuntimeParts(details);
assert.equal(runtimeParts.includes("mode: ephemeral"), false, "inline runtime metadata should not repeat mode already shown in deploy_agent title");
assert.deepEqual(runtimeParts, ["new", "depth: 1"]);

const collapsedLines = buildInlineTranscriptLines([
	{ heading: "deploy tdd-implementer#6", transcript },
] satisfies InlineTranscriptGroup[], theme, false);
assert.equal(collapsedLines.some((line) => line.includes("Recent trace · deploy tdd-implementer#6")), true, "collapsed transcript should surface compact recent trace heading");
assert.equal(collapsedLines.some((line) => line.includes("thinking")), false, "collapsed transcript should prefer important entries over noisy thinking updates");
assert.equal(collapsedLines.some((line) => line.includes("tool read")), true, "collapsed transcript should include recent tool activity");
assert.equal(collapsedLines.some((line) => line.includes("assistant")), true, "collapsed transcript should include assistant outcome");

const noisyStatusTranscript: DeploymentTranscriptEntry[] = [
	{ kind: "status", title: "Scanning repository", ts: 1 },
	{ kind: "status", title: "Scanning repository", ts: 2 },
	{ kind: "status", title: "Scanning repository", ts: 3 },
	{ kind: "tool_call", title: "Tool · grep", text: '{"pattern":"render"}', toolName: "grep", ts: 4 },
	{ kind: "tool_call", title: "Tool · edit", text: '{"path":"extensions/subagents.ts"}', toolName: "edit", ts: 5 },
	{ kind: "tool_result", title: "Result · edit", text: "Updated inline renderer", toolName: "edit", ts: 6 },
	{ kind: "tool_call", title: "Tool · bash", text: '{"command":"node --test tests/subagents-inline-render.test.ts"}', toolName: "bash", ts: 7 },
	{ kind: "status", title: "Scanning repository", ts: 8 },
];
const toolPreferredLines = buildInlineTranscriptLines([
	{ heading: "deploy tdd-implementer#7", transcript: noisyStatusTranscript },
] satisfies InlineTranscriptGroup[], theme, false);
assert.equal(toolPreferredLines.filter((line) => line.includes("Scanning repository")).length <= 1, true, "collapsed transcript should dedupe repeated generic status text");
assert.equal(toolPreferredLines.some((line) => line.includes("tool edit")), true, "collapsed transcript should surface edit activity over generic status");
assert.equal(toolPreferredLines.some((line) => line.includes("tool bash")), true, "collapsed transcript should surface bash activity over generic status");
assert.equal(toolPreferredLines.filter((line) => line.startsWith("tool ")).length, 3, "collapsed transcript should fill preview with preferred tool activity when enough useful tool entries exist");

const expandedLines = buildInlineTranscriptLines([
	{ heading: "deploy tdd-implementer#6", transcript },
	{ heading: "member reviewer", transcript: transcript.slice(-2) },
] satisfies InlineTranscriptGroup[], theme, true);
assert.equal(expandedLines.some((line) => line.includes("Timeline · deploy tdd-implementer#6")), true, "expanded transcript should show deploy timeline heading");
assert.equal(expandedLines.some((line) => line.includes("Timeline · member reviewer")), true, "expanded transcript should group timeline per member");
assert.equal(expandedLines.some((line) => line.includes("Task · tdd-implementer")), true, "expanded transcript should preserve fuller timeline entries");
assert.equal(expandedLines.some((line) => line.includes("Result · read")), true, "expanded transcript should keep tool result event in fuller timeline");
assert.equal(expandedLines.some((line) => line.includes("renderResult found")), true, "expanded transcript should show tool result details");
