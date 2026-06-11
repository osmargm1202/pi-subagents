import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { discoverDeployableAgents, findDeployableAgent } from "../extensions/lib/agent-discovery.ts";

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
