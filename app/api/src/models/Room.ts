import { Schema, model } from "mongoose";
import type { Types } from "mongoose";

interface IRoom {
  name: string;
  language: "javascript" | "python";
  shareToken: string;
  ownerId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  viewerToken?: string;
}

const roomSchema = new Schema<IRoom>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
      default: "Untitled room",
    },
    language: {
      type: String,
      required: true,
      enum: ["javascript", "python"],
      default: "javascript",
    },
    shareToken: {
      type: String,
      required: true,
      unique: true,
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      immutable: true,
    },
    viewerToken: {
  type: String,
},
  },
  { timestamps: true }
);

// Supports finding a user's newest rooms.
roomSchema.index({ ownerId: 1, createdAt: -1 });
roomSchema.index(
  { viewerToken: 1 },
  { unique: true, sparse: true }
);

export const Room = model<IRoom>("Room", roomSchema);