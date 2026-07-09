import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;
const HEX_KEY_LENGTH = KEY_LENGTH * 2;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return `${salt}:${hash}`;
}

const hexSaltPattern = /^[0-9a-f]+$/;
const hexHashPattern = new RegExp(`^[0-9a-f]{${HEX_KEY_LENGTH}}$`);

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 2) return false;
  const [salt, hash] = parts;
  if (!hexSaltPattern.test(salt) || !hexHashPattern.test(hash)) return false;

  const expected = Buffer.from(hash, "hex");
  const candidate = scryptSync(password, salt, KEY_LENGTH);
  return timingSafeEqual(candidate, expected);
}
