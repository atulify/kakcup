// Node.js only — bcryptjs uses crypto which is unavailable in Edge runtime.
// Imported by the local and Vercel Node.js authentication handlers.
import bcrypt from "bcryptjs";


export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
