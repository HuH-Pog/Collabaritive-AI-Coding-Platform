import { randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { Room } from "../models/Room.js";

const router = Router();

const createRoomSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  language: z.enum(["javascript", "python"]).default("javascript"),
});

router.post("/", async (req, res) => {
  const result = createRoomSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json({
      error: "Invalid room details",
      details: result.error.issues,
    });
  }

  const shareToken = randomBytes(24).toString("base64url");

  const room = await Room.create({
    name: result.data.name ?? "Untitled Room",
    language: result.data.language,
    shareToken,
  });

  return res.status(201).json({
    id: room.id,
    name: room.name,
    language: room.language,
    shareToken: room.shareToken,
    createdAt: room.createdAt,
  });
});

router.get("/:shareToken", async (req, res) => {
  const room = await Room.findOne({
    shareToken: req.params.shareToken,
  });

  if (!room) {
    return res.status(404).json({
      error: "Room not found",
    });
  }

  return res.json({
    id: room.id,
    name: room.name,
    language: room.language,
    shareToken: room.shareToken,
    createdAt: room.createdAt,
  });
});

export default router;