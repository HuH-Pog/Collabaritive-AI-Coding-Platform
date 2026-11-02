import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { jwtVerify } from "jose";
import { z } from "zod";
import { Room } from "../models/Room.js";
import { ChatMessage } from "../models/ChatMessage.js";
import type { Server } from "socket.io";

const router = Router();

const messageSchema = z.object({
  name: z.string().trim().min(1).max(30),
  text: z.string().trim().min(1).max(2000),
});

async function requireChatAccess(
  req: Request,
  res: Response,
  next: NextFunction
) {
  res.setHeader("Cache-Control", "no-store");

  const secret = process.env.ROOM_TOKEN_SECRET;

  if (!secret || secret.length < 32) {
    return next(new Error("ROOM_TOKEN_SECRET is missing or invalid."));
  }

  const authorization = req.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "A room access token is required.",
    });
  }

  let roomId: string;

  try {
    const { payload } = await jwtVerify(
      authorization.slice(7),
      new TextEncoder().encode(secret),
      {
        algorithms: ["HS256"],
        issuer: "codetogether-api",
        audience: "codetogether-room",
      }
    );

    if (
      typeof payload.sub !== "string" ||
      !/^[a-f0-9]{24}$/i.test(payload.sub) ||
      !["owner", "editor", "viewer"].includes(
        String(payload.role)
      )
    ) {
      throw new Error("Invalid room access.");
    }

    roomId = payload.sub;
  } catch {
    return res.status(401).json({
      error: "Room access expired or is invalid. Please reconnect.",
    });
  }

  try {
    const roomExists = await Room.exists({ _id: roomId });

    if (!roomExists) {
      return res.status(404).json({
        error: "Room not found.",
      });
    }

    res.locals.chatRoomId = roomId;
    return next();
  } catch (err) {
    return next(err);
  }
}

router.use(requireChatAccess);

// Return the latest 100 messages in chronological order.
router.get("/", async (_req, res, next) => {
  try {
    const messages = await ChatMessage.find({
      roomId: res.locals.chatRoomId,
    })
      .sort({ createdAt: -1, _id: -1 })
      .limit(100)
      .lean()
      .exec();

    return res.json({
      messages: messages.reverse().map((message) => ({
        id: message._id.toString(),
        name: message.name,
        text: message.text,
        createdAt: message.createdAt,
      })),
    });
  } catch (err) {
    return next(err);
  }
});

router.post("/", async (req, res, next) => {
  const result = messageSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json({
      error: "Enter a name and a message of up to 2000 characters.",
    });
  }

  try {
    const message = await ChatMessage.create({
  roomId: res.locals.chatRoomId,
  name: result.data.name,
  text: result.data.text,
});

const savedMessage = {
  id: message.id,
  name: message.name,
  text: message.text,
  createdAt: message.createdAt,
};

const io = req.app.get("chatIo") as Server | undefined;

io?.to(`chat:${res.locals.chatRoomId}`).emit(
  "chat:message",
  savedMessage
);

return res.status(201).json({
  message: savedMessage,
});

    return res.status(201).json({
      message: {
        id: message.id,
        name: message.name,
        text: message.text,
        createdAt: message.createdAt,
      },
    });
  } catch (err) {
    return next(err);
  }
});

export default router;