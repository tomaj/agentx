import { NestFactory } from "@nestjs/core";
import { RunnerModule } from "./runner.module";

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(RunnerModule);
  console.log("Runner started, waiting for jobs...");

  // Graceful shutdown
  const signals = ["SIGTERM", "SIGINT"];
  for (const signal of signals) {
    process.on(signal, async () => {
      console.log(`Received ${signal}, shutting down...`);
      await app.close();
      process.exit(0);
    });
  }
}

bootstrap();
