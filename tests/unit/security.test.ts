import { describe, expect, it } from 'vitest';
import {
  decryptCpf,
  encryptCpf,
  hashPassword,
  MemoryRateLimiter,
  redactSensitiveData,
  validCpf,
  verifyPassword,
} from '../../apps/api/src/common/security';

describe('Security utilities', () => {
  describe('CPF validation', () => {
    it('validates correct CPFs and rejects invalid checksums or patterns', () => {
      // Known valid CPFs for algorithm testing
      // Modulo 11 check: 52998224725 is a valid CPF
      expect(validCpf('52998224725')).toBe(true);
      expect(validCpf('529.982.247-25')).toBe(true);

      // Repeated sequence is rejected
      expect(validCpf('11111111111')).toBe(false);
      expect(validCpf('00000000000')).toBe(false);

      // Wrong length or invalid digit
      expect(validCpf('1234567890')).toBe(false);
      expect(validCpf('52998224726')).toBe(false);
    });
  });

  describe('CPF AES-256-GCM encryption & decryption', () => {
    it('encrypts CPF, returns fingerprint and last4, and decrypts correctly', () => {
      const validTestCpf = '52998224725';
      const enc = encryptCpf(validTestCpf);

      expect(enc.ciphertext).toBeTruthy();
      expect(enc.last4).toBe('4725');
      expect(enc.fingerprint).toHaveLength(64); // SHA-256 hex length

      const decrypted = decryptCpf(enc.ciphertext);
      expect(decrypted).toBe(validTestCpf);
    });

    it('rejects invalid CPF before encryption', () => {
      expect(() => encryptCpf('00000000000')).toThrow('CPF inválido.');
    });
  });

  describe('Password hashing & verification with scrypt', () => {
    it('hashes passwords with salt and verifies matching passwords', () => {
      const pass = 'SuperSecret123!';
      const hash = hashPassword(pass);

      expect(hash).toContain(':');
      expect(verifyPassword(pass, hash)).toBe(true);
      expect(verifyPassword('WrongPassword', hash)).toBe(false);
      expect(verifyPassword('', hash)).toBe(false);
    });

    it('rejects passwords shorter than 8 characters', () => {
      expect(() => hashPassword('short')).toThrow('mínimo 8 caracteres');
    });
  });

  describe('Sensitive data redaction', () => {
    it('redacts tokens, passwords, CPFs, and secrets recursively', () => {
      const payload = {
        name: 'Cliente Teste',
        email: 'cliente@teste.com',
        password: 'secretPassword123',
        userCpf: '529.982.247-25',
        apiKey: 'key_live_123456789',
        nested: {
          token: 'jwt_abc_123',
          note: 'O CPF do cliente é 52998224725 para verificação.',
        },
      };

      const redacted = redactSensitiveData(payload) as any;
      expect(redacted.name).toBe('Cliente Teste');
      expect(redacted.email).toBe('cliente@teste.com');
      expect(redacted.password).toBe('[redigido]');
      expect(redacted.apiKey).toBe('[redigido]');
      expect(redacted.nested.token).toBe('[redigido]');
      expect(redacted.nested.note).toContain('[cpf redigido]');
    });
  });

  describe('MemoryRateLimiter', () => {
    it('locks out after max failed attempts and allows after reset', () => {
      const limiter = new MemoryRateLimiter(3, 60000);
      const email = 'test@example.com';

      expect(limiter.check(email).allowed).toBe(true);
      expect(limiter.check(email).remainingAttempts).toBe(3);

      limiter.recordFailure(email);
      expect(limiter.check(email).allowed).toBe(true);
      expect(limiter.check(email).remainingAttempts).toBe(2);

      limiter.recordFailure(email);
      limiter.recordFailure(email);

      const checkLocked = limiter.check(email);
      expect(checkLocked.allowed).toBe(false);
      expect(checkLocked.remainingAttempts).toBe(0);
      expect(checkLocked.retryAfterSec).toBeGreaterThan(0);

      limiter.reset(email);
      expect(limiter.check(email).allowed).toBe(true);
    });
  });
});
