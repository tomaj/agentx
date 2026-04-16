import { type Database, agents } from "@agentx/db";
import type { CreateAgentDto, UpdateAgentDto } from "@agentx/shared";
import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import { DB } from "../database/database.module";

@Injectable()
export class AgentsRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(orgId: string) {
    return this.db
      .select()
      .from(agents)
      .where(and(eq(agents.orgId, orgId), eq(agents.isCurrent, true)))
      .orderBy(desc(agents.createdAt));
  }

  async findById(agentId: string, orgId: string) {
    const [agent] = await this.db
      .select()
      .from(agents)
      .where(and(eq(agents.agentId, agentId), eq(agents.orgId, orgId), eq(agents.isCurrent, true)));
    return agent ?? null;
  }

  async create(
    data: CreateAgentDto & { orgId: string; createdBy: string; createdByEmail: string },
  ) {
    const agentId = crypto.randomUUID();
    const [agent] = await this.db
      .insert(agents)
      .values({
        agentId,
        orgId: data.orgId,
        createdBy: data.createdBy,
        createdByEmail: data.createdByEmail,
        name: data.name,
        description: data.description ?? "",
        status: "active",
        version: 1,
        isCurrent: true,
        systemPrompt: data.systemPrompt,
        modelProvider: data.modelProvider ?? "anthropic",
        modelId: data.modelId ?? "claude-sonnet-4-6",
        params: data.params ?? {},
        mcpBindings: data.mcpBindings ?? [],
      })
      .returning();
    return agent!;
  }

  async update(
    agentId: string,
    orgId: string,
    changes: UpdateAgentDto,
    actorId: string,
    actorEmail: string,
  ) {
    return this.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(agents)
        .where(
          and(eq(agents.agentId, agentId), eq(agents.orgId, orgId), eq(agents.isCurrent, true)),
        );

      if (!current) return null;

      // Mark old version as not current
      await tx.update(agents).set({ isCurrent: false }).where(eq(agents.id, current.id));

      // Insert new version
      const [newVersion] = await tx
        .insert(agents)
        .values({
          agentId: current.agentId,
          orgId: current.orgId,
          createdBy: actorId,
          createdByEmail: actorEmail,
          name: changes.name ?? current.name,
          description: changes.description ?? current.description,
          status: current.status,
          version: current.version + 1,
          isCurrent: true,
          systemPrompt: changes.systemPrompt ?? current.systemPrompt,
          modelProvider: changes.modelProvider ?? current.modelProvider,
          modelId: changes.modelId ?? current.modelId,
          params: changes.params ?? current.params,
          mcpBindings: changes.mcpBindings ?? current.mcpBindings,
        })
        .returning();

      return newVersion!;
    });
  }

  async delete(agentId: string, orgId: string) {
    const result = await this.db
      .update(agents)
      .set({ status: "archived", isCurrent: false })
      .where(and(eq(agents.agentId, agentId), eq(agents.orgId, orgId)))
      .returning({ id: agents.id });
    return result.length > 0;
  }
}
