import { createServer } from "node:http";
import mongoose from "mongoose";
import { jwtVerify } from "jose";
import * as Y from "yjs";

type Entry = {
  id: string;
  kind: "file" | "folder";
  name: string;
  parentId: string | null;
};

type LiveEntry = Entry & { textKey?: string };
type SavedEntry = Entry & { content?: string };

type Checkpoint = {
  roomId: mongoose.Types.ObjectId;
  name: string;
  entries: SavedEntry[];
  createdAt: Date;
  updatedAt: Date;
};

function textKey(id: string) {
  return id === "main" ? "code" : `file:${id}`;
}

function capture(doc: Y.Doc): SavedEntry[] {
  const files = doc.getMap<LiveEntry>("files");

  return Array.from(files.values(), (entry) => {
    const { id, kind, name } = entry;
    const parentId =
      entry.parentId !== null && files.get(entry.parentId)?.kind === "folder"
        ? entry.parentId
        : null;

    const base = { id, kind, name, parentId };

    return kind === "folder"
      ? base
      : {
          ...base,
          content: doc.getText(entry.textKey ?? textKey(id)).toString(),
        };
  });
}

function applyCheckpoint(doc: Y.Doc, entries: SavedEntry[]) {
  const files = doc.getMap<LiveEntry>("files");
  const savedIds = new Set(entries.map((entry) => entry.id));

  doc.transact(() => {
    for (const id of Array.from(files.keys())) {
      if (!savedIds.has(id)) files.delete(id);
    }

    for (const entry of entries) {
      const { id, kind, name, parentId } = entry;
      const base = { id, kind, name, parentId };

      if (kind === "folder") {
        files.set(id, base);
        continue;
      }

      const key = textKey(id);
      const text = doc.getText(key);
      const content = entry.content ?? "";

      if (text.toString() !== content) {
        if (text.length) text.delete(0, text.length);
        if (content.length) text.insert(0, content);
      }

      files.set(id, { ...base, textKey: key });
    }
  }, "checkpoint-restore");
}

export function startRestoreServer(
  getLiveDoc: (roomId: string) => Y.Doc | undefined,
  signingKey: Uint8Array
) {
  const restoring = new Set<string>();
  const checkpoints =
    mongoose.connection.collection<Checkpoint>("room_checkpoints");

  const http = createServer(async (req, res) => {
    function reply(status: number, body: object) {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    }

    const match = /^\/restore\/([a-f\d]{24})$/i.exec(req.url ?? "");
    if (req.method !== "POST" || !match) {
      return reply(404, { error: "Route not found." });
    }

    const authorization = req.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) {
      return reply(401, { error: "Room token required." });
    }

    let roomId: string;

    try {
      const { payload } = await jwtVerify(authorization.slice(7), signingKey, {
        algorithms: ["HS256"],
        issuer: "codetogether-api",
        audience: "codetogether-room",
      });

      if (typeof payload.sub !== "string" || !/^[a-f\d]{24}$/i.test(payload.sub)) {
        return reply(401, { error: "Invalid room token." });
      }

      if (payload.role !== "owner") {
        return reply(403, { error: "Only the room owner can restore." });
      }

      roomId = payload.sub;
    } catch {
      return reply(401, { error: "Room token expired or invalid." });
    }

    if (restoring.has(roomId)) {
      return reply(409, { error: "A restore is already running for this room." });
    }

    restoring.add(roomId);

    try {
      const roomObjectId = new mongoose.Types.ObjectId(roomId);
      const room = await mongoose.connection.collection("rooms").findOne(
        { _id: roomObjectId },
        { projection: { _id: 1 } }
      );

      if (!room) return reply(404, { error: "Room was deleted." });

      const target = await checkpoints.findOne({
        _id: new mongoose.Types.ObjectId(match[1]),
        roomId: roomObjectId,
      });

      if (!target) return reply(404, { error: "Checkpoint not found." });

      const doc = getLiveDoc(roomId);
      if (!doc) {
        return reply(409, { error: "Reconnect to the room before restoring." });
      }

      // An edit can arrive while MongoDB is saving the recovery point.
      // If that happens, abort rather than overwrite the newer edit.
      let changed = false;
      const onUpdate = () => { changed = true; };
      doc.on("update", onUpdate);

      try {
        const now = new Date();
        const backup = await checkpoints.insertOne({
          roomId: roomObjectId,
          name: "Before restore",
          entries: capture(doc),
          createdAt: now,
          updatedAt: now,
        });

        if (changed || getLiveDoc(roomId) !== doc) {
          return reply(409, {
            error: "The room changed during backup. Nothing was restored. Try again.",
          });
        }

        // No await between the final check and the live transaction.
        applyCheckpoint(doc, target.entries);

        return reply(200, {
          message: `Restored "${target.name}".`,
          backupId: backup.insertedId.toString(),
        });
      } finally {
        doc.off("update", onUpdate);
      }
    } catch (err) {
      console.error("Checkpoint restore failed:", err);
      return reply(500, { error: "Could not complete checkpoint restore." });
    } finally {
      restoring.delete(roomId);
    }
  });

  http.listen(1235, "127.0.0.1");
  return http;
}