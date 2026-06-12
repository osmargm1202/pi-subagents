import { loadOrgmConfigSlice, orgmConfigPath, saveOrgmConfigSlice } from "./orgm-config.ts";

export interface AgentStatusConfig {
	showWidget: boolean;
	showModel: boolean;
	showTokens: boolean;
	showCost: boolean;
	showPersistence: boolean;
	showSummary: boolean;
	showActivity: boolean;
}

export const AGENT_STATUS_CONFIG_DEFAULTS: AgentStatusConfig = {
	showWidget: true,
	showModel: true,
	showTokens: true,
	showCost: false,
	showPersistence: true,
	showSummary: true,
	showActivity: true,
};

export function getAgentStatusConfigPath(): string {
	return orgmConfigPath();
}

export function loadAgentStatusConfig(configPath?: string): AgentStatusConfig {
	return { ...loadOrgmConfigSlice("agentStatus", configPath) };
}

export function saveAgentStatusConfig(config: AgentStatusConfig, configPath?: string): void {
	saveOrgmConfigSlice("agentStatus", config, configPath);
}
