import { createRequire } from "node:module";
import type { AgentSource } from "./agent-discovery.ts";
import type { OrgmAgentModelsConfig } from "./orgm-config.ts";

const require = createRequire(import.meta.url);
const { truncateToWidth, visibleWidth } = loadPiTui();

function fallbackTruncateToWidth(text: string, width: number): string {
	if (width <= 0) return "";
	const chars = Array.from(text);
	return chars.length <= width ? text : chars.slice(0, width).join("");
}

function fallbackVisibleWidth(text: string): number {
	return Array.from(text).length;
}

function loadPiTui(): { truncateToWidth: (text: string, width: number) => string; visibleWidth: (text: string) => number } {
	try {
		return require("@earendil-works/pi-tui") as { truncateToWidth: (text: string, width: number) => string; visibleWidth: (text: string) => number };
	} catch {
		return { truncateToWidth: fallbackTruncateToWidth, visibleWidth: fallbackVisibleWidth };
	}
}

export const SUBAGENT_WIDGET_KEY = "pdd-orgm-agents";
export const SUBAGENT_STATUS_KEY = "pdd-orgm-agents";
export const SUBAGENT_ENV_FLAG = "PI_PDD_SUBAGENT";
export const SUBAGENTS_EVENT = "subagents:deployments-changed";

export type DeploymentStatus = "running" | "idle" | "done" | "error" | "paused_provider_error" | "awaiting_user_input";
export type AgentDeployMode = "ephemeral" | "persistent";
export type AgentLaunchBackend = "embedded";
export type RuntimeStatus = "idle" | "busy";
export type TerminalState = "attached" | "missing" | "closed";
export type RecoverableReason = "provider_error";
export type FailureKind = "task_error" | "provider_error" | "orchestrator_error";

export interface UsageStats {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
	contextTokens: number;
	turns: number;
}

export interface DeploymentState {
	deploymentId: string;
	agent: string;
	instanceNumber?: number;
	source: AgentSource;
	tools: string[];
	model?: string;
	mode?: AgentDeployMode;
	launchBackend?: AgentLaunchBackend;
	runtimeId?: string;
	reusedRuntime?: boolean;
	reuseSummary?: string;
	sessionFilePath?: string;
	ownerSessionFile?: string;
	parentRuntimeId?: string;
	depth?: number;
	contextWindow: number;
	contextTokens: number;
	status: DeploymentStatus;
	summary: string;
	currentActivity?: string;
	turns: number;
	usage: UsageStats;
	exitCode?: number;
	stopReason?: string;
	errorMessage?: string;
	failureKind?: FailureKind;
	recoverableReason?: RecoverableReason;
	expectedArtifactTopicKey?: string;
	persistedArtifactTopicKey?: string;
	persistedToPddMemory?: boolean;
	pddMemoryWrites: number;
	attemptedModels: string[];
	primaryModel?: string;
	fallbackModel?: string;
	fallbackUsed: boolean;
}

export interface RuntimeSnapshot {
	runtimeId: string;
	agent: string;
	source: AgentSource;
	mode: AgentDeployMode;
	launchBackend: AgentLaunchBackend;
	model?: string;
	sessionFilePath?: string;
	ownerSessionFile?: string;
	contextWindow: number;
	contextTokens: number;
	status: RuntimeStatus;
	busyDeploymentId?: string;
	lastUsedAt: number;
	createdAt: number;
	runs: number;
	reuseCount: number;
	parentRuntimeId?: string;
	depth?: number;
	lastStopReason?: string;
	lastErrorMessage?: string;
	terminalState?: TerminalState;
	pid?: number;
	processStartedAt?: number;
	tmuxWindowId?: string;
	tmuxPaneId?: string;
	recoverableReason?: RecoverableReason;
	awaitingUserInput?: boolean;
	lastVisibleState?: DeploymentStatus;
}

export type DeploymentTranscriptKind = "task" | "assistant" | "thinking" | "tool_call" | "tool_result" | "status" | "stderr" | "error";

export interface DeploymentTranscriptEntry {
	kind: DeploymentTranscriptKind;
	title: string;
	text?: string;
	toolName?: string;
	ts: number;
}

export type DeploymentTranscriptMap = Record<string, DeploymentTranscriptEntry[]>;

export function zeroUsage(contextTokens = 0): UsageStats {
	return {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		cost: 0,
		contextTokens,
		turns: 0,
	};
}

