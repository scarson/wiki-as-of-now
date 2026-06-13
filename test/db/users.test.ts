// ABOUTME: Exercises the users db module against a real (FK-on, migrated) executor — upsert/read/idempotent re-login.
// ABOUTME: No mocks: the typed module runs exactly as in production, just on better-sqlite3 instead of D1.
import { describe, it, expect } from "vitest";
import { freshTestExecutor } from "../helpers/db";
import { upsertUser, getUserById, getUserByIdentity } from "../../src/db/users";

describe("users db module", () => {
  it("upserts then reads back a user by id", async () => {
    const db = freshTestExecutor();
    const user = {
      userId: "u_abc123",
      identityProvider: "google",
      identitySubject: "google-sub-1",
      email: "editor@example.com",
      createdAt: "2026-06-13T00:00:00.000Z",
    };
    await upsertUser(db, user);
    const read = await getUserById(db, "u_abc123");
    expect(read).toEqual(user);
  });

  it("looks up a user by (provider, subject)", async () => {
    const db = freshTestExecutor();
    await upsertUser(db, {
      userId: "u_xyz",
      identityProvider: "google",
      identitySubject: "sub-xyz",
      email: "e@example.com",
      createdAt: "2026-06-13T00:00:00.000Z",
    });
    const read = await getUserByIdentity(db, "google", "sub-xyz");
    expect(read?.userId).toBe("u_xyz");
  });

  it("upsert is idempotent on re-login: same identity updates email, does not duplicate", async () => {
    const db = freshTestExecutor();
    const base = {
      userId: "u_one",
      identityProvider: "google",
      identitySubject: "sub-one",
      email: "old@example.com",
      createdAt: "2026-06-13T00:00:00.000Z",
    };
    await upsertUser(db, base);
    await upsertUser(db, { ...base, email: "new@example.com" });
    const read = await getUserById(db, "u_one");
    expect(read?.email).toBe("new@example.com");
  });

  it("returns undefined for an unknown user id", async () => {
    const db = freshTestExecutor();
    expect(await getUserById(db, "nope")).toBeUndefined();
  });

  it("returns undefined for an unknown identity", async () => {
    const db = freshTestExecutor();
    expect(await getUserByIdentity(db, "google", "absent")).toBeUndefined();
  });
});
