import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { jwtVerify } from "jose";
import { Room } from "../models/Room.js";

export function attachChatServer(httpServer: HttpServer) {
  const secret = process.env.ROOM_TOKEN_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("ROOM_TOKEN_SECRET is missing or invalid.");
  }

  const signingKey = new TextEncoder().encode(secret);

  const io = new Server(httpServer, {
    cors: {
      origin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
      credentials: true,
    },
    maxHttpBufferSize: 16_384,
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;

      if (typeof token !== "string") {
        throw new Error("Missing room token.");
      }

      const { payload } = await jwtVerify(token, signingKey, {
        algorithms: ["HS256"],
        issuer: "codetogether-api",
        audience: "codetogether-room",
      });

      if (
        typeof payload.sub !== "string" ||
        !/^[a-f0-9]{24}$/i.test(payload.sub) ||
        !["owner", "editor", "viewer"].includes(
          String(payload.role)
        ) ||
        typeof payload.exp !== "number"
      ) {
        throw new Error("Invalid room token.");
      }

      const exists = await Room.exists({ _id: payload.sub });

      if (!exists) {
        throw new Error("Room not found.");
      }

      socket.data.roomId = payload.sub;
      socket.data.expiresAt = payload.exp * 1000;

      next();
    } catch {
      next(new Error("Room access was rejected. Please reconnect."));
    }
  });

  io.on("connection", async (socket) => {
    // The client cannot choose another room to subscribe to.
    await socket.join(`chat:${socket.data.roomId}`);

    if (!socket.connected) return;

    // Stop receiving messages once this token expires.
    const remaining = socket.data.expiresAt - Date.now();

    if (remaining <= 0) {
      socket.disconnect(true);
      return;
    }

    const expiryTimer = setTimeout(() => {
      socket.disconnect(true);
    }, Math.min(remaining, 2_147_483_647));

    socket.on("disconnect", () => {
      clearTimeout(expiryTimer);
    });

    // The frontend will load history after room subscription is ready.
    socket.emit("chat:ready");
  });

  return io;
}