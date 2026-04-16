import { agents, chatMessages, chatSessions, executionEvents, executions } from "@agentx/db";
import type { Database } from "@agentx/db";
import Anthropic from "@anthropic-ai/sdk";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import type { Actor } from "../auth/types";
import { DB } from "../database/database.module";

interface StreamEvent {
  type: string;
  [key: string]: unknown;
}

@Injectable()
export class ChatService {
  private readonly anthropic: Anthropic;

  constructor(@Inject(DB) private readonly db: Database) {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  // ── Sessions ──

  async listSessions(userId: string, agentId: string) {
    return this.db
      .select()
      .from(chatSessions)
      .where(and(eq(chatSessions.userId, userId), eq(chatSessions.agentId, agentId)))
      .orderBy(desc(chatSessions.updatedAt));
  }

  async createSession(userId: string, agentId: string, title?: string) {
    const [session] = await this.db
      .insert(chatSessions)
      .values({ userId, agentId, title: title ?? "New chat" })
      .returning();
    return session!;
  }

  async deleteSession(sessionId: string, userId: string) {
    const result = await this.db
      .delete(chatSessions)
      .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, userId)))
      .returning({ id: chatSessions.id });
    return result.length > 0;
  }

  async getMessages(sessionId: string) {
    return this.db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, sessionId))
      .orderBy(chatMessages.createdAt);
  }

  // ── Chat ──

  async chat(
    actor: Actor,
    agentId: string,
    sessionId: string,
    userMessage: string,
    emit: (event: StreamEvent) => void,
  ): Promise<void> {
    // 1. Load agent
    const [agent] = await this.db
      .select()
      .from(agents)
      .where(
        and(eq(agents.agentId, agentId), eq(agents.orgId, actor.orgId), eq(agents.isCurrent, true)),
      );
    if (!agent) throw new NotFoundException("Agent not found");

    const params = (agent.params ?? {}) as Record<string, any>;

    // 2. Save user message
    await this.db.insert(chatMessages).values({
      sessionId,
      role: "user",
      content: userMessage,
    });

    // 3. Load full conversation history
    const history = await this.getMessages(sessionId);

    // 4. Auto-title on first message
    if (history.length === 1) {
      const title = userMessage.length > 60 ? `${userMessage.substring(0, 57)}...` : userMessage;
      await this.db.update(chatSessions).set({ title }).where(eq(chatSessions.id, sessionId));
    }

    // 5. Create execution record for audit
    const [execution] = await this.db
      .insert(executions)
      .values({
        agentId: agent.agentId,
        agentSnapshotId: agent.id,
        triggerType: "chat",
        status: "running",
        initiatedBy: actor.userId,
        input: { sessionId, message: userMessage },
      })
      .returning();

    const executionId = execution!.id;
    let seq = 0;

    const logEvent = async (type: string, payload: Record<string, unknown>) => {
      seq++;
      const timestamp = new Date().toISOString();
      await this.db.insert(executionEvents).values({ executionId, seq, type, payload });
      emit({ type: "event", event: { seq, type, timestamp, ...payload } });
    };

    try {
      emit({
        type: "session_start",
        executionId,
        agent: { name: agent.name, model: agent.modelId },
      });

      await logEvent("execution_started", {
        agentName: agent.name,
        model: agent.modelId,
        messageCount: history.length,
      });

      // 6. Build Anthropic messages from full history
      const anthropicMessages: Anthropic.MessageParam[] = history.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      const startTime = Date.now();
      await logEvent("llm_request", {
        model: agent.modelId,
        messageCount: anthropicMessages.length,
      });

      // 7. Stream response
      const stream = this.anthropic.messages.stream({
        model: agent.modelId,
        max_tokens: params.maxTokens ?? 4096,
        temperature: params.temperature ?? 0.2,
        system: agent.systemPrompt,
        messages: anthropicMessages,
      });

      let fullResponse = "";
      stream.on("text", (text) => {
        fullResponse += text;
        emit({ type: "chunk", text });
      });

      const finalMessage = await stream.finalMessage();
      const durationMs = Date.now() - startTime;

      const usage = {
        inputTokens: finalMessage.usage.input_tokens,
        outputTokens: finalMessage.usage.output_tokens,
      };
      const cacheRead = (finalMessage.usage as any).cache_read_input_tokens ?? 0;
      const cacheCreation = (finalMessage.usage as any).cache_creation_input_tokens ?? 0;

      // 8. Save assistant message
      await this.db.insert(chatMessages).values({
        sessionId,
        role: "assistant",
        content: fullResponse,
      });

      // Update session timestamp
      await this.db
        .update(chatSessions)
        .set({ updatedAt: new Date() })
        .where(eq(chatSessions.id, sessionId));

      await logEvent("llm_response", {
        durationMs,
        usage,
        cacheRead,
        cacheCreation,
        finishReason: finalMessage.stop_reason,
      });

      const costUsd = (usage.inputTokens * 3 + usage.outputTokens * 15) / 1_000_000;
      await logEvent("execution_completed", { status: "succeeded", costUsd, durationMs });

      await this.db
        .update(executions)
        .set({
          status: "succeeded",
          output: { text: fullResponse },
          endedAt: new Date(),
          totalPromptTokens: usage.inputTokens,
          totalCompletionTokens: usage.outputTokens,
          totalCostUsd: costUsd.toFixed(6),
        })
        .where(eq(executions.id, executionId));

      emit({ type: "done", usage, costUsd, durationMs, executionId });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      await logEvent("error", { error: errorMsg });
      await this.db
        .update(executions)
        .set({ status: "failed", error: { message: errorMsg }, endedAt: new Date() })
        .where(eq(executions.id, executionId));
      emit({ type: "error", message: errorMsg });
    }
  }
}
