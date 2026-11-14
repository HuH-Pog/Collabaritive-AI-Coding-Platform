import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

import { Room } from "../models/Room.js";
import { verifyRoomToken } from "../services/roomAccess.js";
import {
  parseProject,
  prepareProjectSubmission,
} from "../services/projectRun.js";
import { runQueue } from "../queues/runQueue.js";

const router = Router();

const submissionLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: "Too many runs. Please try again in a minute.",
  },
});

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Authenticate submissions and result requests.
router.use(async (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");

  const authorization = req.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "Room access token is required.",
    });
  }

  let access: Awaited<ReturnType<typeof verifyRoomToken>>;

  try {
    access = await verifyRoomToken(authorization.slice(7));
  } catch {
    return res.status(401).json({
      error: "Room access expired. Please try again.",
    });
  }

  if (access.role !== "owner" && access.role !== "editor") {
    return res.status(403).json({
      error: "Only owners and editors can run code.",
    });
  }

  res.locals.runAccess = access;
  next();
});

router.post("/", submissionLimiter, async (req, res, next) => {
  const { shareToken, code, project, stdin = "" } = req.body ?? {};
  const isProjectRun = project !== undefined;

  if (
    typeof shareToken !== "string" ||
    !shareToken.length ||
    shareToken.length > 100 ||
    typeof stdin !== "string" ||
    Buffer.byteLength(stdin, "utf8") > 10_000
  ) {
    return res.status(400).json({
      error: "Provide a room token and input up to 10 KB.",
    });
  }

  if (
    (!isProjectRun &&
      (typeof code !== "string" ||
        !code.trim() ||
        Buffer.byteLength(code, "utf8") > 50_000)) ||
    (isProjectRun && code !== undefined)
  ) {
    return res.status(400).json({
      error: "Send either a project or non-empty code up to 50 KB.",
    });
  }

  if (!process.env.JUDGE0_API_KEY?.trim()) {
    return res.status(503).json({
      error: "Code execution is not configured on the server.",
    });
  }

  try {
    const access = res.locals.runAccess;

    const room = await Room.findById(access.roomId).exec();

    if (!room) {
      return res.status(404).json({ error: "Room not found." });
    }

    if (
      shareToken !== room.shareToken &&
      shareToken !== room.viewerToken
    ) {
      return res.status(403).json({
        error: "Room access does not match.",
      });
    }

    const language = room.language;

    if (language !== "python" && language !== "javascript") {
      return res.status(400).json({
        error: "Unsupported room language.",
      });
    }

    let sourceCode: string;

    if (isProjectRun) {
      try {
        const validated = parseProject(project, language);

        sourceCode = prepareProjectSubmission(
          validated,
          language
        ).source_code;
      } catch (error) {
        return res.status(400).json({
          error:
            error instanceof Error ? error.message : "Invalid project.",
        });
      }
    } else {
      sourceCode = Buffer.from(code, "utf8").toString("base64");
    }

    const languageId = Number(
      language === "python"
        ? process.env.JUDGE0_PYTHON_ID ?? "71"
        : process.env.JUDGE0_JAVASCRIPT_ID ?? "63"
    );

    if (!Number.isInteger(languageId) || languageId <= 0) {
      return res.status(503).json({
        error: "Invalid execution language configuration.",
      });
    }

    const jobId = randomUUID();
    const resultToken = randomBytes(32).toString("hex");

    try {
      await runQueue.add(
        "execute",
        {
          roomId: String(room._id),
          resultTokenHash: hashToken(resultToken),
          languageId,
          sourceCode,
          stdin: Buffer.from(stdin, "utf8").toString("base64"),
          createdAt: Date.now(),
        },
        { jobId }
      );
    } catch {
      return res.status(503).json({
        error: "The execution queue is unavailable. Check Redis.",
      });
    }

    // Only this browser receives the private result token.
    return res.status(202).json({
      jobId,
      resultToken,
      state: "queued",
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:jobId", async (req, res, next) => {
  const jobId = req.params.jobId;
  const resultToken = req.get("x-run-token");

  if (
    typeof jobId !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(jobId) ||
    !resultToken ||
    !/^[0-9a-f]{64}$/i.test(resultToken)
  ) {
    return res.status(400).json({
      error: "A valid job ID and private result token are required.",
    });
  }

  try {
    const { roomId } = res.locals.runAccess;

    if (!(await Room.exists({ _id: roomId }))) {
      return res.status(404).json({ error: "Room no longer exists." });
    }

    try {
      const job = await runQueue.getJob(jobId);

      if (
        !job ||
        job.data.roomId !== String(roomId) ||
        !timingSafeEqual(
          Buffer.from(hashToken(resultToken), "hex"),
          Buffer.from(job.data.resultTokenHash, "hex")
        )
      ) {
        return res.status(404).json({ error: "Run not found." });
      }

      // Enforce access expiry even before lazy queue cleanup occurs.
      if (Date.now() - job.data.createdAt > 10 * 60_000) {
        return res.status(410).json({
          error: "This run has expired. Submit it again.",
        });
      }

      const state = await job.getState();

      if (state === "completed" && job.returnvalue) {
        return res.json({
          state: "completed",
          result: job.returnvalue,
        });
      }

      if (state === "failed") {
        return res.json({
          state: "failed",
          error: job.failedReason || "Execution failed.",
        });
      }

      if (state === "unknown") {
        return res.status(410).json({
          error: "This run is no longer available.",
        });
      }

      return res.json({
        state:
          state === "active" || state === "completed"
            ? "running"
            : "queued",
      });
    } catch {
      return res.status(503).json({
        error: "Could not read the run status. Check Redis.",
      });
    }
  } catch (error) {
    next(error);
  }
});

export default router;