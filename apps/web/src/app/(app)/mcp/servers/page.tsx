"use client";

import { createMcpServer, listMcpServers } from "@/lib/api";
import type { CreateMcpServerInput, McpServer } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

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

function authTypeLabel(authType: string) {
  switch (authType) {
    case "none":
      return "No auth";
    case "static_token":
      return "API Token";
    case "oauth2":
      return "OAuth 2.0";
    default:
      return authType;
  }
}

function AddServerDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (server: McpServer) => void;
}) {
  const { token } = useAuth();
  const nameRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManual, setSlugManual] = useState(false);
  const [description, setDescription] = useState("");
  const [command, setCommand] = useState("npx");
  const [args, setArgs] = useState("");
  const [transport, setTransport] = useState<"stdio" | "http" | "sse">("stdio");
  const [authType, setAuthType] = useState<"none" | "static_token" | "oauth2">("none");
  const [safetyTier, setSafetyTier] = useState<"safe" | "write" | "destructive">("safe");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      nameRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  function deriveSlug(value: string) {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function handleNameChange(value: string) {
    setName(value);
    if (!slugManual) {
      setSlug(deriveSlug(value));
    }
  }

  function handleSlugChange(value: string) {
    setSlugManual(true);
    setSlug(value);
  }

  function resetForm() {
    setName("");
    setSlug("");
    setSlugManual(false);
    setDescription("");
    setCommand("npx");
    setArgs("");
    setTransport("stdio");
    setAuthType("none");
    setSafetyTier("safe");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !name.trim() || !slug.trim()) return;

    setSaving(true);
    setError(null);

    const input: CreateMcpServerInput = {
      name: name.trim(),
      slug: slug.trim(),
      description: description.trim() || undefined,
      transport,
      launchConfig: {
        command: command.trim(),
        args: args
          .trim()
          .split(/\s+/)
          .filter((a) => a),
      },
      authType,
      safetyTier,
    };

    try {
      const server = await createMcpServer(token, input);
      resetForm();
      onCreated(server);
    } catch (err: any) {
      setError(err.message ?? "Failed to create server");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} role="presentation" />
      <div
        className="relative z-50 w-full max-w-lg rounded-lg border bg-card p-6 shadow-lg max-h-[90vh] overflow-y-auto"
        role="dialog"
        aria-labelledby="add-server-title"
      >
        <h2 id="add-server-title" className="text-lg font-semibold text-card-foreground mb-4">
          Add MCP Server
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="srv-name" className="block text-sm font-medium text-foreground mb-1.5">
              Name
            </label>
            <input
              ref={nameRef}
              id="srv-name"
              type="text"
              required
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. Linear"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label htmlFor="srv-slug" className="block text-sm font-medium text-foreground mb-1.5">
              Slug
            </label>
            <input
              id="srv-slug"
              type="text"
              required
              value={slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              placeholder="e.g. linear"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Unique identifier. Lowercase, hyphens allowed.
            </p>
          </div>

          <div>
            <label htmlFor="srv-desc" className="block text-sm font-medium text-foreground mb-1.5">
              Description
            </label>
            <input
              id="srv-desc"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this server do?"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="srv-command"
                className="block text-sm font-medium text-foreground mb-1.5"
              >
                Command
              </label>
              <input
                id="srv-command"
                type="text"
                required
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="npx"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label
                htmlFor="srv-args"
                className="block text-sm font-medium text-foreground mb-1.5"
              >
                Arguments
              </label>
              <input
                id="srv-args"
                type="text"
                value={args}
                onChange={(e) => setArgs(e.target.value)}
                placeholder="-y @linear/mcp-server"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label
                htmlFor="srv-transport"
                className="block text-sm font-medium text-foreground mb-1.5"
              >
                Transport
              </label>
              <select
                id="srv-transport"
                value={transport}
                onChange={(e) => setTransport(e.target.value as typeof transport)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="stdio">stdio</option>
                <option value="http">http</option>
                <option value="sse">sse</option>
              </select>
            </div>
            <div>
              <label
                htmlFor="srv-auth"
                className="block text-sm font-medium text-foreground mb-1.5"
              >
                Auth type
              </label>
              <select
                id="srv-auth"
                value={authType}
                onChange={(e) => setAuthType(e.target.value as typeof authType)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="none">None</option>
                <option value="static_token">API Token</option>
                <option value="oauth2">OAuth 2.0</option>
              </select>
            </div>
            <div>
              <label
                htmlFor="srv-safety"
                className="block text-sm font-medium text-foreground mb-1.5"
              >
                Safety tier
              </label>
              <select
                id="srv-safety"
                value={safetyTier}
                onChange={(e) => setSafetyTier(e.target.value as typeof safetyTier)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="safe">Safe</option>
                <option value="write">Write</option>
                <option value="destructive">Destructive</option>
              </select>
            </div>
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                resetForm();
                onClose();
              }}
              className="rounded-md border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim() || !slug.trim()}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Adding..." : "Add server"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function McpServersPage() {
  const { token } = useAuth();

  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    if (!token) return;

    setLoading(true);
    listMcpServers(token)
      .then(setServers)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  function handleCreated(server: McpServer) {
    setServers((prev) => [...prev, server].sort((a, b) => a.name.localeCompare(b.name)));
    setDialogOpen(false);
  }

  return (
    <div className="px-6 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">MCP Servers</h1>
        <button
          onClick={() => setDialogOpen(true)}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          Add server
        </button>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading...</p>}

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && servers.length === 0 && (
        <p className="text-sm text-muted-foreground">No MCP servers in the catalog.</p>
      )}

      {!loading && servers.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {servers.map((server) => (
            <Link
              key={server.id}
              href={`/mcp/servers/${server.slug}`}
              className="rounded-lg border bg-card p-5 shadow-sm space-y-3 hover:bg-muted/30 transition-colors focus:outline-none focus:ring-2 focus:ring-ring block"
            >
              <div>
                <h2 className="text-sm font-semibold text-card-foreground">{server.name}</h2>
                <p className="text-xs text-muted-foreground font-mono">{server.slug}</p>
              </div>

              {server.description && (
                <p className="text-sm text-muted-foreground line-clamp-2">{server.description}</p>
              )}

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center rounded-full border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    {authTypeLabel(server.authType)}
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                      safetyTierColor(server.safetyTier),
                    )}
                  >
                    {server.safetyTier}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {server.toolsCatalog?.length ?? 0} tool
                  {(server.toolsCatalog?.length ?? 0) !== 1 ? "s" : ""}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <AddServerDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}
