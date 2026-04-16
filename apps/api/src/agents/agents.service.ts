import type { CreateAgentDto, UpdateAgentDto } from "@agentx/shared";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Actor } from "../auth/types";
import { AgentsRepository } from "./agents.repository";

@Injectable()
export class AgentsService {
  constructor(@Inject(AgentsRepository) private readonly agentsRepository: AgentsRepository) {}

  async list(actor: Actor) {
    return this.agentsRepository.list(actor.orgId);
  }

  async findById(actor: Actor, agentId: string) {
    const agent = await this.agentsRepository.findById(agentId, actor.orgId);
    if (!agent) {
      throw new NotFoundException(`Agent ${agentId} not found`);
    }
    return agent;
  }

  async create(actor: Actor, input: CreateAgentDto) {
    return this.agentsRepository.create({
      ...input,
      orgId: actor.orgId,
      createdBy: actor.userId,
      createdByEmail: actor.email,
    });
  }

  async update(actor: Actor, agentId: string, changes: UpdateAgentDto) {
    const updated = await this.agentsRepository.update(
      agentId,
      actor.orgId,
      changes,
      actor.userId,
      actor.email,
    );
    if (!updated) {
      throw new NotFoundException(`Agent ${agentId} not found`);
    }
    return updated;
  }

  async delete(actor: Actor, agentId: string) {
    const deleted = await this.agentsRepository.delete(agentId, actor.orgId);
    if (!deleted) {
      throw new NotFoundException(`Agent ${agentId} not found`);
    }
  }
}
