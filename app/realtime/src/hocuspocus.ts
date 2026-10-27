import "dotenv/config";
import { Server } from "@hocuspocus/server";
import mongoose, { Schema, model } from "mongoose";
import * as Y from "yjs";

interface IRoomDocument {
  _id: string;
  state: Buffer;
  updatedAt: Date;
}

// The document ID is the room's shareToken.
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

  if (!mongoUri) {
    throw new Error("MONGO_URI is missing from your .env file.");
  }

  // Connect before accepting editor connections.
  await mongoose.connect(mongoUri);

  console.log("Realtime server connected to MongoDB.");

  const server = new Server({
    name: "Collaborative-editor",
    port: 1234,

    // Save after 1 second without changes.
    debounce: 1000,

    // Also save periodically during continuous typing.
    maxDebounce: 5000,

    async onLoadDocument({ documentName, document }) {
      // documentName is the shareToken supplied by the frontend.
      // "rooms" is the default collection for your Room model.
      const room = await mongoose.connection
        .collection("rooms")
        .findOne(
          { shareToken: documentName },
          { projection: { _id: 1 } }
        );

      if (!room) {
        throw new Error("Room not found.");
      }

      const savedDocument = await RoomDocument.findById(
        documentName
      ).exec();

      if (savedDocument) {
        Y.applyUpdate(
          document,
          new Uint8Array(savedDocument.state)
        );

        console.log("Loaded saved editor document.");
      } else {
        console.log("Opened a room without saved code.");
      }

      return document;
    },

    async onStoreDocument({ documentName, document }) {
      // Save the complete Yjs state, including collaboration data.
      const state = Buffer.from(
        Y.encodeStateAsUpdate(document)
      );

      await RoomDocument.updateOne(
        { _id: documentName },
        { $set: { state } },
        { upsert: true }
      ).exec();

      console.log("Saved editor document to MongoDB.");
    },
  });

  await server.listen();

  console.log(
    "Hocuspocus listening on ws://localhost:1234"
  );
}

startServer().catch((error) => {
  console.error("Failed to start realtime server:", error);
  process.exitCode = 1;
});