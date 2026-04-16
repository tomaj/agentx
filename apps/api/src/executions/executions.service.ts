import { agents, executionEvents, executions } from "@agentx/db";
import type { Database } from "@agentx/db";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Queue } from "bullmq";
import { and, desc, eq } from "drizzle-orm";
import type { Actor } from "../auth/types";
import { DB } from "../database/database.module";
import { EXECUTIONS_QUEUE } from "./constants";

@Injectable()
export class ExecutionsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(EXECUTIONS_QUEUE) private readonly queue: Queue,
  ) {}

  async execute(actor: Actor, agentId: string, input?: Record<string, unknown>) {
    // 1. Find current agent version scoped to org
    const [agent] = await this.db
      .select()
      .from(agents)
      .where(
        and(eq(agents.agentId, agentId), eq(agents.orgId, actor.orgId), eq(agents.isCurrent, true)),
      );

    if (!agent) throw new NotFoundException("Agent not found");

    // 2. Create execution record
    const [execution] = await this.db
      .insert(executions)
      .values({
        agentId: agent.agentId,
        agentSnapshotId: agent.id,
        triggerType: "manual",
        status: "queued",
        initiatedBy: actor.userId,
        input: input ?? null,
      })
      .returning();

    // 3. Enqueue BullMQ job
    await this.queue.add("run", {
      executionId: execution!.id,
      agentSnapshotId: agent.id,
      orgId: actor.orgId,
      userId: actor.userId,
    });

    return execution!;
  }

  async list(_actor: Actor, agentId?: string) {
    if (agentId) {
      return this.db
        .select()
        .from(executions)
        .where(eq(executions.agentId, agentId))
        .orderBy(desc(executions.startedAt))
        .limit(50);
    }

    // Return latest 50 executions (MVP: no org filter on executions table directly)
    return this.db.select().from(executions).orderBy(desc(executions.startedAt)).limit(50);
  }

  async getById(executionId: string) {
    const [execution] = await this.db
      .select()
      .from(executions)
      .where(eq(executions.id, executionId));

    return execution ?? null;
  }

  async getEvents(executionId: string) {
    return this.db
      .select()
      .from(executionEvents)
      .where(eq(executionEvents.executionId, executionId))
      .orderBy(executionEvents.seq);
  }
}
