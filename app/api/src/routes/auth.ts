import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { User } from "../models/User.js";
import {
  createSession,
  destroySession,
  getSessionUser,
  hashPassword,
  verifyPassword,
} from "../services/auth.js";

import { OAuth2Client } from "google-auth-library";

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: "Too many attempts. Please try again later.",
  },
});

const googleClient = new OAuth2Client();

const googleLoginSchema = z.object({
  credential: z.string().min(1).max(12000),

  // Used only when explicitly linking an existing password account.
  password: z.string().min(1).max(128).optional(),
});

const signupSchema = z.object({
  name: z.string().trim().min(1).max(30),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(3).max(128),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(128),
});

// Session responses must not be cached.
router.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

// Only our frontend may make browser requests that change auth state.
// CORS alone does not prevent a request from being sent.
router.use((req, res, next) => {
  if (req.method === "GET" || req.method === "HEAD") {
    return next();
  }

  const allowedOrigin =
    process.env.WEB_ORIGIN ?? "http://localhost:3000";

  if (req.get("origin") !== allowedOrigin) {
    return res.status(403).json({
      error: "Request origin is not allowed.",
    });
  }

  next();
});

router.post("/signup", authLimiter, async (req, res) => {
  const result = signupSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json({
      error:
        "Enter a name, valid email, and a password between 12 and 128 characters.",
    });
  }

  const { name, email, password } = result.data;

  // Ensure the unique email index exists before accepting signups.
  await User.init();

  const existingUser = await User.findOne({ email });

  if (existingUser) {
    return res.status(409).json({
      error: "An account with that email already exists.",
    });
  }

  const passwordHash = await hashPassword(password);

  let user;

  try {
    user = await User.create({
      name,
      email,
      passwordHash,
    });
  } catch (error) {
    // Two simultaneous signups can pass the earlier lookup.
    if (
      error !== null &&
      typeof error === "object" &&
      "code" in error &&
      error.code === 11000
    ) {
      return res.status(409).json({
        error: "An account with that email already exists.",
      });
    }

    throw error;
  }

  await createSession(req, res, user.id);

  return res.status(201).json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
    },
  });
});

router.post("/login", authLimiter, async (req, res) => {
  const result = loginSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json({
      error: "Enter a valid email and password.",
    });
  }

  const { email, password } = result.data;

  const user = await User.findOne({ email }).select(
    "+passwordHash"
  );

  if (
  !user ||
  !user.passwordHash ||
  !(await verifyPassword(password, user.passwordHash))
) {
    return res.status(401).json({
      error: "Invalid email or password.",
    });
  }

  await createSession(req, res, user.id);

  return res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
    },
  });
});

router.get("/me", async (req, res) => {
  const user = await getSessionUser(req);

  if (!user) {
    return res.status(401).json({
      error: "You are not signed in.",
    });
  }

  return res.json({ user });
});

router.post("/logout", async (req, res) => {
  await destroySession(req, res);

  return res.json({
    message: "Signed out.",
  });
});

router.post("/google", authLimiter, async (req, res, next) => {
  if (!req.is("application/json")) {
    return res.status(415).json({
      error: "Google sign-in requires a JSON request.",
    });
  }

  const parsed = googleLoginSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: "A valid Google credential is required.",
    });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();

  if (!clientId) {
    return res.status(503).json({
      error: "Google sign-in is not configured on the server.",
    });
  }

  const { credential, password } = parsed.data;

  let identity: {
    googleId: string;
    email: string;
    name: string;
  };

  try {
    // Verify the signature, audience, issuer and expiration.
    // Never trust a token that has only been decoded.
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: clientId,
    });

    const payload = ticket.getPayload();

    if (
      !payload?.sub ||
      !payload.email ||
      payload.email_verified !== true
    ) {
      return res.status(401).json({
        error: "Google did not provide a verified email address.",
      });
    }

    const email = payload.email.trim().toLowerCase();

    if (email.length > 254) {
      return res.status(400).json({
        error: "The Google email address is too long.",
      });
    }

    identity = {
      googleId: payload.sub,
      email,
      name: (payload.name?.trim() || "Google user").slice(0, 30),
    };
  } catch {
    return res.status(401).json({
      error:
        "Could not verify Google sign-in. Select your Google account again. If this continues, check the server client ID and connection.",
    });
  }

  try {
    await User.init();

    // Returning Google users are identified by Google's stable subject ID.
    let user = await User.findOne({
      googleId: identity.googleId,
    });

    if (!user) {
      const existingUser = await User.findOne({
        email: identity.email,
      }).select("+passwordHash");

      if (existingUser) {
        if (
          existingUser.googleId &&
          existingUser.googleId !== identity.googleId
        ) {
          return res.status(409).json({
            error:
              "This account is already linked to another Google identity.",
          });
        }

        // Do not silently merge accounts just because emails match.
        if (!password) {
          return res.status(409).json({
            code: "GOOGLE_LINK_REQUIRED",
            error:
              "An account with this email already exists. Enter its password once to link Google.",
          });
        }

        if (
          !existingUser.passwordHash ||
          !(await verifyPassword(password, existingUser.passwordHash))
        ) {
          return res.status(401).json({
            error: "The existing account password is incorrect.",
          });
        }

        // Preserve the existing account ID and password.
        // The condition prevents overwriting another concurrent link.
        user = await User.findOneAndUpdate(
          {
            _id: existingUser._id,
            $or: [
              { googleId: { $exists: false } },
              { googleId: identity.googleId },
            ],
          },
          {
            $set: { googleId: identity.googleId },
          },
          {
            new: true,
            runValidators: true,
          }
        );

        if (!user) {
          return res.status(409).json({
            error:
              "The account changed while linking Google. Please try again.",
          });
        }
      } else {
        user = await User.create({
          name: identity.name,
          email: identity.email,
          googleId: identity.googleId,
        });
      }
    }

    await createSession(req, res, user.id);

    return res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    if (
      error !== null &&
      typeof error === "object" &&
      "code" in error &&
      error.code === 11000
    ) {
      return res.status(409).json({
        error:
          "An account was created or linked during this request. Please try signing in again.",
      });
    }

    next(error);
  }
});

export default router;