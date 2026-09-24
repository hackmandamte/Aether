/**
 * Minimal MCP-over-HTTP client for ETA (browser / WebView).
 * JSON-RPC 2.0 POST. Stdio is not supported in WebView.
 */

export type McpHttpOptions = {
  url: string;
  authToken?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
};

type JsonRpcResponse = {
  jsonrpc?: string;
  id?: string | number;
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
};

let rpcId = 1;

async function rpc(
  opts: McpHttpOptions,
  method: string,
  params?: Record<string, unknown>,
): Promise<JsonRpcResponse> {
  const controller = new AbortController();
  const timeout = opts.timeoutMs ?? 15_000;
  const timer = setTimeout(() => controller.abort(), timeout);
  const signal = opts.signal
    ? AbortSignal.any([opts.signal, controller.signal])
    : controller.signal;

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    if (opts.authToken) {
      headers.Authorization = `Bearer ${opts.authToken}`;
    }

    const res = await fetch(opts.url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: rpcId++,
        method,
        params: params ?? {},
      }),
      signal,
    });

    if (!res.ok) {
      return { error: { code: res.status, message: `MCP HTTP ${res.status}` } };
    }

    const ctype = res.headers.get("content-type") ?? "";
    if (ctype.includes("text/event-stream")) {
      const text = await res.text();
      const dataLine = text
        .split("\n")
        .map((l) => l.trim())
        .find((l) => l.startsWith("data:"));
      if (dataLine) {
        try {
          return JSON.parse(dataLine.slice(5).trim()) as JsonRpcResponse;
        } catch {
          return { error: { message: "Invalid MCP SSE payload" } };
        }
      }
      return { error: { message: "Empty MCP SSE stream" } };
    }

    return (await res.json()) as JsonRpcResponse;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "MCP request failed";
    return { error: { message: msg } };
  } finally {
    clearTimeout(timer);
  }
}

export type DiscoveredTool = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
};

export async function mcpListTools(opts: McpHttpOptions): Promise<
  | { ok: true; tools: DiscoveredTool[] }
  | { ok: false; error: string; retryable: boolean }
> {
  const res = await rpc(opts, "tools/list");
  if (res.error) {
    return { ok: false, error: res.error.message ?? "tools/list failed", retryable: true };
  }
  const result = res.result as { tools?: DiscoveredTool[] } | undefined;
  const tools = Array.isArray(result?.tools) ? result!.tools! : [];
  return { ok: true, tools };
}

export async function mcpCallTool(
  opts: McpHttpOptions,
  name: string,
  args: Record<string, unknown> = {},
): Promise<
  | { ok: true; data: unknown }
  | { ok: false; error: string; retryable: boolean }
> {
  const res = await rpc(opts, "tools/call", { name, arguments: args });
  if (res.error) {
    return {
      ok: false,
      error: res.error.message ?? "tools/call failed",
      retryable: /timeout|network|503|429/i.test(res.error.message ?? ""),
    };
  }
  return { ok: true, data: res.result };
}
