import { createMcpCredentialSchema } from "@agentx/shared";
import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { CurrentActor } from "../auth/decorators/current-actor.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import type { Actor } from "../auth/types";
import { McpService } from "./mcp.service";

@Controller("mcp")
@UseGuards(JwtAuthGuard)
export class McpController {
  constructor(@Inject(McpService) private readonly mcpService: McpService) {}

  @Get("servers")
  listServers() {
    return this.mcpService.listServers();
  }

  @Get("servers/:slug")
  async getServer(@Param("slug") slug: string) {
    const server = await this.mcpService.getServerBySlug(slug);
    if (!server) throw new NotFoundException("MCP server not found");
    return server;
  }

  @Get("credentials")
  listCredentials(@CurrentActor() actor: Actor) {
    return this.mcpService.listCredentials(actor.userId);
  }

  @Post("credentials")
  createCredential(@CurrentActor() actor: Actor, @Body() body: any) {
    const validated = createMcpCredentialSchema.parse(body);
    return this.mcpService.createCredential(actor.userId, validated);
  }

  @Delete("credentials/:id")
  async deleteCredential(@CurrentActor() actor: Actor, @Param("id") id: string) {
    const deleted = await this.mcpService.deleteCredential(id, actor.userId);
    if (!deleted) throw new NotFoundException("Credential not found");
    return { deleted: true };
  }
}