export function truncateStatusText(text: string, max = 96): string {
	const clean = text.replace(/\s+/g, " ").trim();
	if (clean.length <= max) return clean;
	return `${clean.slice(0, Math.max(0, max - 1))}…`;
}

export function formatTokens(count: number): string {
	if (!Number.isFinite(count) || count <= 0) return "0";
	if (count < 1000) return `${count}`;
	if (count < 10_000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1_000_000) return `${Math.round(count / 1000)}k`;
	return `${(count / 1_000_000).toFixed(1)}M`;
}

export function formatBar(percent: number): string {
	const normalized = Math.max(0, Math.min(100, Math.round(percent)));
	const filled = Math.max(0, Math.min(10, Math.round(normalized / 10)));
	return `[${"#".repeat(filled)}${"-".repeat(10 - filled)}]${normalized}%`;
}

export function shortenMiddle(text: string, maxWidth: number): string {
	if (visibleWidth(text) <= maxWidth) return text;
	if (maxWidth <= 1) return "…";
	if (maxWidth <= 6) return truncateToWidth(text, maxWidth);
	const keep = Math.max(1, Math.floor((maxWidth - 1) / 2));
	return `${text.slice(0, keep)}…${text.slice(-keep)}`;
}

export function formatDeploymentLabel(deployment: Pick<DeploymentState, "agent" | "instanceNumber">): string {
	return `${deployment.agent} ${deployment.instanceNumber ?? 1}`;
}

export function getDeployAgentInlineStatusText(details: Pick<DeploymentState, "deploymentId" | "source">): string {
	const instance = details.deploymentId.includes("#")
		? `#${details.deploymentId.split("#").pop()}`
		: details.deploymentId;
	return `${instance} · ${details.source}`;
}

export function getDeployAgentInlineRuntimeParts(details: Pick<DeploymentState, "runtimeId" | "reusedRuntime" | "depth">): string[] {
	return [
		details.runtimeId ? `runtime: ${details.runtimeId}` : undefined,
		details.reusedRuntime ? "reused" : "new",
		details.depth ? `depth: ${details.depth}` : undefined,
	].filter((part): part is string => Boolean(part));
}

export function resolveConfiguredSubagentModel(agentName: string, agentModels: OrgmAgentModelsConfig): string | undefined {
	const configured = agentModels[agentName];
	return typeof configured === "string" && configured.trim().length > 0 ? configured.trim() : undefined;
}

export function deriveRuntimePlaceholder(runtime: RuntimeSnapshot): DeploymentState {
	return {
		deploymentId: `runtime:${runtime.runtimeId}`,
		agent: runtime.agent,
		instanceNumber: 1,
		source: runtime.source,
		tools: [],
		model: runtime.model,
		mode: runtime.mode,
		launchBackend: runtime.launchBackend,
		runtimeId: runtime.runtimeId,
		reusedRuntime: runtime.reuseCount > 0,
		reuseSummary: `runtime ${runtime.runtimeId} idle · ${runtime.reuseCount} reuses`,
		sessionFilePath: runtime.sessionFilePath,
		ownerSessionFile: runtime.ownerSessionFile,
		parentRuntimeId: runtime.parentRuntimeId,
		depth: runtime.depth ?? 0,
		contextWindow: runtime.contextWindow,
		contextTokens: runtime.contextTokens,
		status: runtime.awaitingUserInput ? "awaiting_user_input" : runtime.recoverableReason === "provider_error" ? "paused_provider_error" : "idle",
		summary: runtime.recoverableReason === "provider_error"
			? `provider paused · ${runtime.agent}`
			: runtime.awaitingUserInput
				? `awaiting input · ${runtime.agent}`
				: `persistent runtime idle · ${runtime.runs} runs`,
		currentActivity: runtime.recoverableReason === "provider_error"
			? `paused · provider error${runtime.tmuxPaneId ? ` · ${runtime.tmuxPaneId}` : ""}`
			: runtime.awaitingUserInput
				? "awaiting user input"
				: `idle · reusable · ${runtime.reuseCount} reuses`,
		turns: 0,
		usage: zeroUsage(runtime.contextTokens),
		stopReason: runtime.lastStopReason,
		errorMessage: runtime.lastErrorMessage,
		recoverableReason: runtime.recoverableReason,
		pddMemoryWrites: 0,
		attemptedModels: [],
		fallbackUsed: false,
	};
}
