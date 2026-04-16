"use client";

import { discoverMcpServerTools, getMcpServer, getMcpServerAgents } from "@/lib/api";
import type { McpServer, McpServerAgent, McpToolSchema } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

type Tab = "tools" | "agents";

function safetyTierColor(tier: string) {
  switch (tier) {
    case "safe":
      return "bg-green-500/15 text-green-700 border-green-500/30";
    case "write":
      return "bg-yellow-500/15 text-yellow-700 border-yellow-500/30";
    case "destructive":
      return "bg-red-500/15 text-red-700 border-red-500/30";
    default:
      return "bg-gray-500/15 text-gray-500 border-gray-500/30";
  }
}

function ToolCard({ tool }: { tool: McpToolSchema }) {
  const [expanded, setExpanded] = useState(false);
  const properties = tool.inputSchema?.properties ?? {};
  const required = new Set(tool.inputSchema?.required ?? []);
  const paramEntries = Object.entries(properties);

  return (
    <div className="rounded-lg border bg-card shadow-sm">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-5 py-4 flex items-start justify-between gap-4 hover:bg-muted/30 transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-inset rounded-lg"
        aria-expanded={expanded}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-card-foreground font-mono">{tool.name}</h3>
            {paramEntries.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {paramEntries.length} param{paramEntries.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          {tool.description && (
            <p className="mt-1 text-sm text-muted-foreground">{tool.description}</p>
          )}
        </div>
        <span
          className="mt-1 text-muted-foreground shrink-0 transition-transform"
          aria-hidden="true"
          style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M4 6l4 4 4-4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>

      {expanded && paramEntries.length > 0 && (
        <div className="border-t px-5 py-4">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Parameters
          </h4>
          <div className="space-y-3">
            {paramEntries.map(([name, schema]) => (
              <div key={name} className="flex items-start gap-3">
                <div className="flex items-center gap-1.5 shrink-0 min-w-[140px]">
                  <code className="text-xs font-mono text-foreground">{name}</code>
                  {required.has(name) && (
                    <span className="text-xs text-red-500" title="Required">
                      *
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <span className="inline-flex items-center rounded border bg-muted px-1.5 py-0.5 text-xs font-mono text-muted-foreground">
                    {schema.type}
                    {schema.items?.type ? `[${schema.items.type}]` : ""}
                  </span>
                  {schema.description && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{schema.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AgentRow({ agent }: { agent: McpServerAgent }) {
  return (
    <Link
      href={`/agents/${agent.agentId}`}
      className="flex items-center justify-between rounded-lg border bg-card px-5 py-4 shadow-sm hover:bg-muted/30 transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
    >
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold text-card-foreground">{agent.name}</h3>
        {agent.description && (
          <p className="mt-0.5 text-sm text-muted-foreground truncate">{agent.description}</p>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0 ml-4">
        <span className="text-xs font-mono text-muted-foreground">{agent.modelId}</span>
        <span
          className={cn(
            "text-xs",
            agent.status === "active" ? "text-green-600" : "text-muted-foreground",
          )}
        >
          {agent.status}
        </span>
      </div>
    </Link>
  );
}

export default function McpServerDetailPage() {
  const { token } = useAuth();
  const { slug } = useParams<{ slug: string }>();

  const [server, setServer] = useState<McpServer | null>(null);
  const [agents, setAgents] = useState<McpServerAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("tools");
  const [discovering, setDiscovering] = useState(false);
  const [discoverError, setDiscoverError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !slug) return;

    setLoading(true);
    Promise.all([getMcpServer(token, slug), getMcpServerAgents(token, slug)])
      .then(([s, a]) => {
        setServer(s);
        setAgents(a);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token, slug]);

  async function handleDiscover() {
    if (!token || !slug) return;
    setDiscovering(true);
    setDiscoverError(null);
    try {
      const updated = await discoverMcpServerTools(token, slug);
      setServer(updated);
    } catch (err: any) {
      setDiscoverError(err.message ?? "Discovery failed");
    } finally {
      setDiscovering(false);
    }
  }

  if (loading) {
    return (
      <div className="px-6 py-6">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (error || !server) {
    return (
      <div className="px-6 py-6">
        <p className="text-sm text-destructive mb-4" role="alert">
          {error ?? "Server not found"}
        </p>
        <Link href="/mcp/servers" className="text-sm text-primary hover:underline">
          Back to MCP Servers
        </Link>
      </div>
    );
  }

  const tools = (server.toolsCatalog ?? []) as McpToolSchema[];

  return (
    <div className="px-6 py-6 space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-4 mb-2">
          <Link
            href="/mcp/servers"
            className="text-sm text-muted-foreground hover:text-foreground"
            aria-label="Back to MCP Servers"
          >
            &larr; MCP Servers
          </Link>
          <h1 className="text-xl font-semibold text-foreground">{server.name}</h1>
        </div>

        {server.description && (
          <p className="text-sm text-muted-foreground mb-4">{server.description}</p>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 rounded-lg border bg-card p-4">
          <div>
            <dt className="text-xs text-muted-foreground mb-1">Transport</dt>
            <dd className="text-sm font-medium text-foreground">
              {server.transport.toUpperCase()}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground mb-1">Authentication</dt>
            <dd className="text-sm font-medium text-foreground">
              {server.authType === "none"
                ? "None"
                : server.authType === "static_token"
                  ? "API Token"
                  : "OAuth 2.0"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground mb-1">Safety tier</dt>
            <dd>
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                  safetyTierColor(server.safetyTier),
                )}
              >
                {server.safetyTier}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground mb-1">Source</dt>
            <dd className="text-sm font-medium text-foreground">
              {server.isBuiltin ? "Built-in" : "Custom"}
              {server.requiresIsolation && (
                <span className="ml-2 inline-flex items-center rounded-full border border-orange-500/30 bg-orange-500/15 px-2 py-0.5 text-xs font-medium text-orange-700">
                  isolated
                </span>
              )}
            </dd>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b" role="tablist" aria-label="Server details">
        <div className="flex gap-0">
          <button
            role="tab"
            aria-selected={activeTab === "tools"}
            aria-controls="panel-tools"
            onClick={() => setActiveTab("tools")}
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",
              activeTab === "tools"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30",
            )}
          >
            Tools
            <span className="ml-1.5 text-xs text-muted-foreground">({tools.length})</span>
          </button>
          <button
            role="tab"
            aria-selected={activeTab === "agents"}
            aria-controls="panel-agents"
            onClick={() => setActiveTab("agents")}
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",
              activeTab === "agents"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30",
            )}
          >
            Agents
            <span className="ml-1.5 text-xs text-muted-foreground">({agents.length})</span>
          </button>
        </div>
      </div>

      {/* Tab panels */}
      {activeTab === "tools" && (
        <div id="panel-tools" role="tabpanel" aria-labelledby="tab-tools" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={handleDiscover}
                disabled={discovering}
                className="rounded-md border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {discovering ? "Discovering..." : "Refresh tools"}
              </button>
              {discoverError && (
                <p className="text-sm text-destructive" role="alert">
                  {discoverError}
                </p>
              )}
            </div>
            {tools.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Last updated {new Date(server.updatedAt).toLocaleString()}
              </p>
            )}
          </div>

          {tools.length === 0 && !discovering ? (
            <p className="text-sm text-muted-foreground">
              No tools discovered yet. Click &quot;Refresh tools&quot; to connect to the server and
              load its tools.
            </p>
          ) : (
            <div className="space-y-3">
              {tools.map((tool) => (
                <ToolCard key={tool.name} tool={tool} />
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "agents" && (
        <div id="panel-agents" role="tabpanel" aria-labelledby="tab-agents">
          {agents.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No agents are currently using this MCP server.
            </p>
          ) : (
            <div className="space-y-2">
              {agents.map((agent) => (
                <AgentRow key={agent.id} agent={agent} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
