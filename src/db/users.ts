// ABOUTME: Persistence for OAuth/app user identity (metered research layer); single-admin fallback keys to a fixed user.
// ABOUTME: Natural-key (user_id) WITHOUT ROWID table; upsert on re-login, lookup by id or (provider, subject).
import type { SqlExecutor, SqlStatement } from "./client";

export interface User {
  userId: string;
  identityProvider: string;
  identitySubject: string;
  email: string;
  createdAt: string;
}

interface RawUserRow {
  user_id: string;
  identity_provider: string;
  identity_subject: string;
  email: string;
  created_at: string;
}

function toUser(r: RawUserRow): User {
  return {
    userId: r.user_id,
    identityProvider: r.identity_provider,
    identitySubject: r.identity_subject,
    email: r.email,
    createdAt: r.created_at,
  };
}

/** Bound, UNEXECUTED upsert — for inclusion in an atomic db.batch([...]) (e.g. the consumer's
 *  pack commit, which seeds the single-admin user so the quota_ledger FK is always satisfiable). */
export function upsertUserStatement(db: SqlExecutor, u: User): SqlStatement {
  return db
    .prepare(
      "INSERT INTO users (user_id, identity_provider, identity_subject, email, created_at) " +
        "VALUES (?, ?, ?, ?, ?) " +
        "ON CONFLICT(user_id) DO UPDATE SET email = excluded.email",
    )
    .bind(u.userId, u.identityProvider, u.identitySubject, u.email, u.createdAt);
}

export async function upsertUser(db: SqlExecutor, u: User): Promise<void> {
  await upsertUserStatement(db, u).run();
}

/** Bound, UNEXECUTED seed insert — ON CONFLICT DO NOTHING. A pure foreign-key safety net for batches that
 *  must reference a user row (e.g. the consumer's quota_ledger commit): it inserts the row only when absent
 *  and NEVER overwrites an existing user's email/identity (so a real login's row is left untouched). */
export function seedUserIfAbsentStatement(db: SqlExecutor, u: User): SqlStatement {
  return db
    .prepare(
      "INSERT INTO users (user_id, identity_provider, identity_subject, email, created_at) " +
        "VALUES (?, ?, ?, ?, ?) " +
        "ON CONFLICT(user_id) DO NOTHING",
    )
    .bind(u.userId, u.identityProvider, u.identitySubject, u.email, u.createdAt);
}

export async function getUserById(db: SqlExecutor, userId: string): Promise<User | undefined> {
  const rows = await db
    .prepare(
      "SELECT user_id, identity_provider, identity_subject, email, created_at FROM users WHERE user_id = ?",
    )
    .bind(userId)
    .all<RawUserRow>();
  return rows[0] ? toUser(rows[0]) : undefined;
}

export async function getUserByIdentity(
  db: SqlExecutor,
  provider: string,
  subject: string,
): Promise<User | undefined> {
  const rows = await db
    .prepare(
      "SELECT user_id, identity_provider, identity_subject, email, created_at FROM users " +
        "WHERE identity_provider = ? AND identity_subject = ?",
    )
    .bind(provider, subject)
    .all<RawUserRow>();
  return rows[0] ? toUser(rows[0]) : undefined;
}
