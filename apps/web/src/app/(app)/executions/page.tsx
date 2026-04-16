"use client";

import { listExecutions } from "@/lib/api";
import type { Execution } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

function statusColor(status: string) {
  switch (status) {
    case "queued":
      return "bg-yellow-500/15 text-yellow-700 border-yellow-500/30";
    case "running":
      return "bg-blue-500/15 text-blue-700 border-blue-500/30";
    case "succeeded":
    case "completed":
      return "bg-green-500/15 text-green-700 border-green-500/30";
    case "failed":
      return "bg-red-500/15 text-red-700 border-red-500/30";
    case "cancelled":
      return "bg-gray-500/15 text-gray-500 border-gray-500/30";
    default:
      return "bg-gray-500/15 text-gray-500 border-gray-500/30";
  }
}

function formatDuration(startedAt: string, endedAt: string | null): string {
  if (!endedAt) return "running...";
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining}s`;
}

function formatCost(usd: string | number): string {
  const n = typeof usd === "string" ? Number.parseFloat(usd) : usd;
  if (Number.isNaN(n) || n === 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

export default function ExecutionsPage() {
  const { token } = useAuth();
  const router = useRouter();

  const [executions, setExecutions] = useState<Execution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;

    setLoading(true);
    listExecutions(token)
      .then(setExecutions)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div className="px-6 py-6 space-y-6">
      <h1 className="text-xl font-semibold text-foreground">Executions</h1>

      {loading && <p className="text-sm text-muted-foreground">Loading...</p>}

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && executions.length === 0 && (
        <p className="text-sm text-muted-foreground">No executions yet.</p>
      )}

      {!loading && executions.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Agent</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Trigger</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Cost</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Tokens</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Started</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Duration</th>
              </tr>
            </thead>
            <tbody>
              {executions.map((exec) => (
                <tr
                  key={exec.id}
                  onClick={() => router.push(`/executions/${exec.id}`)}
                  className="border-b last:border-b-0 hover:bg-muted/50 cursor-pointer transition-colors"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      router.push(`/executions/${exec.id}`);
                    }
                  }}
                >
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                        statusColor(exec.status),
                      )}
                    >
                      {exec.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {exec.agentId.slice(0, 8)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{exec.triggerType}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {formatCost(exec.totalCostUsd)}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {(exec.totalPromptTokens + exec.totalCompletionTokens).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(exec.startedAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {formatDuration(exec.startedAt, exec.endedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
