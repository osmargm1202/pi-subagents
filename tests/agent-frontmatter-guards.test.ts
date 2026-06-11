import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = process.cwd();
const agentsRoot = join(repoRoot, "agents");
const expectedModes = ["ask.md", "build.md", "plan.md", "sdd.md", "tdd.md"];

const agentEntries = readdirSync(agentsRoot).sort();
assert.deepEqual(agentEntries, expectedModes, "agents/ should contain only mode prompt files");

for (const fileName of expectedModes) {
	const filePath = join(agentsRoot, fileName);
	assert(existsSync(filePath), `${fileName} should exist`);
	const content = readFileSync(filePath, "utf8");
	assert.doesNotMatch(content, /query_team|teams\.yaml|primary agent|primary-agent/i, `${fileName} should not reference removed team/primary routing`);
}
