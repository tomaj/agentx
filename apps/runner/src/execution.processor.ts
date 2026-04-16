import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject } from "@nestjs/common";
import type { Job } from "bullmq";
import { AgentExecutor } from "./agent-executor";

export interface ExecutionJobData {
  executionId: string;
  agentSnapshotId: string;
  orgId: string;
  userId: string;
}

@Processor("executions")
export class ExecutionProcessor extends WorkerHost {
  constructor(@Inject(AgentExecutor) private readonly agentExecutor: AgentExecutor) {
    super();
  }

  async process(job: Job<ExecutionJobData>) {
    console.log(`[Runner] Processing execution ${job.data.executionId}`);
    try {
      await this.agentExecutor.run(job.data);
    } catch (error) {
      console.error(`[Runner] Execution ${job.data.executionId} failed:`, error);
      throw error;
    }
  }
}
