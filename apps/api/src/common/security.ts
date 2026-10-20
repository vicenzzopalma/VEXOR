import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

// Default encryption key derived from environment or secure fallback for local dev
let defaultKey: Buffer | null = null;

export function getEncryptionKey(): Buffer {
  if (defaultKey) return defaultKey;
  const envKey = process.env.ENCRYPTION_KEY || process.env.FLOW_ENCRYPTION_KEY;
  if (envKey) {
    const buf = Buffer.from(envKey, 'hex');
    if (buf.length === 32) {
      defaultKey = buf;
      return defaultKey;
    }
  }
  // Deterministic local development key (never use in real production deployment)
  defaultKey = createHash('sha256').update('eimax-local-development-secret-key-32b').digest();
  return defaultKey;
}

export function setEncryptionKey(key: Buffer) {
  if (key.length !== 32) throw new Error('A chave de criptografia deve conter exatamente 32 bytes (256 bits).');
  defaultKey = key;
}

export const hashSha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export function validCpf(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (!/^\d{11}$/.test(digits) || /^(\d)\1+$/.test(digits)) return false;
  for (let length = 9; length <= 10; length++) {
    const sum = [...digits.slice(0, length)].reduce(
      (a, digit, index) => a + Number(digit) * (length + 1 - index),
      0,
    );
    if (((sum * 10) % 11) % 10 !== Number(digits[length])) return false;
  }
  return true;
}

export function formatCpf(digits: string): string {
  const clean = digits.replace(/\D/g, '');
  if (clean.length !== 11) return digits;
  return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6, 9)}-${clean.slice(9, 11)}`;
}

export function encryptCpf(cpf: string, key?: Buffer): { ciphertext: string; fingerprint: string; last4: string } {
  const clean = cpf.replace(/\D/g, '');
  if (!validCpf(clean)) throw new Error('CPF inválido.');

  const encKey = key ?? getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encKey, iv);
  const encrypted = Buffer.concat([cipher.update(clean, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  const combined = Buffer.concat([iv, tag, encrypted]).toString('base64');
  const fingerprint = hashSha256(clean);
  const last4 = clean.slice(-4);

  return { ciphertext: combined, fingerprint, last4 };
}

export function decryptCpf(ciphertextBase64: string, key?: Buffer): string {
  const encKey = key ?? getEncryptionKey();
  const data = Buffer.from(ciphertextBase64, 'base64');
  if (data.length < 28) throw new Error('Dado criptografado inválido.');

  const iv = data.subarray(0, 12);
  const tag = data.subarray(12, 28);
  const encrypted = data.subarray(28);

  const decipher = createDecipheriv('aes-256-gcm', encKey, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  return decrypted;
}

export function hashPassword(password: string): string {
  if (typeof password !== 'string' || password.length < 8) {
    throw new Error('A senha deve conter no mínimo 8 caracteres.');
  }
  const salt = randomBytes(16).toString('hex');
  const derivedKey = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derivedKey}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, expectedHex] = storedHash.split(':');
  if (!salt || !expectedHex) return false;

  const candidateKey = scryptSync(password, salt, 64);
  const expectedKey = Buffer.from(expectedHex, 'hex');

  if (candidateKey.length !== expectedKey.length) return false;
  return timingSafeEqual(candidateKey, expectedKey);
}

export function redactSensitiveData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSensitiveData);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        /cpf|password|senha|token|secret|authorization|api.?key/i.test(key)
          ? '[redigido]'
          : redactSensitiveData(item),
      ]),
    );
  }
  if (typeof value === 'string') {
    return value
      .replace(/\b\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}\b/g, '[cpf redigido]')
      .replace(/\b(password|senha|token|secret|api.?key)\s*[:=]\s*\S+/gi, '$1=[redigido]');
  }
  return value;
}

export class MemoryRateLimiter {
  private attempts = new Map<string, { count: number; expiresAt: number }>();

  constructor(
    private readonly maxAttempts = 5,
    private readonly windowMs = 15 * 60 * 1000,
    private readonly maxEntries = 10_000,
  ) {}

  check(key: string): { allowed: boolean; remainingAttempts: number; retryAfterSec?: number } {
    this.cleanup();
    const now = Date.now();
    const entry = this.attempts.get(key);

    if (!entry || entry.expiresAt <= now) {
      return { allowed: true, remainingAttempts: this.maxAttempts };
    }

    if (entry.count >= this.maxAttempts) {
      const retryAfterSec = Math.max(1, Math.ceil((entry.expiresAt - now) / 1000));
      return { allowed: false, remainingAttempts: 0, retryAfterSec };
    }

    return { allowed: true, remainingAttempts: this.maxAttempts - entry.count };
  }

  recordFailure(key: string): void {
    this.cleanup();
    const now = Date.now();
    const entry = this.attempts.get(key);

    if (!entry || entry.expiresAt <= now) {
      this.attempts.set(key, { count: 1, expiresAt: now + this.windowMs });
    } else {
      entry.count += 1;
      entry.expiresAt = now + this.windowMs;
    }
  }

  reset(key: string): void {
    this.attempts.delete(key);
  }

  private cleanup(): void {
    const now = Date.now();
    if (this.attempts.size >= this.maxEntries) {
      for (const [k, v] of this.attempts.entries()) {
        if (v.expiresAt <= now) this.attempts.delete(k);
      }
      // If still too large, drop oldest
      if (this.attempts.size >= this.maxEntries) {
        const firstKey = this.attempts.keys().next().value;
        if (firstKey) this.attempts.delete(firstKey);
      }
    }
  }
}
