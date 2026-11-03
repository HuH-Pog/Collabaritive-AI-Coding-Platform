import { randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { Room } from "../models/Room.js";
import { getSessionUser } from "../services/auth.js";
import {
  createRoomToken,
  type RoomRole,
} from "../services/roomAccess.js";
import { error } from "node:console";

import mongoose from "mongoose";
import { ChatMessage } from "../models/ChatMessage.js";
import type { Server as SocketIOServer } from "socket.io";

const router = Router();

const createRoomSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  language: z.enum(["javascript", "python"]).default("javascript"),
});

// Create a room: requires a signed-in user.
router.post("/", async (req, res) => {
  const allowedOrigin =
    process.env.WEB_ORIGIN ?? "http://localhost:3000";

  if (req.get("origin") !== allowedOrigin) {
    return res.status(403).json({
      error: "Request origin is not allowed.",
    });
  }

  const user = await getSessionUser(req);

  if (!user) {
    return res.status(401).json({
      error: "Please sign in to create a room.",
    });
  }

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
    ownerId: user.id,
  });

  return res.status(201).json({
    id: room.id,
    name: room.name,
    language: room.language,
    shareToken: room.shareToken,
    createdAt: room.createdAt,
  });
});

// List the signed-in user's 50 newest rooms.
// Keep this BEFORE "/:shareToken".
router.get("/mine", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  const user = await getSessionUser(req);

  if (!user) {
    return res.status(401).json({
      error: "Please sign in to view your rooms.",
    });
  }

  const rooms = await Room.find({
    ownerId: user.id,
  })
    .sort({ createdAt: -1 })
    .limit(50)
    .exec();

  return res.json({
    rooms: rooms.map((room) => ({
      id: room.id,
      name: room.name,
      language: room.language,
      shareToken: room.shareToken,
      createdAt: room.createdAt,
    })),
  });
});

// Anyone with a valid invite link can still load a room.
// Exchange an invite link for a signed room-access token.
router.get("/:shareToken/access", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  const inviteToken = req.params.shareToken;

  const room = await Room.findOne({
    $or: [
      { shareToken: inviteToken },
      { viewerToken: inviteToken },
    ],
  });

  if (!room) {
    return res.status(404).json({
      error: "Room not found.",
    });
  }

  const user = await getSessionUser(req);

  const isOwner =
    Boolean(user) &&
    room.ownerId?.toString() === user?.id;

  let role: RoomRole;

  if (isOwner) {
    role = "owner";
  } else if (room.shareToken === inviteToken) {
    role = "editor";
  } else {
    role = "viewer";
  }

  const accessToken = await createRoomToken(room.id, role);

  // Do not expose the editor invite token to viewers.
  return res.json({
    id: room.id,
    name: room.name,
    language: room.language,
    createdAt: room.createdAt,
    documentName: room.id,
    role,
    accessToken,
  });
});

// Only the signed-in owner can generate/retrieve both invite links.
router.post("/:shareToken/invites", async (req, res) => {
  const allowedOrigin =
    process.env.WEB_ORIGIN ?? "http://localhost:3000";

  if (req.get("origin") !== allowedOrigin) {
    return res.status(403).json({
      error: "Request origin is not allowed.",
    });
  }

  const user = await getSessionUser(req);

  if (!user) {
    return res.status(401).json({
      error: "Please sign in.",
    });
  }

  const inviteToken = req.params.shareToken;

  const room = await Room.findOne({
    $or: [
      { shareToken: inviteToken },
      { viewerToken: inviteToken },
    ],
  });

  if (!room) {
    return res.status(404).json({
      error: "Room not found.",
    });
  }

  if (room.ownerId?.toString() !== user.id) {
    return res.status(403).json({
      error: "Only the owner can manage invites.",
    });
  }

  // Atomic initialisation prevents simultaneous requests from
  // overwriting each other's newly generated viewer token.
  await Room.updateOne(
    {
      _id: room._id,
      viewerToken: { $exists: false },
    },
    {
      $set: {
        viewerToken: randomBytes(24).toString("base64url"),
      },
    }
  );

  const updatedRoom = await Room.findById(room._id);

  return res.json({
    editorToken: room.shareToken,
    viewerToken: updatedRoom?.viewerToken,
  });
});

// Room metadata is available through either valid invite link.
router.get("/:shareToken", async (req, res) => {
  const inviteToken = req.params.shareToken;

  const room = await Room.findOne({
    $or: [
      { shareToken: inviteToken },
      { viewerToken: inviteToken },
    ],
  });

  if (!room) {
    return res.status(404).json({
      error: "Room not found.",
    });
  }

  return res.json({
    id: room.id,
    name: room.name,
    language: room.language,
    createdAt: room.createdAt,
  });
});

// Delete a room owned by the signed-in user.
router.delete("/:shareToken", async (req, res, next) => {
  const allowedOrigin =
    process.env.WEB_ORIGIN ?? "http://localhost:3000";

  if (req.get("origin") !== allowedOrigin) {
    return res.status(403).json({
      error: "Request origin is not allowed.",
    });
  }

  try {
    const user = await getSessionUser(req);

    if (!user) {
      return res.status(401).json({
        error: "Please sign in to delete a room.",
      });
    }

    const room = await Room.findOne({
      $or: [
        { shareToken: req.params.shareToken },
        { viewerToken: req.params.shareToken },
      ],
    });

    if (!room) {
      return res.status(404).json({
        error: "Room not found.",
      });
    }

    if (room.ownerId?.toString() !== user.id) {
      return res.status(403).json({
        error: "Only the room owner can delete this room.",
      });
    }

    // Remove access first. New access-token requests will now fail.
    const deleted = await Room.deleteOne({
      _id: room._id,
      ownerId: user.id,
    });

    if (!deleted.deletedCount) {
      return res.status(404).json({
        error: "Room has already been deleted.",
      });
    }

    const io = req.app.get("chatIo") as
      | SocketIOServer
      | undefined;

    const channel = `chat:${room.id}`;

    io?.to(channel).emit("room:deleted", {
      roomId: room.id,
    });

    io?.in(channel).disconnectSockets(true);

    // Your realtime server stores code under the editor share token.
    await Promise.all([
      mongoose.connection
        .collection<{ _id: string }>("room_documents")
        .deleteOne({ _id: room.shareToken }),

      ChatMessage.deleteMany({
        roomId: room._id,
      }).exec(),
    ]);

    return res.status(204).end();
  } catch (err) {
    return next(err);
  }
});

export default router;