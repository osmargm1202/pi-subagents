import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, parse, relative } from "node:path";
import { getAgentDir, parseFrontmatter } from "@earendil-works/pi-coding-agent";
import { getCurrentPackageAgentDirs } from "./package-paths.ts";

export type AgentSource = "user" | "project";
export type AgentScope = "user" | "project" | "both";

export interface AgentDiscoveryOptions {
	projectTrusted?: boolean;
}

export const SYSTEM_AGENT = "pi";
export const DEFAULT_PRIMARY_AGENT = SYSTEM_AGENT;

export interface AgentConfig {
	name: string;
	description: string;
	tools: string[];
	model?: string;
	systemPrompt: string;
	source: AgentSource;
	filePath: string;
	namespace?: string;
	displayName: string;
}

export function parseTools(value: unknown): string[] {
	if (typeof value !== "string") return [];
	return value.split(",").map((tool) => tool.trim()).filter(Boolean);
}

export function readAgentConfig(filePath: string, source: AgentSource, rootDir?: string): AgentConfig | undefined {
	try {
		const raw = readFileSync(filePath, "utf8");
		const { frontmatter, body } = parseFrontmatter<Record<string, string>>(raw);
		const namespacePath = rootDir ? relative(rootDir, dirname(filePath)) : "";
		const namespace = namespacePath && namespacePath !== "." ? namespacePath.split("\\").join("/") : undefined;
		const name = frontmatter.name || parse(filePath).name;
		return {
			name,
			description: frontmatter.description || name,
			tools: parseTools(frontmatter.tools),
			model: frontmatter.model?.trim() || undefined,
			systemPrompt: body.trim(),
			source,
			filePath,
			namespace,
			displayName: namespace ? `${namespace}/${name}` : name,
		} satisfies AgentConfig;
	} catch {
		return undefined;
	}
}

function loadAgentsRecursiveFromDir(
	dir: string,
	source: AgentSource,
	options?: {
		excludeDirNames?: Set<string>;
		excludeFileNames?: Set<string>;
	},
): AgentConfig[] {
	if (!existsSync(dir)) return [];
	const agents: AgentConfig[] = [];
	const excludeDirNames = options?.excludeDirNames ?? new Set<string>();
	const excludeFileNames = options?.excludeFileNames ?? new Set<string>();

	const walk = (currentDir: string) => {
		let entries: string[];
		try {
			entries = readdirSync(currentDir);
		} catch {
			return;
		}
		for (const entry of entries) {
			const fullPath = join(currentDir, entry);
			let stat;
			try {
				stat = lstatSync(fullPath);
			} catch {
				continue;
			}
			if (stat.isDirectory()) {
				if (excludeDirNames.has(entry)) continue;
				walk(fullPath);
				continue;
			}
			if (!(stat.isFile() || stat.isSymbolicLink()) || !entry.endsWith(".md")) continue;
			if (excludeFileNames.has(entry)) continue;
			const agent = readAgentConfig(fullPath, source, dir);
			if (agent) agents.push(agent);
		}
	};

	walk(dir);
	return agents;
}

function mergeByName<T extends { name: string }>(
	userItems: T[],
	projectItems: T[],
	scope: AgentScope,
): T[] {
	const merged = new Map<string, T>();
	if (scope !== "project") {
		for (const item of userItems) merged.set(item.name, item);
	}
	if (scope !== "user") {
		for (const item of projectItems) merged.set(item.name, item);
	}
	return Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function findNearestProjectSubagentsDirs(cwd: string): string[] {
	let current = cwd;
	while (true) {
		const candidates = [
			join(current, ".pi", "assets", "subagents"),
			join(current, ".pi", "agent", "assets", "subagents"),
		].filter((candidate) => {
			try {
				return lstatSync(candidate).isDirectory();
			} catch {
				return false;
			}
		});
		if (candidates.length > 0) return candidates;
		const parentPath = dirname(current);
		if (parentPath === current) return [];
		current = parentPath;
	}
}

function getUserSubagentDirs(): string[] {
	return [join(getAgentDir(), "assets", "subagents")];
}

export const getPackageAgentsDir = () => getCurrentPackageAgentDirs()[0] ?? null;
export const getPackageAgentDirs = getCurrentPackageAgentDirs;

export function discoverDeployableAgents(cwd: string, scope: AgentScope = "both", discoveryOptions: AgentDiscoveryOptions = {}): AgentConfig[] {
	const options = {
		excludeFileNames: new Set(["index.md"]),
	};
	const packageAgents = getPackageAgentDirs().flatMap((dir) => loadAgentsRecursiveFromDir(dir, "user", options));
	const userAgents = scope === "project"
		? []
		: getUserSubagentDirs().flatMap((dir) => loadAgentsRecursiveFromDir(dir, "user", options));
	const projectTrusted = discoveryOptions.projectTrusted !== false;
	const projectAgents = scope === "user" || !projectTrusted
		? []
		: findNearestProjectSubagentsDirs(cwd).flatMap((dir) => loadAgentsRecursiveFromDir(dir, "project", options));

	const merged = new Map<string, AgentConfig>();
	for (const agent of packageAgents) merged.set(agent.name, agent);
	if (scope !== "project") {
		for (const agent of userAgents) merged.set(agent.name, agent);
	}
	if (scope !== "user") {
		for (const agent of projectAgents) merged.set(agent.name, agent);
	}
	return Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function findDeployableAgent(cwd: string, name: string, scope: AgentScope = "both", discoveryOptions: AgentDiscoveryOptions = {}): AgentConfig | undefined {
	return discoverDeployableAgents(cwd, scope, discoveryOptions).find((agent) => agent.name === name);
}

export function normalizePrimaryName(name: string): string {
	return name;
}

export function formatPrimaryLabel(name: string): string {
	return name === SYSTEM_AGENT ? SYSTEM_AGENT : `mode:${name}`;
}
