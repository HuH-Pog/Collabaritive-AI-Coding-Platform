import {
  createHash,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import type {
  CookieOptions,
  Request,
  Response,
} from "express";
import { User } from "../models/User.js";
import { Session } from "../models/Session.js";

const COOKIE_NAME = "codetogether_session";
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000;

const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
};

function deriveKey(password: string, salt: string) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(
      password,
      salt,
      64,
      {
        N: 32768,
        r: 8,
        p: 3,
        maxmem: 64 * 1024 * 1024,
      },
      (error, key) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(key);
      }
    );
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = await deriveKey(password, salt);

  return `${salt}:${key.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  storedHash: string
) {
  const [salt, keyHex] = storedHash.split(":");

  if (!salt || !keyHex) return false;

  const storedKey = Buffer.from(keyHex, "hex");
  const suppliedKey = await deriveKey(password, salt);

  return (
    storedKey.length === suppliedKey.length &&
    timingSafeEqual(storedKey, suppliedKey)
  );
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function readToken(req: Request) {
  const cookies = req.headers.cookie?.split(";") ?? [];

  for (const cookie of cookies) {
    const [key, ...parts] = cookie.trim().split("=");

    if (key === COOKIE_NAME) {
      const value = parts.join("=");

      // Our tokens are exactly 64 hexadecimal characters.
      return /^[a-f0-9]{64}$/.test(value) ? value : null;
    }
  }

  return null;
}

export async function destroySession(
  req: Request,
  res: Response
) {
  const token = readToken(req);

  if (token) {
    await Session.deleteOne({
      tokenHash: hashToken(token),
    });
  }

  res.clearCookie(COOKIE_NAME, cookieOptions);
}

export async function createSession(
  req: Request,
  res: Response,
  userId: string
) {
  // Replace the session belonging to this browser cookie.
  await destroySession(req, res);

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DURATION);

  await Session.create({
    tokenHash: hashToken(token),
    userId,
    expiresAt,
  });

  res.cookie(COOKIE_NAME, token, {
    ...cookieOptions,
    maxAge: SESSION_DURATION,
  });
}

export async function getSessionUser(req: Request) {
  const token = readToken(req);
  if (!token) return null;

  const session = await Session.findOne({
    tokenHash: hashToken(token),
    expiresAt: { $gt: new Date() },
  });

  if (!session) return null;

  const user = await User.findById(session.userId);
  if (!user) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
  };
}