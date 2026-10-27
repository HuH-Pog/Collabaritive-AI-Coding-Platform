import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { setTimeout as delay } from "node:timers/promises";
import { Room } from "../models/Room.js";

const router = Router();

router.use(
  rateLimit({
    windowMs: 60_000,
    limit: 10,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: {
      error: "Too many runs. Please try again in a minute.",
    },
  })
);

type JudgeResult = {
  status: {
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

function decode(value?: string | null) {
  return value
    ? Buffer.from(value, "base64").toString("utf8")
    : "";
}

router.post("/", async (req, res) => {
  const { shareToken, code, stdin = "" } = req.body ?? {};

  if (
    typeof shareToken !== "string" ||
    shareToken.length === 0 ||
    shareToken.length > 100 ||
    typeof code !== "string" ||
    code.trim().length === 0 ||
    Buffer.byteLength(code, "utf8") > 50_000 ||
    typeof stdin !== "string" ||
    Buffer.byteLength(stdin, "utf8") > 10_000
  ) {
    return res.status(400).json({
      error:
        "Provide a room token, non-empty code up to 50 KB, and input up to 10 KB.",
    });
  }

  const apiKey = process.env.JUDGE0_API_KEY;

  if (!apiKey) {
    return res.status(503).json({
      error: "Code execution is not configured on the server.",
    });
  }

  // Covers submission, polling and network requests.
  const signal = AbortSignal.timeout(25_000);

  try {
    const room = await Room.findOne({ shareToken }).exec();

    if (!room) {
      return res.status(404).json({
        error: "Room not found.",
      });
    }

    // Use the room's language rather than trusting the client.
    const languageId = Number(
      room.language === "python"
        ? process.env.JUDGE0_PYTHON_ID ?? "71"
        : process.env.JUDGE0_JAVASCRIPT_ID ?? "63"
    );

    if (!Number.isInteger(languageId) || languageId <= 0) {
      throw new Error("Invalid Judge0 language configuration.");
    }

    const baseUrl = (
      process.env.JUDGE0_URL ??
      "https://judge0-ce.p.rapidapi.com"
    ).replace(/\/+$/, "");

    const headers = {
      "Content-Type": "application/json",
      Authorization: apiKey.trim(),
    };
    // Submit code
    const submissionResponse = await fetch(
      `${baseUrl}/submissions?base64_encoded=true&wait=false`,
      {
        method: "POST",
        headers,
        signal,
        body: JSON.stringify({
          language_id: languageId,
          source_code: Buffer.from(code).toString("base64"),
          stdin: Buffer.from(stdin).toString("base64"),
          cpu_time_limit: 3,
          wall_time_limit: 5,
        }),
      }
    );

    if (!submissionResponse.ok) {
      const details = await submissionResponse.text();

      console.error(
        "Execution service rejected submission:",
        submissionResponse.status,
        details
      );

      return res.status(502).json({
        error: `Execution service rejected submission (${submissionResponse.status}).`,
      });
    }

    const submission = (await submissionResponse.json()) as {
      token?: string;
    };

    if (!submission.token) {
      throw new Error("Judge0 did not return a submission token.");
    }

    while (!signal.aborted) {
      await delay(1000, undefined, { signal });

      // Retrieve results
      const resultResponse = await fetch(
        `${baseUrl}/submissions/${encodeURIComponent(
          submission.token
        )}?base64_encoded=true&fields=status,stdout,stderr,compile_output,message,time,memory`,
        { headers, signal }
      );

      if (!resultResponse.ok) {
        throw new Error(
          `Judge0 result request failed: ${resultResponse.status}`
        );
      }

      const result =
        (await resultResponse.json()) as JudgeResult;

      // 1 = queued, 2 = processing.
      if (result.status.id <= 2) continue;

      return res.json({
        status: result.status.description,
        statusId: result.status.id,
        stdout: decode(result.stdout),
        stderr: decode(result.stderr),
        compileOutput: decode(result.compile_output),
        message: decode(result.message),
        time: result.time,
        memory: result.memory,
      });
    }

    return res.status(504).json({
      error: "Execution timed out. Try again shortly.",
    });
  } catch (error) {
    if (signal.aborted) {
      return res.status(504).json({
        error: "Execution timed out. Try again shortly.",
      });
    }

    console.error("Code execution failed:", error);

    return res.status(502).json({
      error: "Could not execute the code. Check the backend terminal.",
    });
  }
});

export default router;