import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("pi-subagents owns agent-status widgets", () => {
	const pkg = JSON.parse(readFileSync("package.json", "utf8"));
	assert.deepEqual(pkg.pi.extensions, [
		"./extensions/subagents.ts",
		"./extensions/agent-status.ts",
	]);
	assert(existsSync("extensions/agent-status.ts"), "agent status extension should live in pi-subagents");
	const source = readFileSync("extensions/agent-status.ts", "utf8");
	assert.match(source, /SUBAGENTS_EVENT/);
	assert.match(source, /setWidget/);
	assert.match(source, /orgm-agent-status/);
});
