"use client";

import { AutoresizeTextarea } from "@/components/autoresize-textarea";
import { CopyButton } from "@/components/copy-button";
import { executeAgent, getAgent, listChatSessions, listExecutions, updateAgent } from "@/lib/api";
import type { Agent, ChatSession, Execution } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

type Tab = "agent" | "sessions";

export default function AgentDetailPage() {
  const { token } = useAuth();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [modelId, setModelId] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Run state
  const [running, setRunning] = useState(false);

  // Tabs
  const [activeTab, setActiveTab] = useState<Tab>("agent");

  // Executions
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [executionsLoading, setExecutionsLoading] = useState(false);

  // Chat sessions
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  useEffect(() => {
    if (!token || !id) return;

    setLoading(true);
    getAgent(token, id)
      .then((a) => {
        setAgent(a);
        setName(a.name);
        setSystemPrompt(a.systemPrompt);
        setModelId(a.modelId);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));

    setExecutionsLoading(true);
    listExecutions(token, id)
      .then(setExecutions)
      .catch(() => {})
      .finally(() => setExecutionsLoading(false));

    setSessionsLoading(true);
    listChatSessions(token, id)
      .then(setSessions)
      .catch(() => {})
      .finally(() => setSessionsLoading(false));
  }, [token, id]);

  async function handleSave() {
    if (!token || !id) return;
    setSaving(true);
    setSaveMessage(null);

    try {
      const updated = await updateAgent(token, id, {
        name,
        systemPrompt,
        modelId,
      });
      setAgent(updated);
      setSaveMessage("Saved");
      setEditing(false);
      setTimeout(() => setSaveMessage(null), 2000);
    } catch (err: any) {
      setSaveMessage(err.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function handleCancelEdit() {
    if (!agent) return;
    setName(agent.name);
    setSystemPrompt(agent.systemPrompt);
    setModelId(agent.modelId);
    setEditing(false);
    setSaveMessage(null);
  }

  async function handleRun() {
    if (!token || !id) return;
    setRunning(true);

    try {
      const execution = await executeAgent(token, id);
      router.push(`/executions/${execution.id}`);
    } catch (err: any) {
      setError(err.message ?? "Execution failed to start");
      setRunning(false);
    }
  }

  if (loading) {
    return (
      <div className="px-6 py-6">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (error && !agent) {
    return (
      <div className="px-6 py-6">
        <p className="text-destructive mb-4">{error}</p>
        <Link href="/agents" className="text-sm text-primary hover:underline">
          Back to agents
        </Link>
      </div>
    );
  }

  if (!agent) return null;

  return (
    <div className="px-6 py-6 space-y-6">
      {/* Breadcrumb */}
      <nav className="text-sm text-muted-foreground" aria-label="Breadcrumb">
        <Link href="/agents" className="hover:text-foreground transition-colors">
          Agents
        </Link>
        <span className="mx-1.5">&gt;</span>
        <span className="text-foreground">{agent.name}</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-foreground">{agent.name}</h1>
            <span
              className={
                agent.status === "active"
                  ? "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                  : "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-muted text-muted-foreground"
              }
            >
              {agent.status === "active" ? "Active" : agent.status}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
            <CopyButton
              text={agent.agentId}
              label={`agent_${agent.agentId.slice(0, 8)}...`}
              className="font-mono"
            />
            <span aria-hidden="true">*</span>
            <span>Last updated {timeAgo(agent.updatedAt)}</span>
          </div>
          {agent.description && (
            <p className="text-sm text-muted-foreground mt-2">{agent.description}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!editing ? (
            <button
              onClick={() => setEditing(true)}
              className="rounded-md border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-colors"
            >
              Edit
            </button>
          ) : (
            <>
              <button
                onClick={handleCancelEdit}
                className="rounded-md border px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </>
          )}
          <Link
            href={`/agents/${id}/chat`}
            className="rounded-md border border-primary px-4 py-2 text-sm font-medium text-primary hover:bg-primary hover:text-primary-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-colors"
          >
            Chat
          </Link>
        </div>
      </div>

      {saveMessage && <p className="text-sm text-muted-foreground">{saveMessage}</p>}

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {/* Separator */}
      <hr className="border-border" />

      {/* Tabs */}
      <div className="flex gap-4 border-b" role="tablist" aria-label="Agent sections">
        <button
          role="tab"
          aria-selected={activeTab === "agent"}
          onClick={() => setActiveTab("agent")}
          className={
            activeTab === "agent"
              ? "pb-2 text-sm font-medium text-foreground border-b-2 border-foreground -mb-px"
              : "pb-2 text-sm font-medium text-muted-foreground hover:text-foreground -mb-px"
          }
        >
          Agent
        </button>
        <button
          role="tab"
          aria-selected={activeTab === "sessions"}
          onClick={() => setActiveTab("sessions")}
          className={
            activeTab === "sessions"
              ? "pb-2 text-sm font-medium text-foreground border-b-2 border-foreground -mb-px"
              : "pb-2 text-sm font-medium text-muted-foreground hover:text-foreground -mb-px"
          }
        >
          Sessions
        </button>
      </div>

      {/* Agent tab */}
      {activeTab === "agent" && (
        <div className="space-y-6" role="tabpanel" aria-label="Agent configuration">
          {/* Version */}
          <div className="text-sm">
            <span className="text-muted-foreground">Version: </span>
            <span className="text-foreground">v{agent.version}</span>
          </div>

          {/* Model */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-1">Model</h3>
            {editing ? (
              <input
                type="text"
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                className="w-full max-w-md rounded-md border bg-background px-3 py-2 text-sm text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-ring"
              />
            ) : (
              <p className="text-sm text-foreground font-mono">{agent.modelId}</p>
            )}
          </div>

          {/* Name (edit mode only) */}
          {editing && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-1">Name</h3>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full max-w-md rounded-md border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          )}

          {/* System prompt */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-medium text-muted-foreground">System prompt</h3>
              {!editing && <CopyButton text={agent.systemPrompt} />}
            </div>
            {editing ? (
              <AutoresizeTextarea
                minRows={6}
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-ring"
              />
            ) : (
              <div className="rounded-md border bg-muted px-4 py-3 text-sm text-foreground font-mono whitespace-pre-wrap">
                {agent.systemPrompt}
              </div>
            )}
          </div>

          {/* MCP Bindings */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-2">
              MCP Servers and tools
            </h3>
            {agent.mcpBindings && agent.mcpBindings.length > 0 ? (
              <ul className="space-y-2">
                {agent.mcpBindings.map((binding: any, i: number) => (
                  <li
                    key={i}
                    className="text-sm text-muted-foreground border rounded px-3 py-2 bg-muted"
                  >
                    {binding.serverSlug ?? binding.serverId ?? JSON.stringify(binding)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No MCP servers bound.</p>
            )}
          </div>

          {/* Run button */}
          <div>
            <button
              onClick={handleRun}
              disabled={running}
              className="rounded-md border px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {running ? "Starting..." : "Run (one-shot)"}
            </button>
          </div>

          {/* Recent Executions */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Recent Executions</h3>

            {executionsLoading && <p className="text-sm text-muted-foreground">Loading...</p>}

            {!executionsLoading && executions.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No executions yet. Click &quot;Run&quot; to start one.
              </p>
            )}

            {!executionsLoading && executions.length > 0 && (
              <div className="space-y-2">
                {executions.slice(0, 10).map((exec) => (
                  <button
                    key={exec.id}
                    onClick={() => router.push(`/executions/${exec.id}`)}
                    className="w-full text-left border rounded px-4 py-3 hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span
                          className={
                            exec.status === "completed"
                              ? "text-xs text-green-600"
                              : exec.status === "failed"
                                ? "text-xs text-destructive"
                                : "text-xs text-muted-foreground"
                          }
                        >
                          {exec.status}
                        </span>
                        <span className="text-xs text-muted-foreground">{exec.triggerType}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>${exec.totalCostUsd}</span>
                        <span>{timeAgo(exec.startedAt)}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sessions tab */}
      {activeTab === "sessions" && (
        <div role="tabpanel" aria-label="Chat sessions">
          {sessionsLoading && <p className="text-sm text-muted-foreground">Loading sessions...</p>}

          {!sessionsLoading && sessions.length === 0 && (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground mb-2">No chat sessions yet.</p>
              <Link href={`/agents/${id}/chat`} className="text-sm text-primary hover:underline">
                Start a new chat
              </Link>
            </div>
          )}

          {!sessionsLoading && sessions.length > 0 && (
            <div className="space-y-2">
              {sessions.map((session) => (
                <Link
                  key={session.id}
                  href={`/agents/${id}/chat/${session.id}`}
                  className="block border rounded px-4 py-3 hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-foreground font-medium truncate">
                      {session.title || "Untitled session"}
                    </span>
                    <span className="text-xs text-muted-foreground ml-3 shrink-0">
                      {timeAgo(session.updatedAt)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
