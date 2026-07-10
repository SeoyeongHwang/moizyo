// Workers 런타임에는 node:crypto의 scrypt가 없어서 WebCrypto PBKDF2를 쓴다.
// 반복 횟수는 무료 플랜의 요청당 CPU 예산(10ms) 안에 들어오도록 잡았다 —
// 이 비밀번호는 응답 수정용 가벼운 잠금이지 계정 크리덴셜이 아니다.
const ITERATIONS = 10_000;
const KEY_LENGTH = 32; // bytes
const SALT_LENGTH = 16; // bytes

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]*$/.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    material,
    KEY_LENGTH * 8
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const hash = await deriveKey(password, salt, ITERATIONS);
  return `pbkdf2:${ITERATIONS}:${toHex(salt)}:${toHex(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 1_000_000) return false;
  const salt = fromHex(parts[2]);
  const expected = fromHex(parts[3]);
  if (!salt || !expected || expected.length !== KEY_LENGTH) return false;

  const candidate = await deriveKey(password, salt, iterations);
  let diff = 0;
  for (let i = 0; i < KEY_LENGTH; i += 1) diff |= candidate[i] ^ expected[i];
  return diff === 0;
}
