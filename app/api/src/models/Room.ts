import { Schema, model } from "mongoose";

interface IRoom {
  name: string;
  language: "javascript" | "python";
  shareToken: string;
  createdAt: Date;
  updatedAt: Date;
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
  },
  { timestamps: true },
);

export const Room = model<IRoom>("Room", roomSchema);