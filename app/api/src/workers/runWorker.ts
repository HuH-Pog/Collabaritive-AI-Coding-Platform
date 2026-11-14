import "dotenv/config";
import { Worker } from "bullmq";
import { disconnect } from "mongoose";

import { connectDB } from "../config/database.js";
import { Room } from "../models/Room.js";
import {
  RUN_QUEUE_NAME,
  redisConnection,
  runQueue,
  type RunJobData,
  type RunResult,
} from "../queues/runQueue.js";
import { executeWithJudge0 } from "../services/judgeRun.js";

function positiveInteger(value: string | undefined, fallback: number) {
  const number = Number(value ?? fallback);

  if (!Number.isInteger(number) || number < 1) {
    throw new Error("Worker limits must be positive integers.");
  }

  return number;
}

async function main() {
  if (!process.env.JUDGE0_API_KEY?.trim()) {
    throw new Error("Set JUDGE0_API_KEY before starting the worker.");
  }

  const concurrency = positiveInteger(
    process.env.RUN_CONCURRENCY,
    2
  );

  const submissionsPerMinute = positiveInteger(
    process.env.RUN_SUBMISSIONS_PER_MINUTE,
    10
  );

  await connectDB();
  await runQueue.waitUntilReady();

  // Limit active jobs across every worker connected to this queue.
  await runQueue.setGlobalConcurrency(concurrency);

  const worker = new Worker<RunJobData, RunResult, "execute">(
    RUN_QUEUE_NAME,

    async (job) => {
      // Avoid executing old jobs after a long backlog or worker outage.
      if (Date.now() - job.data.createdAt > 90_000) {
        throw new Error(
          "This run waited too long in the queue. Submit it again."
        );
      }

      if (!(await Room.exists({ _id: job.data.roomId }))) {
        throw new Error("The room was deleted before execution started.");
      }

      return executeWithJudge0(job.data);
    },

    {
      connection: {
        ...redisConnection,
        maxRetriesPerRequest: null,
      },

      concurrency,

      limiter: {
        max: submissionsPerMinute,
        duration: 60_000,
      },

      // A lost worker fails its stalled job rather than replaying it.
      maxStalledCount: 0,
    }
  );

  worker.on("error", () => {
    console.error("[Run worker] Redis or worker connection error.");
  });

  worker.on("completed", (job) => {
    console.log(`[Run worker] Completed ${job.id}`);
  });

  worker.on("failed", (job) => {
    console.error(`[Run worker] Failed ${job?.id ?? "unknown job"}`);
  });

  await worker.waitUntilReady();

  console.log(
    `[Run worker] Ready. Global concurrency: ${concurrency}; ` +
      `submission limit: ${submissionsPerMinute}/minute.`
  );

  let shuttingDown = false;

  async function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log("[Run worker] Finishing active jobs…");

    await worker.close();
    await runQueue.close();
    await disconnect();
  }

  process.once("SIGINT", () => {
    void shutdown().catch(() => process.exit(1));
  });

  process.once("SIGTERM", () => {
    void shutdown().catch(() => process.exit(1));
  });
}

main().catch((error) => {
  console.error(
    "[Run worker] Startup failed:",
    error instanceof Error ? error.message : "Unknown error"
  );

  process.exit(1);
});