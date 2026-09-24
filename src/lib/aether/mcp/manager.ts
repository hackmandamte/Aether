import { mcpCallTool, mcpListTools } from "./http-client";
import {
  classifyToolPermission,
  isPermissionAllowed,
  wrapMcpDataAsUntrusted,
} from "./permissions";
import type {
  McpConnectorConfig,
  McpInvokeResult,
  McpPermissionLevel,
  McpToolDescriptor,
} from "./types";
import { etaLog } from "../log";

const authTokens = new Map<string, string>();
let connectors: McpConnectorConfig[] = [];
let discovered: McpToolDescriptor[] = [];

export function listConnectors(): McpConnectorConfig[] {
  return connectors.map((c) => ({ ...c }));
}

export function getDiscoveredTools(): McpToolDescriptor[] {
  return discovered.slice();
}

export function setAuthToken(connectorId: string, token: string | null): void {
  if (!token) authTokens.delete(connectorId);
  else authTokens.set(connectorId, token);
}

export function upsertConnector(
  config: Omit<McpConnectorConfig, "hasAuth"> & { authToken?: string },
): McpConnectorConfig {
  const { authToken, ...rest } = config;
  const hasAuth = Boolean(authToken || authTokens.has(rest.id));
  if (authToken) authTokens.set(rest.id, authToken);
  const next: McpConnectorConfig = {
    ...rest,
    hasAuth,
    allowedPermissions: rest.allowedPermissions?.length
      ? rest.allowedPermissions
      : (["read"] as McpPermissionLevel[]),
  };
  const idx = connectors.findIndex((c) => c.id === next.id);
  if (idx >= 0) connectors[idx] = next;
  else connectors.push(next);
  etaLog("MCP connector upserted", { id: next.id, enabled: next.enabled });
  return { ...next };
}

export function removeConnector(id: string): void {
  connectors = connectors.filter((c) => c.id !== id);
  authTokens.delete(id);
  discovered = discovered.filter((t) => t.serverId !== id);
  etaLog("MCP connector removed", { id });
}

export function setConnectorEnabled(id: string, enabled: boolean): void {
  const c = connectors.find((x) => x.id === id);
  if (c) c.enabled = enabled;
  if (!enabled) {
    discovered = discovered.filter((t) => t.serverId !== id);
  }
}

export async function connectAndDiscover(
  id: string,
  signal?: AbortSignal,
): Promise<{ ok: boolean; tools: McpToolDescriptor[]; error?: string }> {
  const c = connectors.find((x) => x.id === id);
  if (!c) return { ok: false, tools: [], error: "Unknown connector." };
  if (!c.enabled) return { ok: false, tools: [], error: "Connector is disabled." };

  const listed = await mcpListTools({
    url: c.url,
    authToken: authTokens.get(id),
    signal,
  });

  if (!listed.ok) {
    c.lastError = listed.error;
    etaLog("MCP discover failed", { id, error: listed.error });
    return { ok: false, tools: [], error: listed.error };
  }

  const tools: McpToolDescriptor[] = listed.tools.map((t) => {
    const permission = classifyToolPermission(t.name, t.description);
    return {
      serverId: c.id,
      serverName: c.name,
      name: t.name,
      fullName: `mcp.${c.id}.${t.name}`,
      description: t.description,
      permission,
      inputSchema: t.inputSchema,
    };
  });

  discovered = [...discovered.filter((d) => d.serverId !== id), ...tools];
  c.discoveredTools = tools.map((t) => t.name);
  c.connectedAt = Date.now();
  c.lastError = undefined;
  etaLog("MCP tools discovered", { id, count: tools.length });
  return { ok: true, tools };
}

export async function disconnect(id: string): Promise<void> {
  setConnectorEnabled(id, false);
  discovered = discovered.filter((t) => t.serverId !== id);
  const c = connectors.find((x) => x.id === id);
  if (c) {
    c.discoveredTools = [];
    c.connectedAt = undefined;
  }
  etaLog("MCP disconnected", { id });
}

export async function invokeMcpTool(
  fullName: string,
  args: Record<string, unknown> = {},
  opts: { signal?: AbortSignal; requireConfirmation?: boolean } = {},
): Promise<McpInvokeResult> {
  const m = fullName.match(/^mcp\.([^.]+)\.(.+)$/);
  if (!m) {
    return {
      ok: false,
      source: "mcp",
      server: "",
      tool: fullName,
      error: "Invalid MCP tool name. Expected mcp.<server>.<tool>.",
      retryable: false,
    };
  }
  const [, serverId, toolName] = m;
  const c = connectors.find((x) => x.id === serverId);
  if (!c || !c.enabled) {
    return {
      ok: false,
      source: "mcp",
      server: serverId,
      tool: toolName,
      error: "Connector not connected or not enabled.",
      retryable: false,
    };
  }

  const desc = discovered.find((t) => t.serverId === serverId && t.name === toolName);
  const permission = desc?.permission ?? classifyToolPermission(toolName);
  if (!isPermissionAllowed(permission, c.allowedPermissions)) {
    return {
      ok: false,
      source: "mcp",
      server: serverId,
      tool: toolName,
      error: `Permission denied (${permission} not allowed for this connector).`,
      retryable: false,
    };
  }
  if (permission === "destructive" && opts.requireConfirmation !== true) {
    return {
      ok: false,
      source: "mcp",
      server: serverId,
      tool: toolName,
      error: "Destructive MCP action requires user confirmation.",
      retryable: false,
    };
  }

  const called = await mcpCallTool(
    {
      url: c.url,
      authToken: authTokens.get(serverId),
      signal: opts.signal,
    },
    toolName,
    args,
  );

  if (!called.ok) {
    return {
      ok: false,
      source: "mcp",
      server: serverId,
      tool: toolName,
      error: called.error,
      retryable: called.retryable,
    };
  }

  return {
    ok: true,
    source: "mcp",
    server: serverId,
    tool: toolName,
    data: {
      untrusted: true,
      summary: wrapMcpDataAsUntrusted(called.data),
      payload: called.data,
    },
  };
}

export function isMcpToolName(name: string): boolean {
  return name.startsWith("mcp.") && name.split(".").length >= 3;
}

export function __resetMcpForTests(): void {
  connectors = [];
  discovered = [];
  authTokens.clear();
}
