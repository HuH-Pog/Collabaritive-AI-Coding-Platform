import { SignJWT, jwtVerify } from "jose";

export type RoomRole = "owner" | "editor" | "viewer";

function signingKey() {
  const secret = process.env.ROOM_TOKEN_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      "ROOM_TOKEN_SECRET must contain at least 32 characters."
    );
  }

  return new TextEncoder().encode(secret);
}

export async function createRoomToken(
  roomId: string,
  role: RoomRole
) {
  return new SignJWT({ role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("codetogether-api")
    .setAudience("codetogether-room")
    .setSubject(roomId)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(signingKey());
}

export async function verifyRoomToken(token: string) {
  const { payload } = await jwtVerify(token, signingKey(), {
    algorithms: ["HS256"],
    issuer: "codetogether-api",
    audience: "codetogether-room",
  });

  const role = payload.role;

  if (
    !payload.sub ||
    !/^[a-f0-9]{24}$/i.test(payload.sub) ||
    (role !== "owner" && role !== "editor" && role !== "viewer")
  ) {
    throw new Error("Invalid room token.");
  }

  return {
    roomId: payload.sub,
    role,
  };
}