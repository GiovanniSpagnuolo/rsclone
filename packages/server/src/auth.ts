//
//  auth.ts
//
//  Created by Giovanni Spagnuolo on 2/9/26.
//

import jwt from "jsonwebtoken";
import argon2 from "argon2";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "./db.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

export const RegisterSchema = z.object({
  email: z.string().email().max(254),
  username: z.string().min(3).max(16).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(8).max(200)
});

export const LoginSchema = z.object({
  emailOrUsername: z.string().min(3).max(254),
  password: z.string().min(8).max(200)
});

export type AuthedUser = { id: string; email: string; username: string; rights: number };

export function signToken(user: AuthedUser) {
  // Keep token minimal; rights are authoritative in DB and loaded in verifyToken().
  return jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): AuthedUser | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { sub: string };
    const row = db
      .prepare("SELECT id, email, username, rights FROM users WHERE id = ?")
      .get(decoded.sub) as AuthedUser | undefined;
    return row ?? null;
  } catch {
    return null;
  }
}

export async function registerUser(input: z.infer<typeof RegisterSchema>) {
  const { email, username, password } = RegisterSchema.parse(input);

  const existing = db
    .prepare("SELECT 1 FROM users WHERE email = ? OR username = ?")
    .get(email.toLowerCase(), username) as any;

  if (existing) throw new Error("Email or username already in use.");

  // ✅ First user becomes admin
  const countRow = db.prepare("SELECT COUNT(*) as n FROM users").get() as { n: number };
  const rights = (countRow?.n ?? 0) === 0 ? 3 : 0;

  const id = randomUUID();
  const password_hash = await argon2.hash(password);
  const created_at = Date.now();

  db.prepare(
    "INSERT INTO users (id, email, username, password_hash, created_at, rights) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, email.toLowerCase(), username, password_hash, created_at, rights);

  // Create a default character for now (later: character select)
  const charId = randomUUID();
  db.prepare(
    "INSERT INTO characters (id, user_id, name, x, y, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(charId, id, username, 7, 7, created_at, created_at);

  const user: AuthedUser = { id, email: email.toLowerCase(), username, rights };
  return { user, token: signToken(user) };
}

export async function loginUser(input: z.infer<typeof LoginSchema>) {
  const { emailOrUsername, password } = LoginSchema.parse(input);

  const row = db
    .prepare(
      "SELECT id, email, username, password_hash, rights FROM users WHERE email = ? OR username = ?"
    )
    .get(emailOrUsername.toLowerCase(), emailOrUsername) as
    | { id: string; email: string; username: string; password_hash: string; rights: number }
    | undefined;

  if (!row) throw new Error("Invalid credentials.");

  const ok = await argon2.verify(row.password_hash, password);
  if (!ok) throw new Error("Invalid credentials.");

  const user: AuthedUser = {
    id: row.id,
    email: row.email,
    username: row.username,
    rights: row.rights ?? 0
  };
  return { user, token: signToken(user) };
}
