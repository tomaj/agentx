import { Module } from "@nestjs/common";
import { Queue } from "bullmq";
import { ExecutionsController } from "./executions.controller";
import { ExecutionsService } from "./executions.service";

import { EXECUTIONS_QUEUE } from "./constants";

@Module({
  controllers: [ExecutionsController],
  providers: [
    ExecutionsService,
    {
      provide: EXECUTIONS_QUEUE,
      useFactory: () => {
        const redisUrl = process.env.REDIS_URL;
        const connection = redisUrl
          ? {
              host: new URL(redisUrl).hostname,
              port: Number(new URL(redisUrl).port || 6379),
            }
          : {
              host: process.env.REDIS_HOST ?? "localhost",
              port: Number(process.env.REDIS_PORT ?? 6379),
            };

        return new Queue("executions", { connection });
      },
    },
  ],
  exports: [ExecutionsService],
})
export class ExecutionsModule {}
