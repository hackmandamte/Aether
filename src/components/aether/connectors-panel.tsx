/**
 * Minimal Connectors UI — optional MCP HTTP endpoints.
 * Secrets stay local; never sent to the model.
 */
import { useState } from "react";
import {
  connectAndDiscover,
  disconnect,
  listConnectors,
  upsertConnector,
  setAuthToken,
  type McpConnectorConfig,
} from "@/lib/aether/mcp";
import { Button } from "@/components/ui/button";

export function ConnectorsPanel() {
  const [list, setList] = useState<McpConnectorConfig[]>(() => listConnectors());
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function refresh() {
    setList(listConnectors());
  }

  async function addConnector() {
    if (!name.trim() || !url.trim()) {
      setMsg("Name and URL are required.");
      return;
    }
    const id = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .slice(0, 32);
    upsertConnector({
      id,
      name: name.trim(),
      url: url.trim(),
      enabled: true,
      allowedPermissions: ["read"],
      authToken: token.trim() || undefined,
    });
    if (token.trim()) setAuthToken(id, token.trim());
    setName("");
    setUrl("");
    setToken("");
    setMsg("Connector saved. Tap Connect to discover tools.");
    refresh();
  }

  async function onConnect(id: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await connectAndDiscover(id);
      setMsg(res.ok ? `Connected — ${res.tools.length} tools.` : res.error ?? "Failed.");
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function onDisconnect(id: string) {
    await disconnect(id);
    setMsg("Disconnected.");
    refresh();
  }

  return (
    <div className="space-y-4 px-4 pb-6">
      <p className="text-sm text-muted">
        Optional MCP connectors (HTTP). Secrets stay on-device. Stdio MCP is not available in the
        WebView.
      </p>

      <div className="space-y-2">
        <input
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          placeholder="Name (e.g. notes)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          placeholder="MCP URL (https://…)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <input
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          placeholder="Auth token (optional)"
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          autoComplete="off"
        />
        <Button type="button" size="sm" onClick={() => void addConnector()} disabled={busy}>
          Add connector
        </Button>
      </div>

      {msg ? <p className="text-xs text-faint">{msg}</p> : null}

      <ul className="space-y-3">
        {list.map((c) => (
          <li key={c.id} className="rounded-lg border border-border p-3">
            <div className="font-medium text-sm">{c.name}</div>
            <div className="truncate text-xs text-faint">{c.url}</div>
            <div className="mt-2 flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => void onConnect(c.id)}
              >
                Connect
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => void onDisconnect(c.id)}
              >
                Disconnect
              </Button>
            </div>
            {c.discoveredTools?.length ? (
              <p className="mt-1 text-xs text-faint">{c.discoveredTools.length} tools discovered</p>
            ) : null}
            {c.lastError ? <p className="mt-1 text-xs text-destructive">{c.lastError}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
