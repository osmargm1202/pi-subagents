import assert from "node:assert/strict";
import { existsSync } from "node:fs";

assert(!existsSync("assets/subagents"), "bundled subagents should not be active package assets");
assert(existsSync("archive/subagents/plan/planner.md"), "archived subagents should preserve plan worker history");
assert(existsSync("archive/subagents/tdd/tdd-planner.md"), "archived subagents should preserve TDD worker history");
assert(existsSync("archive/subagents/sdd/sdd-apply.md"), "archived subagents should preserve SDD worker history");
