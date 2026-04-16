"use client";

import { getExecution, getExecutionEvents } from "@/lib/api";
import type { Execution, ExecutionEvent } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TERMINAL_STATUSES = ["succeeded", "failed", "cancelled"];

function isTerminal(status: string) {
  return TERMINAL_STATUSES.includes(status);
}

function statusColor(status: string) {
  switch (status) {
    case "queued":
      return "bg-yellow-500/15 text-yellow-700 border-yellow-500/30";
    case "running":
      return "bg-blue-500/15 text-blue-700 border-blue-500/30";
    case "succeeded":
      return "bg-green-500/15 text-green-700 border-green-500/30";
    case "failed":
      return "bg-red-500/15 text-red-700 border-red-500/30";
    case "cancelled":
      return "bg-gray-500/15 text-gray-500 border-gray-500/30";
    default:
      return "bg-gray-500/15 text-gray-500 border-gray-500/30";
  }
}

function eventBorderColor(type: string) {
  switch (type) {
    case "llm_request":
    case "llm_response":
      return "border-l-blue-500";
    case "tool_call":
    case "tool_result":
      return "border-l-green-500";
    case "error":
      return "border-l-red-500";
    case "execution_started":
      return "border-l-gray-400";
    case "execution_completed":
      return "border-l-gray-400";
    default:
      return "border-l-gray-300";
  }
}

function eventDotColor(type: string) {
  switch (type) {
    case "llm_request":
    case "llm_response":
      return "bg-blue-500";
    case "tool_call":
    case "tool_result":
      return "bg-green-500";
    case "error":
      return "bg-red-500";
    case "execution_started":
    case "execution_completed":
      return "bg-gray-400";
    default:
      return "bg-gray-300";
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

function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });
}

function formatCost(usd: string | number): string {
  const n = typeof usd === "string" ? Number.parseFloat(usd) : usd;
  if (Number.isNaN(n) || n === 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        statusColor(status),
      )}
    >
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Summary bar
// ---------------------------------------------------------------------------

