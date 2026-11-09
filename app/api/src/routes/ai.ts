import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { Room } from "../models/Room.js";
import { verifyRoomToken } from "../services/roomAccess.js";
import {
  AIError,
  generateAIReply,
} from "../services/ai.js";

const router = Router();

const requestSchema = z.object({
  action: z.enum(["ask", "explain", "explain-error"]),
  question: z.string().trim().max(4000).optional(),
  language: z.enum(["javascript", "python"]),
  filename: z.string().min(1).max(500),
  code: z.string().max(30000),
  selectedCode: z.string().max(12000).optional(),
  consoleError: z.string().max(8000).optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(6000),
      })
    )
    .max(8)
    .optional(),
});
const proposalSchema = z.object({
  instruction: z.string().trim().min(1).max(3000),
  language: z.enum(["javascript", "python"]),
  filename: z.string().min(1).max(500),
  code: z.string().max(12000),
  selectedCode: z.string().max(12000).optional(),
});

const proposalResultSchema = z.object({
  explanation: z.string().min(1).max(4000),
  replacementCode: z.string().max(30000),
});

// Reuse the same room authorization as checkpoints.
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
      error: "Room access expired. Refresh the room and try again.",
    });
  }

  try {
    if (!(await Room.exists({ _id: access.roomId }))) {
      return res.status(404).json({
        error: "Room no longer exists.",
      });
    }

    res.locals.aiAccess = access;
    next();
  } catch (error) {
    next(error);
  }
});

// Shared request budget for each room, per API process.
const aiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (_req, res) =>
    String(res.locals.aiAccess.roomId),
  message: {
    error: "This room has reached 10 AI requests per minute. Try again shortly.",
  },
});

router.post("/", aiLimiter, async (req, res, next) => {
  const parsed = requestSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error:
        parsed.error.issues[0]?.message ??
        "Invalid AI request.",
    });
  }

  try {
    const result = await generateAIReply(parsed.data);

    return res.json(result);
  } catch (error) {
    if (error instanceof AIError) {
      return res.status(error.status).json({
        error: error.message,
      });
    }

    next(error);
  }
});

router.post("/propose", aiLimiter, async (req, res, next) => {
  const { role } = res.locals.aiAccess;

  if (role !== "owner" && role !== "editor") {
    return res.status(403).json({
      error: "Only owners and editors can request code edits.",
    });
  }

  const parsed = proposalSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error:
        "Enter an instruction. This first version supports files up to 12,000 characters.",
    });
  }

  const input = parsed.data;

  try {
    const result = await generateAIReply({
      action: "ask",
      language: input.language,
      filename: input.filename,
      code: input.code,
      selectedCode: input.selectedCode,
      question: [
        "Propose an edit to the supplied file.",
        "Return ONLY one valid JSON object with these keys:",
        '"explanation": a short description of the changes.',
        '"replacementCode": the COMPLETE updated file as a JSON string.',
        "Do not use Markdown fences around the JSON.",
        "Preserve unrelated code and comments.",
        "Do not use placeholders, omitted sections, or ellipses.",
        "If a selection is provided, focus the requested change there,",
        "but still return the complete updated file.",
        "",
        "User instruction:",
        input.instruction,
      ].join("\n"),
    });

    if (result.truncated) {
      return res.status(422).json({
        error:
          "The proposal exceeded the response limit. Try a smaller file. No changes were applied.",
      });
    }

    let decoded: unknown;

    try {
      // Accept a surrounding JSON code fence if the model adds one.
      const text = result.reply
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "");

      decoded = JSON.parse(text);
    } catch {
      return res.status(422).json({
        error:
          "The AI returned an invalid proposal. Generate it again. No changes were applied.",
      });
    }

    const proposal = proposalResultSchema.safeParse(decoded);

    if (!proposal.success) {
      return res.status(422).json({
        error:
          "The AI did not return a complete edit proposal. Try again.",
      });
    }

    if (proposal.data.replacementCode === input.code) {
      return res.status(422).json({
        error: "The AI proposed no changes to this file.",
      });
    }

    return res.json({ proposal: proposal.data });
  } catch (error) {
    if (error instanceof AIError) {
      return res.status(error.status).json({
        error: error.message,
      });
    }

    next(error);
  }
});

export default router;