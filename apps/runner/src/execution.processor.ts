import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";

@Processor("executions")
export class ExecutionProcessor extends WorkerHost {
  async process(job: Job) {
    console.log(`Processing execution job ${job.id}`, job.data);
    // TODO: implement agent execution loop in Step 2
  }
}
