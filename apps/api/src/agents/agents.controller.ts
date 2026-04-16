import { createAgentSchema, updateAgentSchema } from "@agentx/shared";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { CurrentActor } from "../auth/decorators/current-actor.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import type { Actor } from "../auth/types";
import { AgentsService } from "./agents.service";

@Controller("agents")
@UseGuards(JwtAuthGuard)
export class AgentsController {
  constructor(@Inject(AgentsService) private readonly agentsService: AgentsService) {}

  @Get()
  list(@CurrentActor() actor: Actor) {
    return this.agentsService.list(actor);
  }

  @Post()
  create(@CurrentActor() actor: Actor, @Body() body: unknown) {
    const validated = createAgentSchema.parse(body);
    return this.agentsService.create(actor, validated);
  }

  @Get(":id")
  findById(@CurrentActor() actor: Actor, @Param("id") id: string) {
    return this.agentsService.findById(actor, id);
  }

  @Patch(":id")
  update(@CurrentActor() actor: Actor, @Param("id") id: string, @Body() body: unknown) {
    const validated = updateAgentSchema.parse(body);
    return this.agentsService.update(actor, id, validated);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@CurrentActor() actor: Actor, @Param("id") id: string) {
    return this.agentsService.delete(actor, id);
  }
}
