import { Schema, model } from "mongoose";

const sessionSchema = new Schema(
  {
    tokenHash: {
      type: String,
      required: true,
      unique: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

// MongoDB removes expired sessions.
// We also check expiry explicitly when reading a session.
sessionSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 }
);

export const Session = model("Session", sessionSchema);