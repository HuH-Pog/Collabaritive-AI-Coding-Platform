import { Schema, model } from "mongoose";

const chatMessageSchema = new Schema(
  {
    roomId: {
      type: Schema.Types.ObjectId,
      ref: "Room",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 30,
    },
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
  },
  {
    timestamps: true,
    collection: "chat_messages",
  }
);

chatMessageSchema.index({
  roomId: 1,
  createdAt: -1,
  _id: -1,
});

export const ChatMessage = model(
  "ChatMessage",
  chatMessageSchema
);