import { createDb } from "@agentx/db";
import { Global, Module } from "@nestjs/common";

export const DB = Symbol("DB");

@Global()
@Module({
  providers: [
    {
      provide: DB,
      useFactory: () => {
        const url = process.env.DATABASE_URL ?? "postgres://localhost:5432/agentx_dev";
        return createDb(url);
      },
    },
  ],
  exports: [DB],
})
export class DatabaseModule {}
