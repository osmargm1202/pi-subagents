import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getAgentDir, getDocsPath, getExamplesPath } from "@earendil-works/pi-coding-agent";

export function getCurrentPackageRoot(): string {
	return dirname(dirname(dirname(fileURLToPath(import.meta.url))));
}

export function getPiDocsDir(): string {
	return getDocsPath();
}

export function getPiExamplesDir(): string {
	return getExamplesPath();
}

export function getCurrentPackageDir(name: string): string | null {
	const candidate = join(getCurrentPackageRoot(), name);
	return existsSync(candidate) ? candidate : null;
}

export function getCurrentPackageAgentsDir(): string | null {
	return getCurrentPackageDir("agents");
}

export function getCurrentPackageAssetsDir(): string | null {
	return getCurrentPackageDir("assets");
}

export function getCurrentPackageAssetsSubagentsDir(): string | null {
	const assetsDir = getCurrentPackageAssetsDir();
	if (!assetsDir) return null;
	const candidate = join(assetsDir, "subagents");
	return existsSync(candidate) ? candidate : null;
}

export function getCurrentPackageAgentDirs(): string[] {
	const dir = getCurrentPackageAssetsSubagentsDir();
	return dir ? [dir] : [];
}

function collectPackageRoots(baseDir: string, maxDepth: number): string[] {
	if (!existsSync(baseDir) || maxDepth < 0) return [];
	const roots: string[] = [];
	let entries;
	try {
		entries = readdirSync(baseDir, { withFileTypes: true });
	} catch {
		return roots;
	}
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const fullPath = join(baseDir, entry.name);
		if (existsSync(join(fullPath, "package.json"))) roots.push(fullPath);
		roots.push(...collectPackageRoots(fullPath, maxDepth - 1));
	}
	return roots;
}

export function findInstalledSkillPath(skillName: string): string | null {
	const clean = skillName.trim();
	if (!clean) return null;

	const directCandidates = [
		join(getCurrentPackageRoot(), "skills", clean, "SKILL.md"),
		join(getAgentDir(), "skills", clean, "SKILL.md"),
		join(homedir(), ".agents", "skills", clean, "SKILL.md"),
	];
	for (const candidate of directCandidates) {
		if (existsSync(candidate)) return candidate;
	}

	const packageRoots = [
		...collectPackageRoots(join(getAgentDir(), "git"), 4),
		...collectPackageRoots(join(getAgentDir(), "npm", "node_modules"), 3),
	];
	for (const root of packageRoots) {
		const candidate = join(root, "skills", clean, "SKILL.md");
		if (existsSync(candidate)) return candidate;
	}

	return null;
}
