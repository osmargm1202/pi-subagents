import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("extensions/subagents.ts", "utf8");
assert.match(source, /findDeployableAgent\(runtimeCwd, params\.agent, scope, \{ projectTrusted \}\)/, "deploy_agent should resolve workers through trusted assets/subagents discovery");
assert.doesNotMatch(source, /const agent = findAgent\(/, "deploy_agent must not call removed findAgent helper");
assert.match(source, /resolveConfiguredSubagentModel\(agent\.name, agentModels\) \?\? agent\.model/, "orgm.json model overrides should preserve frontmatter model fallback");
assert.doesNotMatch(source, /const builtinTools = params\.agent\.tools\.filter/, "deploy_agent should not drop extension/custom tools from the child allowlist");
assert.match(source, /args\.push\("--tools", params\.agent\.tools\.join\(","\)\)/, "deploy_agent should pass ask_user_question and Engram tools through --tools");
assert.match(source, /projectTrust/, "deploy_agent should expose project trust control for child pi runs");
assert.match(source, /rpc-extension-ui/, "deploy_agent source should document RPC extension UI helper path for future RPC launch backend");
assert.match(source, /StringEnum\(\["embedded"\] as const/, "deploy_agent launchBackend should remain embedded-only until RPC backend is implemented");
assert.match(source, /args\.push\("--approve"\)/, "deploy_agent should pass --approve to child pi when project trust is approved");
assert.match(source, /args\.push\("--no-approve"\)/, "deploy_agent should pass --no-approve to child pi when project trust is denied");
assert.match(source, /findDeployableAgent\(runtimeCwd, params\.agent, scope, \{ projectTrusted/, "deploy_agent should gate project-local subagent discovery by resolved trust");
assert.match(source, /PI_SUBAGENT_DEPLOYMENT_ID/, "subagent children should be marked with a deployment id for diagnostics");
assert.match(source, /terminateSubagentProcessTree/, "subagent runner should terminate child process trees, not only direct children");
assert.match(source, /registerSubagentChildCleanup/, "subagent runner should register process-exit cleanup for active children");
