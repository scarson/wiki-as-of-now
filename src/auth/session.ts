// ABOUTME: jose-signed session tokens (HS256) carrying only the opaque userId — no PII in the payload (CC-12).
// ABOUTME: issueSession/verifySession; verify rejects wrong-secret, tampered, expired, and malformed tokens, and pins HS256.
import { SignJWT, jwtVerify } from "jose";

export interface SessionClaims {
  userId: string;
}

interface IssueOptions {
  ttlSeconds: number;
}

function keyFrom(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function issueSession(
  claims: SessionClaims,
  secret: string,
  opts: IssueOptions,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ userId: claims.userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(now + opts.ttlSeconds)
    .sign(keyFrom(secret));
}

export async function verifySession(token: string, secret: string): Promise<SessionClaims> {
  // algorithms pinned to HS256: never let the token header pick the algorithm (alg-confusion / "none" attacks).
  const { payload } = await jwtVerify(token, keyFrom(secret), { algorithms: ["HS256"] });
  if (typeof payload.userId !== "string" || payload.userId.length === 0) {
    throw new Error("session: missing userId claim");
  }
  return { userId: payload.userId };
}
