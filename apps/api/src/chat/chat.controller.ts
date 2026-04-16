import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { CurrentActor } from "../auth/decorators/current-actor.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import type { Actor } from "../auth/types";
import { ChatService } from "./chat.service";

@Controller("agents/:agentId/chat")
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(@Inject(ChatService) private readonly chatService: ChatService) {}

  // List sessions for this agent
  @Get("sessions")
  listSessions(@CurrentActor() actor: Actor, @Param("agentId") agentId: string) {
    return this.chatService.listSessions(actor.userId, agentId);
  }

  // Create new session
  @Post("sessions")
  createSession(
    @CurrentActor() actor: Actor,
    @Param("agentId") agentId: string,
    @Body() body: { title?: string },
  ) {
    return this.chatService.createSession(actor.userId, agentId, body?.title);
  }

  // Delete session
  @Delete("sessions/:sessionId")
  async deleteSession(@CurrentActor() actor: Actor, @Param("sessionId") sessionId: string) {
    const deleted = await this.chatService.deleteSession(sessionId, actor.userId);
    if (!deleted) throw new NotFoundException("Session not found");
    return { deleted: true };
  }

  // Get messages for a session
  @Get("sessions/:sessionId/messages")
  getMessages(@Param("sessionId") sessionId: string) {
    return this.chatService.getMessages(sessionId);
  }

  // Send message (streaming)
  @Post("sessions/:sessionId/messages")
  async sendMessage(
    @CurrentActor() actor: Actor,
    @Param("agentId") agentId: string,
    @Param("sessionId") sessionId: string,
    @Body() body: { message: string },
    @Res() reply: FastifyReply,
  ) {
    if (!body.message || typeof body.message !== "string") {
      return reply.status(400).send({ message: "message is required" });
    }

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    await this.chatService.chat(actor, agentId, sessionId, body.message, (event) => {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    });

    reply.raw.end();
  }
}
