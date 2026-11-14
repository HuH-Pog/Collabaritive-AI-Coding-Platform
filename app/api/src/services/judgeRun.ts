import { setTimeout as delay } from "node:timers/promises";
import type {
  RunJobData,
  RunResult,
} from "../queues/runQueue.js";

type JudgeResult = {
  status?: {
    id: number;
    description: string;
  };
  stdout?: string | null;
  stderr?: string | null;
  compile_output?: string | null;
  message?: string | null;
  time?: string | null;
  memory?: number | null;
};

function decode(value?: string | null): string {
  return value
    ? Buffer.from(value, "base64").toString("utf8")
    : "";
}

export async function executeWithJudge0(
  data: RunJobData
): Promise<RunResult> {
  const apiKey = process.env.JUDGE0_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("Judge0 is not configured on the worker.");
  }

  const baseUrl = (
    process.env.JUDGE0_URL ??
    "https://api.onlinecompiler.io/api/judge0"
  ).replace(/\/+$/, "");

  const signal = AbortSignal.timeout(25_000);

  const headers = {
    "Content-Type": "application/json",
    Authorization: apiKey,
  };

  try {
    const submissionResponse = await fetch(
      `${baseUrl}/submissions?base64_encoded=true&wait=false`,
      {
        method: "POST",
        headers,
        signal,
        body: JSON.stringify({
          language_id: data.languageId,
          source_code: data.sourceCode,
          stdin: data.stdin,
          cpu_time_limit: 3,
          wall_time_limit: 5,
        }),
      }
    );

    if (!submissionResponse.ok) {
      throw new Error(
        `Execution provider rejected submission (${submissionResponse.status}).`
      );
    }

    const submission = (await submissionResponse.json()) as {
      token?: string;
    };

    if (!submission.token) {
      throw new Error("The execution provider returned no submission token.");
    }

    while (!signal.aborted) {
      await delay(1000, undefined, { signal });

      const response = await fetch(
        `${baseUrl}/submissions/${encodeURIComponent(
          submission.token
        )}?base64_encoded=true&fields=status,stdout,stderr,compile_output,message,time,memory`,
        { headers, signal }
      );

      if (!response.ok) {
        throw new Error(
          `Execution result request failed (${response.status}).`
        );
      }

      const result = (await response.json()) as JudgeResult;

      if (!result.status) {
        throw new Error("The execution provider returned an invalid result.");
      }

      if (result.status.id <= 2) continue;

      return {
        status: result.status.description,
        statusId: result.status.id,
        stdout: decode(result.stdout),
        stderr: decode(result.stderr),
        compileOutput: decode(result.compile_output),
        message: decode(result.message),
        time: result.time ?? null,
        memory: result.memory ?? null,
      };
    }

    throw new Error("Execution provider timed out.");
  } catch (error) {
    if (signal.aborted) {
      throw new Error(
        "Execution provider timed out. The program may still finish remotely."
      );
    }

    if (error instanceof Error) throw error;

    throw new Error("Could not contact the execution provider.");
  }
}