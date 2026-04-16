"use client";

import { AutoresizeTextarea } from "@/components/autoresize-textarea";
import { executeAgent, getAgent, listExecutions, updateAgent } from "@/lib/api";
import type { Agent, Execution } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function AgentDetailPage() {
  const { token } = useAuth();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Editable fields
  const [name, setName] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [modelId, setModelId] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Run state
  const [running, setRunning] = useState(false);

  // Executions
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [executionsLoading, setExecutionsLoading] = useState(false);

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
      setTimeout(() => setSaveMessage(null), 2000);
    } catch (err: any) {
      setSaveMessage(err.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
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
        <button
          onClick={() => router.push("/agents")}
          className="text-sm text-primary hover:underline"
        >
          Back to agents
        </button>
      </div>
    );
  }

  if (!agent) return null;

  return (
    <div className="px-6 py-6 space-y-8">
      {/* Page header */}
      <div>
        <div className="flex items-center gap-4 mb-1">
          <button
            onClick={() => router.push("/agents")}
            className="text-sm text-muted-foreground hover:text-foreground"
            aria-label="Back to agents"
          >
            &larr; Agents
          </button>
          <h1 className="text-xl font-semibold text-foreground">{agent.name}</h1>
        </div>
        <div className="flex items-center gap-3 pl-[calc(theme(spacing.4)+3.5rem)]">
          <span className="text-xs text-muted-foreground">v{agent.version}</span>
          <span
            className={
              agent.status === "active" ? "text-xs text-green-600" : "text-xs text-muted-foreground"
            }
          >
            {agent.status}
          </span>
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {/* Editor */}
      <section className="bg-card border rounded-lg p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-medium text-card-foreground">Configuration</h2>

        <div>
          <label htmlFor="name" className="block text-sm font-medium text-foreground mb-1.5">
            Name
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div>
          <label htmlFor="model" className="block text-sm font-medium text-foreground mb-1.5">
            Model ID
          </label>
          <input
            id="model"
            type="text"
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div>
          <label htmlFor="prompt" className="block text-sm font-medium text-foreground mb-1.5">
            System prompt
          </label>
          <AutoresizeTextarea
            id="prompt"
            minRows={6}
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            onClick={() => router.push(`/agents/${id}/chat`)}
            className="rounded-md border border-primary px-4 py-2 text-sm font-medium text-primary hover:bg-primary hover:text-primary-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-colors"
          >
            Chat
          </button>
          <button
            onClick={handleRun}
            disabled={running}
            className="rounded-md border px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {running ? "Starting..." : "Run (one-shot)"}
          </button>
          {saveMessage && <span className="text-sm text-muted-foreground">{saveMessage}</span>}
        </div>
      </section>

      {/* MCP Bindings */}
      {agent.mcpBindings && agent.mcpBindings.length > 0 && (
        <section className="bg-card border rounded-lg p-6 shadow-sm">
          <h2 className="text-lg font-medium text-card-foreground mb-4">MCP Bindings</h2>
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
        </section>
      )}

      {/* Recent Executions */}
      <section className="bg-card border rounded-lg p-6 shadow-sm">
        <h2 className="text-lg font-medium text-card-foreground mb-4">Recent Executions</h2>

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
                    <span>{new Date(exec.startedAt).toLocaleString()}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