function SummaryBar({ execution }: { execution: Execution }) {
  return (
    <div className="grid grid-cols-2 gap-4 rounded-lg border border-border bg-card p-4 sm:grid-cols-4">
      <div>
        <p className="text-xs font-medium text-muted-foreground">Status</p>
        <div className="mt-1">
          <StatusBadge status={execution.status} />
        </div>
      </div>
      <div>
        <p className="text-xs font-medium text-muted-foreground">Duration</p>
        <p className="mt-1 text-sm font-medium">
          {formatDuration(execution.startedAt, execution.endedAt)}
        </p>
      </div>
      <div>
        <p className="text-xs font-medium text-muted-foreground">Tokens</p>
        <p className="mt-1 text-sm font-medium">
          {execution.totalPromptTokens.toLocaleString()} prompt /{" "}
          {execution.totalCompletionTokens.toLocaleString()} completion
        </p>
      </div>
      <div>
        <p className="text-xs font-medium text-muted-foreground">Cost</p>
        <p className="mt-1 text-sm font-medium">{formatCost(execution.totalCostUsd)}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Event renderers
// ---------------------------------------------------------------------------

function EventExecutionStarted({ payload }: { payload: Record<string, any> }) {
  return (
    <div>
      <p className="text-sm font-medium">Execution started</p>
      {payload.agentName && (
        <p className="mt-1 text-xs text-muted-foreground">Agent: {payload.agentName}</p>
      )}
      {payload.modelId && <p className="text-xs text-muted-foreground">Model: {payload.modelId}</p>}
      {payload.input && (
        <pre className="mt-2 max-h-40 overflow-auto rounded bg-muted p-2 font-mono text-xs">
          {formatJson(payload.input)}
        </pre>
      )}
    </div>
  );
}

function EventLlmRequest({ payload }: { payload: Record<string, any> }) {
  return (
    <div>
      <p className="text-sm font-medium">LLM Request</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Model: {payload.model ?? "unknown"}
        {payload.messageCount != null && <> -- {payload.messageCount} messages</>}
      </p>
    </div>
  );
}

function EventLlmResponse({ payload }: { payload: Record<string, any> }) {
  const text = payload.text ?? payload.content ?? "";
  const toolCalls: { name: string }[] = payload.toolCalls ?? [];
  return (
    <div>
      <p className="text-sm font-medium">LLM Response</p>
      {text && (
        <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 font-mono text-xs">
          {truncate(String(text), 2000)}
        </pre>
      )}
      {toolCalls.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-medium text-muted-foreground">Tool calls requested:</p>
          <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
            {toolCalls.map((tc, i) => (
              <li key={i}>{tc.name ?? "unknown"}</li>
            ))}
          </ul>
        </div>
      )}
      {(payload.promptTokens != null || payload.completionTokens != null) && (
        <p className="mt-1 text-xs text-muted-foreground">
          Tokens: {payload.promptTokens ?? 0} prompt / {payload.completionTokens ?? 0} completion
        </p>
      )}
    </div>
  );
}

function EventToolCall({ payload }: { payload: Record<string, any> }) {
  return (
    <div>
      <p className="text-sm font-medium">
        Tool Call: <span className="font-mono">{payload.name ?? "unknown"}</span>
      </p>
      {payload.args != null && (
        <pre className="mt-2 max-h-60 overflow-auto rounded bg-muted p-2 font-mono text-xs">
          {formatJson(payload.args)}
        </pre>
      )}
    </div>
  );
}

function EventToolResult({ payload }: { payload: Record<string, any> }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium">Tool Result</p>
        {payload.isError && (
          <span className="inline-flex items-center rounded-full border border-red-500/30 bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-700">
            error
          </span>
        )}
      </div>
      {payload.durationMs != null && (
        <p className="mt-1 text-xs text-muted-foreground">Duration: {payload.durationMs}ms</p>
      )}
      {payload.result != null && (
        <pre
          className={cn(
            "mt-2 max-h-60 overflow-auto whitespace-pre-wrap rounded p-2 font-mono text-xs",
            payload.isError ? "bg-red-500/10" : "bg-muted",
          )}
        >
          {truncate(
            typeof payload.result === "string" ? payload.result : formatJson(payload.result),
            2000,
          )}
        </pre>
      )}
    </div>
  );
}

function EventError({ payload }: { payload: Record<string, any> }) {
  return (
    <div>
      <p className="text-sm font-medium text-red-700">Error</p>
      <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap rounded bg-red-500/10 p-2 font-mono text-xs text-red-800">
        {payload.message ?? payload.error ?? formatJson(payload)}
      </pre>
    </div>
  );
}

function EventExecutionCompleted({ payload }: { payload: Record<string, any> }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium">Execution completed</p>
        {payload.status && <StatusBadge status={payload.status} />}
      </div>
      {payload.totalCostUsd != null && (
        <p className="mt-1 text-xs text-muted-foreground">
          Total cost: {formatCost(payload.totalCostUsd)}
        </p>
      )}
      {payload.output != null && (
        <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 font-mono text-xs">
          {truncate(
            typeof payload.output === "string" ? payload.output : formatJson(payload.output),
            2000,
          )}
        </pre>
      )}
    </div>
  );
}

function EventGeneric({ event }: { event: ExecutionEvent }) {
  return (
    <div>
      <p className="text-sm font-medium">{event.type}</p>
      <pre className="mt-2 max-h-40 overflow-auto rounded bg-muted p-2 font-mono text-xs">
        {formatJson(event.payload)}
      </pre>
    </div>
  );
}

function renderEventContent(event: ExecutionEvent) {
  switch (event.type) {
    case "execution_started":
      return <EventExecutionStarted payload={event.payload} />;
    case "llm_request":
      return <EventLlmRequest payload={event.payload} />;
    case "llm_response":
      return <EventLlmResponse payload={event.payload} />;
    case "tool_call":
      return <EventToolCall payload={event.payload} />;
    case "tool_result":
      return <EventToolResult payload={event.payload} />;
    case "error":
      return <EventError payload={event.payload} />;
    case "execution_completed":
      return <EventExecutionCompleted payload={event.payload} />;
    default:
      return <EventGeneric event={event} />;
  }
}

