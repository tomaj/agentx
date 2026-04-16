import { Module } from "@nestjs/common";
import { AgentsModule } from "./agents/agents.module";
import { AuthModule } from "./auth/auth.module";
import { ChatModule } from "./chat/chat.module";
import { DatabaseModule } from "./database/database.module";
import { ExecutionsModule } from "./executions/executions.module";
import { HealthController } from "./health.controller";
import { McpModule } from "./mcp/mcp.module";

@Module({
  imports: [DatabaseModule, AuthModule, AgentsModule, McpModule, ExecutionsModule, ChatModule],
  controllers: [HealthController],
})
export class AppModule {}
