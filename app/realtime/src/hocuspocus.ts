import "dotenv/config";
import { Server } from "@hocuspocus/server";
import mongoose, { Schema, model } from "mongoose";
import { jwtVerify } from "jose";
import * as Y from "yjs";
import { startRestoreServer } from "./restoreCheckpoint.js";

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

    async beforeHandleMessage({ documentName }) {
  if (!/^[a-f0-9]{24}$/i.test(documentName)) {
    throw new Error("Invalid room.");
  }

  const room = await mongoose.connection
    .collection("rooms")
    .findOne(
      { _id: new mongoose.Types.ObjectId(documentName) },
      { projection: { _id: 1 } }
    );

  if (!room) {
    throw new Error("This room has been deleted.");
  }
},

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
  if (!/^[a-f0-9]{24}$/i.test(documentName)) {
    throw new Error("Invalid room.");
  }

  const roomId = new mongoose.Types.ObjectId(documentName);
  const rooms = mongoose.connection.collection("rooms");

  const room = await rooms.findOne({
    _id: roomId,
  });

  if (!room) {
    throw new Error("Room not found.");
  }

  // Keep the existing persistence key.
  const savedDocument = await RoomDocument.findById(
    room.shareToken
  ).exec();

  if (savedDocument) {
    Y.applyUpdate(
      document,
      new Uint8Array(savedDocument.state)
    );
  }

  const workspace = document.getMap("workspace");
  const files = document.getMap("files");

  const schemaVersion = workspace.get("schemaVersion");

  // Refuse an unknown format instead of overwriting it.
  if (schemaVersion !== undefined && schemaVersion !== 1) {
    throw new Error("Unsupported workspace version.");
  }

  // Initialise new rooms and migrate existing single-file rooms.
  // This runs on the server before the document is sent to clients.
  if (schemaVersion === undefined) {
    if (files.size > 0) {
      throw new Error(
        "Workspace contains files but has no schema version."
      );
    }

    document.transact(() => {
      files.set("main", {
        id: "main",
        kind: "file",
        name:
          room.language === "python"
            ? "main.py"
            : "main.js",
        parentId: null,

        // Reuse the existing Y.Text without copying or clearing it.
        textKey: "code",
      });

      workspace.set("schemaVersion", 1);
    });

    // Persist initialisation even if nobody edits the room.
    await RoomDocument.updateOne(
      { _id: room.shareToken },
      {
        $set: {
          state: Buffer.from(
            Y.encodeStateAsUpdate(document)
          ),
        },
      },
      { upsert: true }
    ).exec();
  }

  // Handle deletion while the document was loading or saving.
  const stillExists = await rooms.findOne(
    { _id: roomId },
    { projection: { _id: 1 } }
  );

  if (!stillExists) {
    await RoomDocument.deleteOne({
      _id: room.shareToken,
    }).exec();

    throw new Error("This room has been deleted.");
  }

  return document;
},

    async onStoreDocument({ documentName, document }) {
  const roomId = new mongoose.Types.ObjectId(documentName);

  const room = await mongoose.connection
    .collection("rooms")
    .findOne({ _id: roomId });

  // Deletion is expected; do not retry saving a deleted room.
  if (!room) return;

  const state = Buffer.from(
    Y.encodeStateAsUpdate(document)
  );

  await RoomDocument.updateOne(
    { _id: room.shareToken },
    { $set: { state } },
    { upsert: true }
  ).exec();

  // Deletion may have happened while the save was running.
  const stillExists = await mongoose.connection
    .collection("rooms")
    .findOne(
      { _id: roomId },
      { projection: { _id: 1 } }
    );

  if (!stillExists) {
    await RoomDocument.deleteOne({
      _id: room.shareToken,
    }).exec();
  }
},
  });

  await server.listen();
  startRestoreServer(
  (roomId) => server.hocuspocus.documents.get(roomId),
  signingKey
);

  let checkingDeletedRooms = false;

const deletionTimer = setInterval(async () => {
  if (checkingDeletedRooms) return;
  checkingDeletedRooms = true;

  try {
    const names = [...server.hocuspocus.documents.keys()];

    if (!names.length) return;

    const validNames = names.filter((name) =>
      /^[a-f0-9]{24}$/i.test(name)
    );

    const rooms = await mongoose.connection
      .collection("rooms")
      .find(
        {
          _id: {
            $in: validNames.map(
              (name) => new mongoose.Types.ObjectId(name)
            ),
          },
        },
        { projection: { _id: 1 } }
      )
      .toArray();

    const existingIds = new Set(
      rooms.map((room) => room._id.toString())
    );

    for (const name of names) {
      if (!existingIds.has(name)) {
        server.hocuspocus.closeConnections(name);
      }
    }
  } catch (err) {
    console.error("Could not check deleted rooms:", err);
  } finally {
    checkingDeletedRooms = false;
  }
}, 2000);

deletionTimer.unref();

  console.log("Hocuspocus listening on ws://localhost:1234");
}

startServer().catch((error) => {
  console.error("Failed to start realtime server:", error);
  process.exitCode = 1;
})