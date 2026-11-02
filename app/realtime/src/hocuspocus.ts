import "dotenv/config";
import { Server } from "@hocuspocus/server";
import mongoose, { Schema, model } from "mongoose";
import { jwtVerify } from "jose";
import * as Y from "yjs";

interface IRoomDocument {
  _id: string;
  state: Buffer;
  updatedAt: Date;
}

const roomDocumentSchema = new Schema<IRoomDocument>(
  {
    _id: {
      type: String,
      required: true,
    },
    state: {
      type: Buffer,
      required: true,
    },
  },
  {
    collection: "room_documents",
    timestamps: true,
  }
);

const RoomDocument = model<IRoomDocument>(
  "RoomDocument",
  roomDocumentSchema
);

async function startServer() {
  const mongoUri = process.env.MONGO_URI;
  const secret = process.env.ROOM_TOKEN_SECRET;

  if (!mongoUri) {
    throw new Error("MONGO_URI is missing.");
  }

  if (!secret || secret.length < 32) {
    throw new Error(
      "ROOM_TOKEN_SECRET must contain at least 32 characters."
    );
  }

  const signingKey = new TextEncoder().encode(secret);

  await mongoose.connect(mongoUri);

  const server = new Server({
    name: "Collaborative-editor",
    port: 1234,
    debounce: 1000,
    maxDebounce: 5000,

    async onAuthenticate({
  token,
  documentName,
  connectionConfig,
}) {
      const { payload } = await jwtVerify(
        token,
        signingKey,
        {
          algorithms: ["HS256"],
          issuer: "codetogether-api",
          audience: "codetogether-room",
        }
      );

      if (
        payload.sub !== documentName ||
        !/^[a-f0-9]{24}$/i.test(documentName)
      ) {
        throw new Error("Invalid room access.");
      }

      const role = payload.role;

      if (
        role !== "owner" &&
        role !== "editor" &&
        role !== "viewer"
      ) {
        throw new Error("Invalid role.");
      }

      const room = await mongoose.connection
        .collection("rooms")
        .findOne({
          _id: new mongoose.Types.ObjectId(documentName),
        });

      if (!room) {
        throw new Error("Room not found.");
      }

      // Enforced by Hocuspocus, independently of the frontend.
      connectionConfig.readOnly = role === "viewer";

      return { role };
    },

    async onLoadDocument({ documentName, document }) {
      const room = await mongoose.connection
        .collection("rooms")
        .findOne({
          _id: new mongoose.Types.ObjectId(documentName),
        });

      if (!room) {
        throw new Error("Room not found.");
      }

      // Keep the existing persistence key so saved code is preserved.
      const savedDocument = await RoomDocument.findById(
        room.shareToken
      ).exec();

      if (savedDocument) {
        Y.applyUpdate(
          document,
          new Uint8Array(savedDocument.state)
        );
      }

      return document;
    },

    async onStoreDocument({ documentName, document }) {
      const room = await mongoose.connection
        .collection("rooms")
        .findOne({
          _id: new mongoose.Types.ObjectId(documentName),
        });

      if (!room) {
        throw new Error("Room not found.");
      }

      const state = Buffer.from(
        Y.encodeStateAsUpdate(document)
      );

      await RoomDocument.updateOne(
        { _id: room.shareToken },
        { $set: { state } },
        { upsert: true }
      ).exec();

      console.log("Saved editor document.");
    },
  });

  await server.listen();

  console.log("Hocuspocus listening on ws://localhost:1234");
}

startServer().catch((error) => {
  console.error("Failed to start realtime server:", error);
  process.exitCode = 1;
});