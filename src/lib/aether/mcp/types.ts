/**
 * MCP connector types for ETA.
 * MCP is optional and never replaces native tools or the agent loop.
 */

export type McpPermissionLevel = "read" | "write" | "destructive";

export type McpConnectorConfig = {
  id: string;
  name: string;
  /** HTTP(S) MCP endpoint. Stdio is not available in the WebView. */
  url: string;
  enabled: boolean;
  hasAuth: boolean;
  allowedPermissions: McpPermissionLevel[];
  discoveredTools?: string[];
  lastError?: string;
  connectedAt?: number;
};

export type McpToolDescriptor = {
  serverId: string;
  serverName: string;
  name: string;
  fullName: string;
  description?: string;
  permission: McpPermissionLevel;
  inputSchema?: Record<string, unknown>;
};

export type McpInvokeResult = {
  ok: boolean;
  source: "mcp";
  server: string;
  tool: string;
  data?: unknown;
  error?: string;
  retryable?: boolean;
};
