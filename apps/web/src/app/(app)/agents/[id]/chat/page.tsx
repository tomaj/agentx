"use client";

import { AutoresizeTextarea } from "@/components/autoresize-textarea";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Markdown } from "@/components/markdown";
import {
  createChatSession,
  deleteChatSession,
  getAgent,
  getChatMessages,
  listChatSessions,
  sendChatMessage,
} from "@/lib/api";
import type { Agent, ChatMessage, ChatSession, ChatStreamEvent } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

interface DisplayMessage extends ChatMessage {
  isStreaming?: boolean;
}

interface DebugEvent {
  id: string;
  timestamp: string;
  type: string;
  data: Record<string, unknown>;
}

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function ChatPage() {
  const { token } = useAuth();
  const { id: agentId } = useParams<{ id: string }>();

  const [agent, setAgent] = useState<Agent | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debug panel
  const [debugEvents, setDebugEvents] = useState<DebugEvent[]>([]);
  const [showDebug, setShowDebug] = useState(true);
  const [totalCost, setTotalCost] = useState(0);
  const [totalTokens, setTotalTokens] = useState({ input: 0, output: 0 });

  // Delete confirmation
  const [deleteSessionId, setDeleteSessionId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const debugEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load agent + sessions on mount
  useEffect(() => {
    if (!token || !agentId) return;

    getAgent(token, agentId)
      .then(setAgent)
      .catch((err) => setError(err.message));

    setIsLoadingSessions(true);
    listChatSessions(token, agentId)
      .then((list) => {
        setSessions(list);
        if (list.length > 0) {
          setActiveSessionId(list[0].id);
        }
        setIsLoadingSessions(false);
      })
      .catch((err) => {
        setError(err.message);
        setIsLoadingSessions(false);
      });
  }, [token, agentId]);

  // Auto-create session if none exist
  useEffect(() => {
    if (!token || !agentId || isLoadingSessions) return;
    if (sessions.length === 0) {
      createChatSession(token, agentId, "New chat")
        .then((session) => {
          setSessions([session]);
          setActiveSessionId(session.id);
        })
        .catch((err) => setError(err.message));
    }
  }, [token, agentId, sessions.length, isLoadingSessions]);

  // Load messages when active session changes
  useEffect(() => {
    if (!token || !agentId || !activeSessionId) return;

    setIsLoadingMessages(true);
    setMessages([]);
    setDebugEvents([]);
    setTotalCost(0);
    setTotalTokens({ input: 0, output: 0 });

    getChatMessages(token, agentId, activeSessionId)
      .then((msgs) => {
        setMessages(msgs.map((m) => ({ ...m, isStreaming: false })));
        setIsLoadingMessages(false);
      })
      .catch((err) => {
        setError(err.message);
        setIsLoadingMessages(false);
      });
  }, [token, agentId, activeSessionId]);

  // Auto-scroll messages
  const scrollTrigger = messages.reduce((acc, m) => acc + m.content.length, 0);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [scrollTrigger]);

  // Auto-scroll debug
  const debugCount = debugEvents.length;
  useEffect(() => {
    if (debugCount > 0) {
      debugEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [debugCount]);

  function addDebugEvent(type: string, data: Record<string, unknown>) {
    setDebugEvents((prev) => [
      ...prev,
      { id: crypto.randomUUID(), timestamp: new Date().toISOString(), type, data },
    ]);
  }

  const handleNewChat = useCallback(async () => {
    if (!token || !agentId) return;
    try {
      const session = await createChatSession(token, agentId, "New chat");
      setSessions((prev) => [session, ...prev]);
      setActiveSessionId(session.id);
    } catch (err: any) {
      setError(err.message);
    }
  }, [token, agentId]);

  const handleDeleteSession = useCallback(async () => {
    if (!token || !agentId || !deleteSessionId) return;
    try {
      await deleteChatSession(token, agentId, deleteSessionId);
      setSessions((prev) => {
        const next = prev.filter((s) => s.id !== deleteSessionId);
        if (activeSessionId === deleteSessionId) {
          setActiveSessionId(next.length > 0 ? next[0].id : null);
        }
        return next;
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDeleteSessionId(null);
    }
  }, [token, agentId, deleteSessionId, activeSessionId]);

  async function handleSend() {
    if (!token || !agentId || !activeSessionId || !input.trim() || isLoading) return;

    const userMessage: DisplayMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
      sessionId: activeSessionId,
      createdAt: new Date().toISOString(),
    };

    const assistantMessage: DisplayMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      sessionId: activeSessionId,
      createdAt: new Date().toISOString(),
      isStreaming: true,
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    const messageText = input.trim();
    setInput("");
    setIsLoading(true);
    setError(null);

    await sendChatMessage(
      token,
      agentId,
      activeSessionId,
      messageText,
      (event: ChatStreamEvent) => {
        switch (event.type) {
          case "chunk":
            assistantMessage.content += event.text as string;
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantMessage.id ? { ...assistantMessage } : m)),
            );
            break;

          case "session_start":
            addDebugEvent("session_start", {
              executionId: event.executionId,
              agent: event.agent,
            });
            break;

          case "event":
            addDebugEvent(
              (event.event as any)?.type ?? "event",
              event.event as Record<string, unknown>,
            );
            break;

          case "done":
            assistantMessage.isStreaming = false;
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantMessage.id ? { ...assistantMessage } : m)),
            );
            setTotalCost((prev) => prev + ((event.costUsd as number) ?? 0));
            if (event.usage) {
              const u = event.usage as { inputTokens: number; outputTokens: number };
              setTotalTokens((prev) => ({
                input: prev.input + u.inputTokens,
                output: prev.output + u.outputTokens,
              }));
            }
            addDebugEvent("done", {
              costUsd: event.costUsd,
              durationMs: event.durationMs,
              usage: event.usage,
            });
            setIsLoading(false);
            inputRef.current?.focus();
            break;

          case "error":
            assistantMessage.content += `\n\nError: ${event.message}`;
            assistantMessage.isStreaming = false;
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantMessage.id ? { ...assistantMessage } : m)),
            );
            addDebugEvent("error", { message: event.message });
            setError(event.message as string);
            setIsLoading(false);
            break;
        }
      },
    );
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  if (!agent) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Loading agent...</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-2.5 shrink-0">
        <div className="flex items-center gap-3">
          <Link
            href={`/agents/${agentId}`}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            &larr;
          </Link>
          <h1 className="text-sm font-semibold text-foreground">{agent.name}</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {totalTokens.input > 0 && (
              <>
                <span>{totalTokens.input + totalTokens.output} tokens</span>
                <span>${totalCost.toFixed(4)}</span>
              </>
            )}
          </div>
          <button
            onClick={() => setShowDebug(!showDebug)}
            className={cn(
              "rounded px-2.5 py-1 text-xs font-medium transition-colors",
              showDebug
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Transcript
          </button>
        </div>
      </div>

      {/* Main area */}
      <div className="flex flex-1 min-h-0">
        {/* Session sidebar */}
        <div className="w-64 border-r flex flex-col bg-card shrink-0">
          <div className="px-3 py-2.5 border-b">
            <button
              onClick={handleNewChat}
              className="w-full rounded-md border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
            >
              + New chat
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {isLoadingSessions ? (
              <p className="text-xs text-muted-foreground text-center py-4">Loading...</p>
            ) : (
              <div className="py-1" role="list" aria-label="Chat sessions">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    role="listitem"
                    onClick={() => setActiveSessionId(session.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setActiveSessionId(session.id);
                      }
                    }}
                    className={cn(
                      "group flex items-center justify-between px-3 py-2 cursor-pointer text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-ring",
                      session.id === activeSessionId
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{session.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {timeAgo(session.updatedAt)}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteSessionId(session.id);
                      }}
                      className="ml-2 rounded p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring transition-opacity"
                      aria-label={`Delete session ${session.title}`}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M3 6h18" />
                        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Chat panel */}
        <div className="flex flex-1 flex-col min-w-0">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {isLoadingMessages ? (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-muted-foreground">Loading messages...</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <p className="text-base font-medium text-foreground mb-1">{agent.name}</p>
                <p className="text-sm text-muted-foreground max-w-md">
                  {agent.systemPrompt.length > 150
                    ? `${agent.systemPrompt.substring(0, 150)}...`
                    : agent.systemPrompt}
                </p>
                <p className="text-xs text-muted-foreground mt-3">
                  Send a message to start chatting
                </p>
              </div>
            ) : (
              <div className="mx-auto max-w-2xl space-y-3">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}
                  >
                    <div
                      className={cn(
                        "max-w-[85%] rounded-lg px-3.5 py-2.5 text-sm",
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground",
                      )}
                    >
                      {msg.role === "assistant" ? (
                        <Markdown content={msg.content} />
                      ) : (
                        <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                      )}
                      {msg.isStreaming && msg.content === "" && (
                        <span className="text-xs text-muted-foreground">Thinking...</span>
                      )}
                      {msg.isStreaming && msg.content !== "" && (
                        <span className="inline-block w-1.5 h-3.5 ml-0.5 bg-current animate-pulse rounded-sm" />
                      )}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="mx-4 mb-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Input */}
          <div className="border-t px-4 py-3 shrink-0">
            <div className="mx-auto max-w-2xl flex gap-2">
              <AutoresizeTextarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message... (Enter to send)"
                minRows={1}
                disabled={isLoading}
                className="flex-1 rounded-md border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              />
              <button
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                className="self-end rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? "..." : "Send"}
              </button>
            </div>
          </div>
        </div>

        {/* Debug panel */}
        {showDebug && (
          <div className="w-80 border-l flex flex-col bg-card shrink-0">
            <div className="px-3 py-2.5 border-b">
              <h2 className="text-xs font-semibold text-card-foreground uppercase tracking-wider">
                Transcript
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-2 text-xs">
              {debugEvents.length === 0 && (
                <p className="text-muted-foreground py-4 text-center">Events will appear here</p>
              )}
              <div className="space-y-1.5">
                {debugEvents.map((evt) => (
                  <DebugEventCard key={evt.id} event={evt} />
                ))}
                <div ref={debugEndRef} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Delete session confirmation dialog */}
      <ConfirmDialog
        open={deleteSessionId !== null}
        title="Delete session"
        description="This will permanently delete this chat session and all its messages. This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDeleteSession}
        onCancel={() => setDeleteSessionId(null)}
      />
    </div>
  );
}

function DebugEventCard({ event }: { event: DebugEvent }) {
  const time = new Date(event.timestamp).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const colorMap: Record<string, string> = {
    session_start: "border-l-blue-500",
    execution_started: "border-l-blue-400",
    llm_request: "border-l-violet-500",
    llm_response: "border-l-violet-400",
    execution_completed: "border-l-green-500",
    done: "border-l-green-500",
    error: "border-l-red-500",
  };

  const labelMap: Record<string, string> = {
    session_start: "Session started",
    execution_started: "Execution started",
    llm_request: "Model request",
    llm_response: "Model response",
    execution_completed: "Completed",
    done: "Done",
    error: "Error",
  };

  return (
    <div
      className={cn(
        "rounded-r border-l-2 bg-muted/50 px-2.5 py-1.5",
        colorMap[event.type] ?? "border-l-gray-400",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="font-medium text-foreground">{labelMap[event.type] ?? event.type}</span>
        <span className="text-muted-foreground">{time}</span>
      </div>
      {event.type === "llm_request" && event.data.model != null && (
        <p className="text-muted-foreground mt-0.5">
          {String(event.data.model)} / {String(event.data.messageCount)} messages
        </p>
      )}
      {event.type === "llm_response" && event.data.durationMs != null && (
        <p className="text-muted-foreground mt-0.5">
          {`${event.data.durationMs}ms`}
          {event.data.usage != null &&
            ` / ${(event.data.usage as any).inputTokens + (event.data.usage as any).outputTokens} tokens`}
          {Number(event.data.cacheRead || 0) > 0 && ` / ${String(event.data.cacheRead)} cache read`}
        </p>
      )}
      {event.type === "done" && (
        <p className="text-muted-foreground mt-0.5">
          ${Number(event.data.costUsd).toFixed(4)} / {String(event.data.durationMs)}ms
        </p>
      )}
      {event.type === "error" && (
        <p className="text-red-500 mt-0.5">{String(event.data.message)}</p>
      )}
    </div>
  );
}
