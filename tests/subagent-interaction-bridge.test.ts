import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	SUBAGENT_INTERACTION_BRIDGE_ENV,
	formatSubagentInteractionUnavailable,
	processPendingSubagentInteractionRequests,
	requestSubagentInteraction,
} from "../extensions/lib/subagent-interaction-bridge.ts";

const previousBridge = process.env[SUBAGENT_INTERACTION_BRIDGE_ENV];

try {
	delete process.env[SUBAGENT_INTERACTION_BRIDGE_ENV];
	const missing = await requestSubagentInteraction("ask_user_question", { question: "Continue?" }, { timeoutMs: 25 });
	assert.equal(missing.ok, false, "subagent request should fail clearly when no bridge is configured");
	assert.match(missing.error, /user input unavailable in subagent runtime/i);
	assert.equal(formatSubagentInteractionUnavailable(), missing.error);

	const dir = mkdtempSync(join(tmpdir(), "subagent-bridge-"));
	process.env[SUBAGENT_INTERACTION_BRIDGE_ENV] = dir;
	try {
		const pending = requestSubagentInteraction("ask_user_question", { question: "Continue?" }, { timeoutMs: 1_000, pollMs: 10 });
		let processed = 0;
		for (let i = 0; i < 50 && processed === 0; i += 1) {
			processed = await processPendingSubagentInteractionRequests(dir, async (request) => {
				assert.equal(request.kind, "ask_user_question");
				assert.deepEqual(request.payload, { question: "Continue?" });
				return { cancelled: false, selection: "Yes", raw: "Yes" };
			});
			if (processed === 0) await new Promise((resolve) => setTimeout(resolve, 10));
		}
		assert.equal(processed, 1, "parent side should process pending bridge request");
		const response = await pending;
		assert.equal(response.ok, true, "subagent should consume parent response");
		assert.deepEqual(response.response, { cancelled: false, selection: "Yes", raw: "Yes" });
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
} finally {
	if (previousBridge === undefined) delete process.env[SUBAGENT_INTERACTION_BRIDGE_ENV];
	else process.env[SUBAGENT_INTERACTION_BRIDGE_ENV] = previousBridge;
}
