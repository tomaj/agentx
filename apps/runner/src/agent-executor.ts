import { agents, executionEvents, executions } from "@agentx/db";
import type { Database } from "@agentx/db";
import Anthropic from "@anthropic-ai/sdk";
import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import type { ExecutionJobData } from "./execution.processor";
import { DB } from "./runner.module";

interface AgentConfig {
  systemPrompt: string;
  modelId: string;
  params: {
    temperature?: number;
    maxTokens?: number;
    maxIterations?: number;
    maxCostUsd?: number;
    hardTimeoutMs?: number;
    parallelToolCalls?: boolean;
  };
  mcpBindings: Array<{
    mcpServerId: string;
    mcpServerSlug: string;
    credentialId: string | null;
    allowedTools: string[] | null;
    enabled: boolean;
  }>;
}

@Injectable()
export class AgentExecutor {
  private readonly anthropic: Anthropic;

  constructor(@Inject(DB) private readonly db: Database) {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  async run(jobData: ExecutionJobData): Promise<void> {
    const { executionId, agentSnapshotId } = jobData;
    let seq = 0;

    const emitEvent = async (type: string, payload: Record<string, unknown>) => {
      seq++;
      await this.db.insert(executionEvents).values({
        executionId,
        seq,
        type,
        payload,
      });
    };

    try {
      // 1. Mark as running
      await this.db
        .update(executions)
        .set({ status: "running" })
        .where(eq(executions.id, executionId));

      // 2. Load agent snapshot
      const [agent] = await this.db.select().from(agents).where(eq(agents.id, agentSnapshotId));

      if (!agent) {
        throw new Error(`Agent snapshot ${agentSnapshotId} not found`);
      }

      const config = this.parseAgentConfig(agent);

      // 3. Load execution input
      const [execution] = await this.db
        .select()
        .from(executions)
        .where(eq(executions.id, executionId));

      const userInput =
        typeof execution?.input === "object" && execution.input !== null
          ? JSON.stringify(execution.input)
          : "Run the task as described in your system prompt.";

      await emitEvent("execution_started", {
        input: execution?.input,
        agentConfig: {
          model: config.modelId,
          systemPrompt: `${config.systemPrompt.substring(0, 200)}...`,
        },
      });

      // 4. Run the agentic loop
      const maxIterations = config.params.maxIterations ?? 25;
      const maxTokens = config.params.maxTokens ?? 4096;
      const temperature = config.params.temperature ?? 0.2;
      const hardTimeoutMs = config.params.hardTimeoutMs ?? 600_000;

      const startTime = Date.now();
      let totalPromptTokens = 0;
      let totalCompletionTokens = 0;
      let finalOutput = "";

      const messages: Anthropic.MessageParam[] = [{ role: "user", content: userInput }];

      // MCP tools are not loaded in MVP skeleton — agents use plain LLM for now
      // Full MCP tool loading will be added when MCP stdio client is implemented

      for (let iteration = 0; iteration < maxIterations; iteration++) {
        // Timeout check
        if (Date.now() - startTime > hardTimeoutMs) {
          await emitEvent("error", { error: "Execution timed out" });
          break;
        }

        await emitEvent("llm_request", {
          model: config.modelId,
          messageCount: messages.length,
          iteration,
        });

        // Call Anthropic API
        const response = await this.anthropic.messages.create({
          model: config.modelId,
          max_tokens: maxTokens,
          temperature,
          system: config.systemPrompt,
          messages,
        });

        totalPromptTokens += response.usage.input_tokens;
        totalCompletionTokens += response.usage.output_tokens;

        // Process response content blocks
        const toolCalls: Array<{ id: string; name: string; input: unknown }> = [];
        let textOutput = "";

        for (const block of response.content) {
          if (block.type === "text") {
            textOutput += block.text;
          } else if (block.type === "tool_use") {
            toolCalls.push({
              id: block.id,
              name: block.name,
              input: block.input,
            });
          }
        }

        await emitEvent("llm_response", {
          text: textOutput,
          toolCalls,
          usage: {
            promptTokens: response.usage.input_tokens,
            completionTokens: response.usage.output_tokens,
          },
          finishReason: response.stop_reason,
        });

        // If no tool calls, we're done
        if (response.stop_reason === "end_turn" || toolCalls.length === 0) {
          finalOutput = textOutput;
          break;
        }

        // Process tool calls (MVP: no real MCP tools, return error for unknown tools)
        messages.push({ role: "assistant", content: response.content });

        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const tc of toolCalls) {
          await emitEvent("tool_call", {
            id: tc.id,
            name: tc.name,
            args: tc.input,
          });

          // MVP placeholder: tools are not connected yet
          const result = {
            type: "tool_result" as const,
            tool_use_id: tc.id,
            content: `Tool "${tc.name}" is not available in this execution environment.`,
            is_error: true,
          };

          await emitEvent("tool_result", {
            id: tc.id,
            result: result.content,
            isError: true,
            durationMs: 0,
          });

          toolResults.push(result);
        }

        messages.push({ role: "user", content: toolResults });
      }

      // 5. Calculate cost (approximate: Sonnet 4.6 pricing)
      const costUsd = (totalPromptTokens * 3 + totalCompletionTokens * 15) / 1_000_000;

      // 6. Finalize execution
      await this.db
        .update(executions)
        .set({
          status: "succeeded",
          output: { text: finalOutput },
          endedAt: new Date(),
          totalPromptTokens,
          totalCompletionTokens,
          totalCostUsd: costUsd.toFixed(6),
        })
        .where(eq(executions.id, executionId));

      await emitEvent("execution_completed", {
        status: "succeeded",
        output: { text: finalOutput.substring(0, 500) },
        budget: {
          costUsd,
          promptTokens: totalPromptTokens,
          completionTokens: totalCompletionTokens,
        },
      });

      console.log(
        `[Runner] Execution ${executionId} completed. Cost: $${costUsd.toFixed(4)}, Tokens: ${totalPromptTokens + totalCompletionTokens}`,
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      await emitEvent("error", { error: errorMsg });
      await emitEvent("execution_completed", { status: "failed", error: errorMsg });

      await this.db
        .update(executions)
        .set({
          status: "failed",
          error: { message: errorMsg },
          endedAt: new Date(),
        })
        .where(eq(executions.id, executionId));
    }
  }

  private parseAgentConfig(agent: Record<string, unknown>): AgentConfig {
    return {
      systemPrompt: agent.systemPrompt as string,
      modelId: agent.modelId as string,
      params: (agent.params as AgentConfig["params"]) ?? {},
      mcpBindings: (agent.mcpBindings as AgentConfig["mcpBindings"]) ?? [],
    };
  }
}
