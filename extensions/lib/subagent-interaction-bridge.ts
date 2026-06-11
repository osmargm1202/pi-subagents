import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const SUBAGENT_INTERACTION_BRIDGE_ENV = "PI_SUBAGENT_INTERACTION_BRIDGE_DIR";

export type SubagentInteractionKind = "ask_user_question" | "permission";

export interface SubagentInteractionRequest {
	id: string;
	kind: SubagentInteractionKind;
	payload: unknown;
	createdAt: number;
}

export interface SubagentInteractionResponse {
	cancelled: boolean;
	selection?: string | string[];
	comment?: string;
	raw?: unknown;
	allowed?: boolean;
}

export type SubagentInteractionResult =
	| { ok: true; response: SubagentInteractionResponse }
	| { ok: false; error: string };

export function formatSubagentInteractionUnavailable(): string {
	return "User input unavailable in subagent runtime: no interaction bridge configured. Re-run this subagent from an interactive parent session or avoid extension-level prompts in the delegated task.";
}

function safeId(): string {
	return `${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2)}`;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function atomicWriteJson(path: string, value: unknown): void {
	const tmp = `${path}.tmp-${process.pid}-${Math.random().toString(36).slice(2)}`;
	writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
	renameSync(tmp, path);
}

export async function requestSubagentInteraction(
	kind: SubagentInteractionKind,
	payload: unknown,
	options: { timeoutMs?: number; pollMs?: number } = {},
): Promise<SubagentInteractionResult> {
	const dir = process.env[SUBAGENT_INTERACTION_BRIDGE_ENV]?.trim();
	if (!dir) return { ok: false, error: formatSubagentInteractionUnavailable() };
	mkdirSync(dir, { recursive: true });
	const id = safeId();
	const request: SubagentInteractionRequest = { id, kind, payload, createdAt: Date.now() };
	const requestPath = join(dir, `${id}.request.json`);
	const responsePath = join(dir, `${id}.response.json`);
	atomicWriteJson(requestPath, request);

	const timeoutMs = options.timeoutMs ?? 10 * 60_000;
	const pollMs = options.pollMs ?? 100;
	const deadline = Date.now() + timeoutMs;
	while (Date.now() <= deadline) {
		if (existsSync(responsePath)) {
			try {
				const parsed = JSON.parse(readFileSync(responsePath, "utf8")) as SubagentInteractionResponse;
				return { ok: true, response: parsed };
			} catch {
				return { ok: false, error: "User input bridge response was unreadable in subagent runtime." };
			}
		}
		await sleep(pollMs);
	}
	return { ok: false, error: "User input unavailable in subagent runtime: timed out waiting for parent interaction bridge response." };
}

export async function processPendingSubagentInteractionRequests(
	dir: string,
	handler: (request: SubagentInteractionRequest) => Promise<SubagentInteractionResponse>,
	processed = new Set<string>(),
): Promise<number> {
	if (!existsSync(dir)) return 0;
	let count = 0;
	for (const name of readdirSync(dir).filter((entry) => entry.endsWith(".request.json")).sort()) {
		const requestPath = join(dir, name);
		let request: SubagentInteractionRequest;
		try {
			request = JSON.parse(readFileSync(requestPath, "utf8")) as SubagentInteractionRequest;
		} catch {
			continue;
		}
		if (!request.id || processed.has(request.id)) continue;
		const responsePath = join(dir, `${request.id}.response.json`);
		if (existsSync(responsePath)) {
			processed.add(request.id);
			continue;
		}
		processed.add(request.id);
		const response = await handler(request);
		atomicWriteJson(responsePath, response);
		count += 1;
	}
	return count;
}
