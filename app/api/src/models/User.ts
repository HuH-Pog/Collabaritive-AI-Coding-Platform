import { Schema, model } from "mongoose";

const userSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 30,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    passwordHash: {
      type: String,
      select: false,

      // Password accounts require a hash.
      // Google accounts can be created without one.
      required: function (this: { googleId?: string | null }) {
        return !this.googleId;
      },
    },

    googleId: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

// Existing password users have no googleId.
// When present, a Google identity can belong to only one user.
userSchema.index(
  { googleId: 1 },
  { unique: true, sparse: true }
);

export const User = model("User", userSchema);