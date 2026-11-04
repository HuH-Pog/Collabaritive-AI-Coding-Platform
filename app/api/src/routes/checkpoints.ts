import { Router } from "express";
import { z } from "zod";
import { Room } from "../models/Room.js";
import { RoomCheckpoint } from "../models/RoomCheckpoint.js";
import { verifyRoomToken } from "../services/roomAccess.js";

const router = Router();

const entryFields = {
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(80),
  parentId: z.string().min(1).max(100).nullable(),
};

const entrySchema = z.discriminatedUnion("kind", [
  z.object({
    ...entryFields,
    kind: z.literal("file"),
    content: z.string(),
  }),
  z.object({
    ...entryFields,
    kind: z.literal("folder"),
  }),
]);

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  entries: z.array(entrySchema).min(1).max(500),
});

// Authenticate both history endpoints.
router.use(async (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");

  const authorization = req.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Room access token is required." });
  }

  let access: Awaited<ReturnType<typeof verifyRoomToken>>;

  try {
    access = await verifyRoomToken(authorization.slice(7));
  } catch {
    return res.status(401).json({
      error: "Room access expired. Reopen History and try again.",
    });
  }

  try {
    if (!(await Room.exists({ _id: access.roomId }))) {
      return res.status(404).json({ error: "Room no longer exists." });
    }

    res.locals.checkpointAccess = access;
    next();
  } catch (err) {
    next(err);
  }
});

// Return metadata for the newest 50 checkpoints.
router.get("/", async (_req, res, next) => {
  try {
    const { roomId } = res.locals.checkpointAccess;

    const rows = await RoomCheckpoint.find({ roomId })
      .select("_id name createdAt")
      .sort({ createdAt: -1, _id: -1 })
      .limit(50)
      .lean()
      .exec();

    return res.json({
      checkpoints: rows.map((row) => ({
        id: row._id.toString(),
        name: row.name,
        createdAt: row.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  const { roomId, role } = res.locals.checkpointAccess;

  if (role !== "owner" && role !== "editor") {
    return res.status(403).json({
      error: "Only owners and editors can save checkpoints.",
    });
  }

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Enter a checkpoint name and a valid project snapshot.",
    });
  }

  const { name, entries } = parsed.data;
  const byId = new Map(entries.map((entry) => [entry.id, entry]));

  if (byId.size !== entries.length || byId.get("main")?.kind !== "file") {
    return res.status(400).json({
      error: "The snapshot must contain unique IDs and the original main file.",
    });
  }

  // Reject invalid parent references or cycles before storing the tree.
  for (const entry of entries) {
    const visited = new Set([entry.id]);
    let parentId = entry.parentId;

    while (parentId !== null) {
      const parent = byId.get(parentId);
      if (!parent || parent.kind !== "folder" || visited.has(parentId)) {
        return res.status(400).json({
          error: `Invalid folder path for "${entry.name}".`,
        });
      }
      visited.add(parentId);
      parentId = parent.parentId;
    }
  }

  try {
    const checkpoint = await RoomCheckpoint.create({ roomId, name, entries });

    // Account for an owner deleting the room during this request.
    if (!(await Room.exists({ _id: roomId }))) {
      await RoomCheckpoint.deleteOne({ _id: checkpoint._id });
      return res.status(404).json({ error: "Room was deleted." });
    }

    return res.status(201).json({
      checkpoint: {
        id: checkpoint.id,
        name: checkpoint.name,
        createdAt: checkpoint.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  const checkpointId = req.params.id;

  if (!/^[a-f0-9]{24}$/i.test(checkpointId)) {
    return res.status(400).json({ error: "Invalid checkpoint ID." });
  }

  try {
    const { roomId } = res.locals.checkpointAccess;

    // Scope the lookup to the room authorized by the access token.
    const checkpoint = await RoomCheckpoint.findOne({
      _id: checkpointId,
      roomId,
    })
      .select("_id name createdAt entries")
      .lean()
      .exec();

    if (!checkpoint) {
      return res.status(404).json({ error: "Checkpoint not found." });
    }

    return res.json({
      checkpoint: {
        id: checkpoint._id.toString(),
        name: checkpoint.name,
        createdAt: checkpoint.createdAt,
        entries: checkpoint.entries,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/restore", async (req, res, next) => {
  const { role } = res.locals.checkpointAccess;

  if (role !== "owner") {
    return res.status(403).json({ error: "Only the room owner can restore." });
  }

  if (!/^[a-f\d]{24}$/i.test(req.params.id)) {
    return res.status(400).json({ error: "Invalid checkpoint ID." });
  }

  try {
    const response = await fetch(
      `http://127.0.0.1:1235/restore/${req.params.id}`,
      {
        method: "POST",
        headers: { Authorization: req.get("authorization")! },
        signal: AbortSignal.timeout(15_000),
      }
    );

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err) {
    console.error("Could not reach restore service:", err);
    return res.status(502).json({
      error: "Restore service did not respond. Check the room before retrying.",
    });
  }
});

export default router;