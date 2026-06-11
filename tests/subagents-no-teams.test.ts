import assert from "node:assert/strict";
import subagentsExtension from "../extensions/subagents.ts";

const tools = new Map<string, any>();
const pi = {
	registerTool(tool: any) { tools.set(tool.name, tool); },
	on() {},
	events: { on() {}, emit() {} },
};

subagentsExtension(pi as any);
assert(tools.has("deploy_agent"), "deploy_agent should remain registered");
assert(!tools.has("query_team"), "query_team should be removed with teams.yaml support");
