import assert from "node:assert/strict";
import { isAgentAllowedForOrgmMode } from "../extensions/subagents.ts";

assert.equal(
	isAgentAllowedForOrgmMode("sdd", { name: "sdd-design", filePath: "/repo/assets/subagents/sdd/sdd-design.md" }),
	true,
	"SDD mode should allow SDD subagents",
);
assert.equal(
	isAgentAllowedForOrgmMode("sdd", { name: "tdd-planner", filePath: "/repo/assets/subagents/tdd/tdd-planner.md" }),
	true,
	"SDD mode should allow broader subagent freedom",
);
assert.equal(
	isAgentAllowedForOrgmMode("tdd", { name: "tdd-planner", filePath: "/repo/assets/subagents/tdd/tdd-planner.md" }),
	true,
	"TDD mode should allow TDD subagents",
);
assert.equal(
	isAgentAllowedForOrgmMode("tdd", { name: "sdd-design", filePath: "/repo/assets/subagents/sdd/sdd-design.md" }),
	true,
	"TDD mode should allow broader subagent freedom",
);
assert.equal(
	isAgentAllowedForOrgmMode("build", { name: "builder", filePath: "/repo/assets/subagents/build/builder.md" }),
	true,
	"BUILD mode should allow build subagents",
);
assert.equal(
	isAgentAllowedForOrgmMode("build", { name: "tdd-planner", filePath: "/repo/assets/subagents/tdd/tdd-planner.md" }),
	false,
	"BUILD mode should block TDD subagents",
);
