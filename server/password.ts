// Node.js only — bcryptjs uses crypto which is unavailable in Edge runtime.
// Only imported by server/auth-routes.ts (api/auth.ts, Node.js function).
import bcrypt from "bcryptjs";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
