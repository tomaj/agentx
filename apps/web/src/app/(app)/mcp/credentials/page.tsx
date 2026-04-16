"use client";

import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  createMcpCredential,
  deleteMcpCredential,
  listMcpCredentials,
  listMcpServers,
} from "@/lib/api";
import type { McpCredential, McpServer } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useEffect, useState } from "react";

export default function McpCredentialsPage() {
  const { token } = useAuth();

  const [credentials, setCredentials] = useState<McpCredential[]>([]);
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add credential form
  const [showForm, setShowForm] = useState(false);
  const [formServerId, setFormServerId] = useState("");
  const [formLabel, setFormLabel] = useState("");
  const [formToken, setFormToken] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [formSaving, setFormSaving] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<McpCredential | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!token) return;

    setLoading(true);
    Promise.all([listMcpCredentials(token), listMcpServers(token)])
      .then(([creds, srvs]) => {
        setCredentials(creds);
        setServers(srvs);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  function resetForm() {
    setShowForm(false);
    setFormServerId("");
    setFormLabel("");
    setFormToken("");
    setFormError(null);
  }

  async function handleCreate() {
    if (!token) return;
    if (!formServerId || !formLabel || !formToken) {
      setFormError("All fields are required.");
      return;
    }

    setFormSaving(true);
    setFormError(null);

    try {
      const created = await createMcpCredential(token, {
        mcpServerId: formServerId,
        label: formLabel,
        token: formToken,
      });
      setCredentials((prev) => [...prev, created]);
      resetForm();
    } catch (err: any) {
      setFormError(err.message ?? "Failed to create credential");
    } finally {
      setFormSaving(false);
    }
  }

  async function handleDelete() {
    if (!token || !deleteTarget) return;

    setDeleting(true);
    try {
      await deleteMcpCredential(token, deleteTarget.id);
      setCredentials((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err: any) {
      setError(err.message ?? "Failed to delete credential");
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="px-6 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Credentials</h1>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            Add Credential
          </button>
        )}
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading...</p>}

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {/* Add credential form */}
      {showForm && (
        <section className="rounded-lg border bg-card p-6 shadow-sm space-y-4">
          <h2 className="text-lg font-medium text-card-foreground">New Credential</h2>

          {formError && (
            <p className="text-sm text-destructive" role="alert">
              {formError}
            </p>
          )}

          <div>
            <label
              htmlFor="cred-server"
              className="block text-sm font-medium text-foreground mb-1.5"
            >
              MCP Server
            </label>
            <select
              id="cred-server"
              value={formServerId}
              onChange={(e) => setFormServerId(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Select a server...</option>
              {servers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.slug})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="cred-label"
              className="block text-sm font-medium text-foreground mb-1.5"
            >
              Label
            </label>
            <input
              id="cred-label"
              type="text"
              value={formLabel}
              onChange={(e) => setFormLabel(e.target.value)}
              placeholder="e.g. My Jira Token"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label
              htmlFor="cred-token"
              className="block text-sm font-medium text-foreground mb-1.5"
            >
              Token
            </label>
            <input
              id="cred-token"
              type="password"
              value={formToken}
              onChange={(e) => setFormToken(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleCreate}
              disabled={formSaving}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {formSaving ? "Saving..." : "Save"}
            </button>
            <button
              onClick={resetForm}
              className="rounded-md border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
            >
              Cancel
            </button>
          </div>
        </section>
      )}

      {/* Credentials list */}
      {!loading && credentials.length === 0 && !showForm && (
        <p className="text-sm text-muted-foreground">
          No credentials yet. Add one to connect your MCP servers.
        </p>
      )}

      {!loading && credentials.length > 0 && (
        <div className="space-y-3">
          {credentials.map((cred) => (
            <div
              key={cred.id}
              className="flex items-center justify-between rounded-lg border bg-card px-5 py-4 shadow-sm"
            >
              <div className="space-y-1">
                <p className="text-sm font-medium text-card-foreground">{cred.label}</p>
                <p className="text-xs text-muted-foreground">
                  {cred.serverName ?? cred.serverSlug} -- {cred.credentialType}
                </p>
                <p className="text-xs text-muted-foreground">
                  Added {new Date(cred.createdAt).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => setDeleteTarget(cred)}
                className="rounded-md border border-destructive/50 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive hover:text-destructive-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete Credential"
        description={
          deleteTarget
            ? `Are you sure you want to delete "${deleteTarget.label}"? This cannot be undone.`
            : ""
        }
        confirmLabel={deleting ? "Deleting..." : "Delete"}
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
