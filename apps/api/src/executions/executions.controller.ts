import { executeAgentSchema } from "@agentx/shared";
import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { CurrentActor } from "../auth/decorators/current-actor.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import type { Actor } from "../auth/types";
import { ExecutionsService } from "./executions.service";

@Controller()
@UseGuards(JwtAuthGuard)
export class ExecutionsController {
  constructor(@Inject(ExecutionsService) private readonly executionsService: ExecutionsService) {}

  @Post("agents/:agentId/execute")
  async execute(
    @CurrentActor() actor: Actor,
    @Param("agentId") agentId: string,
    @Body() body: unknown,
  ) {
    const validated = executeAgentSchema.parse(body ?? {});
    return this.executionsService.execute(actor, agentId, validated.input);
  }

  @Get("executions")
  list(@CurrentActor() actor: Actor, @Query("agentId") agentId?: string) {
    return this.executionsService.list(actor, agentId);
  }

  @Get("executions/:id")
  async getById(@Param("id") id: string) {
    const execution = await this.executionsService.getById(id);
    if (!execution) throw new NotFoundException("Execution not found");
    return execution;
  }

  @Get("executions/:id/events")
  async getEvents(@Param("id") id: string) {
    return this.executionsService.getEvents(id);
  }
}
