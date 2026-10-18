import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { after } from "node:test";
import { discoverDeployableAgents, findDeployableAgent } from "../extensions/lib/agent-discovery.ts";

// Discovery must not depend on the developer's real user-level subagents.
const userRoot = mkdtempSync(join(tmpdir(), "pi-subagents-user-"));
const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
process.env.PI_CODING_AGENT_DIR = userRoot;
after(() => {
	if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
	else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
	rmSync(userRoot, { recursive: true, force: true });
	rmSync(projectRoot, { recursive: true, force: true });
});
const packageAgents = discoverDeployableAgents(tmpdir(), "user");
assert.equal(packageAgents.some((agent) => agent.filePath.includes("/assets/subagents/")), false, "package should not expose bundled assets/subagents by default");
assert.equal(findDeployableAgent(tmpdir(), "tdd-planner", "user"), undefined, "archived package subagents should not be deployable");

const projectRoot = mkdtempSync(join(tmpdir(), "pi-harness-agent-project-"));
const projectSubagentsDir = join(projectRoot, ".pi", "assets", "subagents", "tdd");
mkdirSync(projectSubagentsDir, { recursive: true });
writeFileSync(
	join(projectSubagentsDir, "tdd-planner.md"),
	`---\nname: tdd-planner\ndescription: project override\ntools: read\nmodel: openai-codex/gpt-5.5\n---\nProject override body\n`,
);

const mergedAgents = discoverDeployableAgents(projectRoot, "both");
const projectPlanner = mergedAgents.find((agent) => agent.name === "tdd-planner");
assert(projectPlanner, "project-local .pi/assets/subagents should remain discoverable");
assert.equal(projectPlanner.source, "project");
assert.equal(projectPlanner.description, "project override");
assert.equal(projectPlanner.model, "openai-codex/gpt-5.5", "agent frontmatter model should be preserved unless orgm.json overrides it");
assert.equal(projectPlanner.systemPrompt, "Project override body");
assert.equal(findDeployableAgent(projectRoot, "tdd-planner", "both")?.source, "project");

const untrustedAgents = discoverDeployableAgents(projectRoot, "both", { projectTrusted: false });
assert.equal(
	untrustedAgents.find((agent) => agent.name === "tdd-planner"),
	undefined,
	"untrusted project discovery should ignore .pi/assets/subagents and there are no package fallback subagents",
);
assert.equal(
	findDeployableAgent(projectRoot, "tdd-planner", "both", { projectTrusted: false }),
	undefined,
	"findDeployableAgent should honor untrusted project-local subagent gating",
);
