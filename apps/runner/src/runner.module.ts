import { createDb } from "@agentx/db";
import { BullModule } from "@nestjs/bullmq";
import { Global, Module } from "@nestjs/common";
import { AgentExecutor } from "./agent-executor";
import { ExecutionProcessor } from "./execution.processor";

const DB = Symbol("DB");

@Global()
@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST ?? "localhost",
        port: Number(process.env.REDIS_PORT ?? 6379),
      },
    }),
    BullModule.registerQueue({
      name: "executions",
    }),
  ],
  providers: [
    ExecutionProcessor,
    AgentExecutor,
    {
      provide: DB,
      useFactory: () => {
        const url = process.env.DATABASE_URL ?? "postgres://localhost:5432/agentx_dev";
        return createDb(url);
      },
    },
  ],
})
export class RunnerModule {}

export { DB };