// ---------------------------------------------------------------------------
// Timeline event card
// ---------------------------------------------------------------------------

function TimelineEvent({ event }: { event: ExecutionEvent }) {
  return (
    <div className="relative pl-8">
      {/* Dot on the timeline */}
      <div
        className={cn(
          "absolute left-0 top-2 h-3 w-3 rounded-full ring-2 ring-background",
          eventDotColor(event.type),
        )}
      />
      {/* Card */}
      <div
        className={cn(
          "rounded-lg border border-border bg-card p-4 border-l-4",
          eventBorderColor(event.type),
        )}
      >
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">#{event.seq}</span>
          <span className="text-xs text-muted-foreground">{formatTimestamp(event.timestamp)}</span>
        </div>
        {renderEventContent(event)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ExecutionTimelinePage() {
  const { token } = useAuth();
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [execution, setExecution] = useState<Execution | null>(null);
  const [events, setEvents] = useState<ExecutionEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const timelineEndRef = useRef<HTMLDivElement>(null);
  const prevEventCountRef = useRef(0);

  // Fetch execution + events
  const fetchData = useCallback(async () => {
    if (!token || !id) return;
    try {
      const [exec, evts] = await Promise.all([
        getExecution(token, id),
        getExecutionEvents(token, id),
      ]);
      setExecution(exec);
      setEvents(evts.sort((a, b) => a.seq - b.seq));
      setError(null);
    } catch (err: any) {
      setError(err.message ?? "Failed to load execution");
    } finally {
      setLoading(false);
    }
  }, [token, id]);

  // Initial fetch
  useEffect(() => {
    if (token) {
      fetchData();
    }
  }, [token, fetchData]);

  // Poll while non-terminal
  useEffect(() => {
    if (!execution || isTerminal(execution.status)) return;

    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, [execution, fetchData]);

  // Auto-scroll when new events arrive
  useEffect(() => {
    if (events.length > prevEventCountRef.current) {
      timelineEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevEventCountRef.current = events.length;
  }, [events.length]);

  // Loading state
  if (loading) {
    return (
      <div className="px-6 py-6">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  // Error state
  if (error || !execution) {
    return (
      <div className="px-6 py-6">
        <p className="text-sm text-destructive mb-4">{error ?? "Execution not found"}</p>
        <button
          onClick={() => router.back()}
          className="text-sm text-muted-foreground underline hover:text-foreground"
        >
          Go back
        </button>
      </div>
    );
  }

  return (
    <div className="px-6 py-6 space-y-6">
      {/* Page header */}
      <div>
        <button
          onClick={() => router.push("/executions")}
          className="mb-2 text-xs text-muted-foreground hover:text-foreground"
        >
          &larr; Back to executions
        </button>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-foreground">
            Execution{" "}
            <span className="font-mono text-base text-muted-foreground">{id.slice(0, 8)}</span>
          </h1>
          <StatusBadge status={execution.status} />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Agent:{" "}
          <button
            onClick={() => router.push(`/agents/${execution.agentId}`)}
            className="underline hover:text-foreground"
          >
            {execution.agentId.slice(0, 8)}
          </button>
          {" -- "}
          Trigger: {execution.triggerType}
        </p>
      </div>

      {/* Summary */}
      <SummaryBar execution={execution} />

      {/* Timeline */}
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute bottom-0 left-[5px] top-0 w-0.5 bg-border" />

        <div className="flex flex-col gap-4">
          {events.length === 0 && (
            <p className="pl-8 text-sm text-muted-foreground">
              No events yet.
              {!isTerminal(execution.status) && " Waiting for agent..."}
            </p>
          )}
          {events.map((event) => (
            <TimelineEvent key={event.id} event={event} />
          ))}
        </div>

        <div ref={timelineEndRef} />
      </div>

      {/* Running indicator */}
      {!isTerminal(execution.status) && (
        <div className="flex items-center gap-2 pl-8">
          <div className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
          <p className="text-xs text-muted-foreground">
            Execution is {execution.status}... polling for updates
          </p>
        </div>
      )}
    </div>
  );
}
