"use client";

import { AutoresizeTextarea } from "@/components/autoresize-textarea";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { createAgent, deleteAgent, listAgents } from "@/lib/api";
import type { Agent } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function AgentsPage() {
  const { token } = useAuth();
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPrompt, setNewPrompt] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Agent | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    listAgents(token)
      .then(setAgents)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setCreating(true);
    setCreateError(null);
    try {
      const agent = await createAgent(token, { name: newName, systemPrompt: newPrompt });
      setAgents((prev) => [agent, ...prev]);
      setNewName("");
      setNewPrompt("");
      setShowCreate(false);
    } catch (err: any) {
      setCreateError(err.message ?? "Failed to create agent");
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!token || !deleteTarget) return;
    try {
      await deleteAgent(token, deleteTarget.agentId);
      setAgents((prev) => prev.filter((a) => a.agentId !== deleteTarget.agentId));
    } catch (err: any) {
      setError(err.message ?? "Failed to delete agent");
    } finally {
      setDeleteTarget(null);
    }
  }

  return (
    <>
      <div className="px-6 py-6">
        {/* Page header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Agents</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {agents.length} agent{agents.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            {showCreate ? "Cancel" : "New Agent"}
          </button>
        </div>

        {/* Create form */}
        {showCreate && (
          <div className="bg-card border rounded-lg p-6 shadow-sm mb-6">
            <h2 className="text-lg font-medium text-card-foreground mb-4">Create new agent</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label
                  htmlFor="agent-name"
                  className="block text-sm font-medium text-foreground mb-1.5"
                >
                  Name
                </label>
                <input
                  id="agent-name"
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="e.g. Morning JIRA Digest"
                />
              </div>
              <div>
                <label
                  htmlFor="agent-prompt"
                  className="block text-sm font-medium text-foreground mb-1.5"
                >
                  System prompt
                </label>
                <AutoresizeTextarea
                  id="agent-prompt"
                  required
                  minRows={3}
                  value={newPrompt}
                  onChange={(e) => setNewPrompt(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="You are a helpful assistant that..."
                />
              </div>
              {createError && (
                <p className="text-sm text-destructive" role="alert">
                  {createError}
                </p>
              )}
              <button
                type="submit"
                disabled={creating}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creating ? "Creating..." : "Create Agent"}
              </button>
            </form>
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive mb-4" role="alert">
            {error}
          </p>
        )}

        {loading && <p className="text-muted-foreground text-center py-12">Loading agents...</p>}

        {!loading && agents.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-2">No agents yet.</p>
            <p className="text-sm text-muted-foreground">
              Click &quot;New Agent&quot; to create your first one.
            </p>
          </div>
        )}

        {!loading && agents.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {agents.map((agent) => (
              <div
                key={agent.agentId}
                className="bg-card border rounded-lg p-5 shadow-sm hover:shadow-md transition-shadow"
              >
                <button
                  onClick={() => router.push(`/agents/${agent.agentId}`)}
                  className="block w-full text-left focus:outline-none focus:ring-2 focus:ring-ring rounded"
                  aria-label={`Open agent ${agent.name}`}
                >
                  <h3 className="font-medium text-card-foreground truncate">{agent.name}</h3>
                  <p className="text-xs text-muted-foreground mt-1">{agent.modelId}</p>
                </button>
                <div className="flex items-center justify-between mt-4 pt-3 border-t">
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span
                      className={
                        agent.status === "active" ? "text-green-600" : "text-muted-foreground"
                      }
                    >
                      {agent.status}
                    </span>
                    <span>v{agent.version}</span>
                  </div>
                  <button
                    onClick={() => setDeleteTarget(agent)}
                    className="text-xs text-muted-foreground hover:text-destructive"
                    aria-label={`Delete agent ${agent.name}`}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete agent"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
