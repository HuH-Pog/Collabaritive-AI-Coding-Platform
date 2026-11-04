import { Schema, model } from "mongoose";

const checkpointEntrySchema = new Schema(
  {
    // The existing workspace ID, preserved across renames and moves.
    id: { type: String, required: true },
    kind: { type: String, enum: ["file", "folder"], required: true },
    name: { type: String, required: true },
    parentId: { type: String, default: null },

    // Only files have content. An empty string is a valid empty file.
    content: { type: String },
  },
  { _id: false, id: false }
);

const roomCheckpointSchema = new Schema(
  {
    roomId: {
      type: Schema.Types.ObjectId,
      ref: "Room",
      required: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    entries: { type: [checkpointEntrySchema], required: true },
  },
  {
    collection: "room_checkpoints",
    timestamps: true,
  }
);

roomCheckpointSchema.index({ roomId: 1, createdAt: -1, _id: -1 });

export const RoomCheckpoint = model(
  "RoomCheckpoint",
  roomCheckpointSchema
);