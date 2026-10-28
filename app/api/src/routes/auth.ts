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

export default router;