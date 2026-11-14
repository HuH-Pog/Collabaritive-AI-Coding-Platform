import "dotenv/config";
import { Queue } from "bullmq";

export type RunResult = {
  status: string;
  statusId: number;
  stdout: string;
  stderr: string;
  compileOutput: string;
  message: string;
  time: string | null;
  memory: number | null;
};

export type RunJobData = {
  roomId: string;
  resultTokenHash: string;
  languageId: number;
  sourceCode: string;
  stdin: string;
  createdAt: number;
};

export const RUN_QUEUE_NAME = "editor-code-runs";

const port = Number(process.env.REDIS_PORT ?? "6379");

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error("REDIS_PORT must be a valid port.");
}

export const redisConnection = {
  host: process.env.REDIS_HOST ?? "127.0.0.1",
  port,
  ...(process.env.REDIS_PASSWORD
    ? { password: process.env.REDIS_PASSWORD }
    : {}),
  connectTimeout: 5000,
};

export const runQueue = new Queue<
  RunJobData,
  RunResult,
  "execute"
>(RUN_QUEUE_NAME, {
  connection: {
    ...redisConnection,

    // HTTP requests should fail promptly if Redis is unavailable.
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  },

  defaultJobOptions: {
    // Avoid automatically resubmitting user programs after failures.
    attempts: 1,

    removeOnComplete: {
      age: 600,
      count: 500,
    },

    removeOnFail: {
      age: 600,
      count: 500,
    },
  },
});

runQueue.on("error", () => {
  console.error("[Run queue] Redis connection error.");
});