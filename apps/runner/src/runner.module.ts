import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { ExecutionProcessor } from "./execution.processor";

@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        host: "localhost",
        port: 6379,
      },
    }),
    BullModule.registerQueue({
      name: "executions",
    }),
  ],
  providers: [ExecutionProcessor],
})
export class RunnerModule {}
