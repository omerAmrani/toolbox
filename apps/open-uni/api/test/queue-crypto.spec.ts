import { encryptForQueue, decryptFromQueue } from '../src/modules/queue/queue-crypto';

describe('queue-crypto', () => {
  it('round-trips a credentials-shaped payload', () => {
    const payload = { opalUsername: 'u', opalPassword: 'p', groqApiKey: 'g' };
    const encrypted = encryptForQueue(payload);
    expect(encrypted).not.toContain('opalPassword');
    expect(decryptFromQueue(encrypted)).toEqual(payload);
  });

  it('rejects a tampered payload', () => {
    const encrypted = encryptForQueue({ a: 1 });
    const tampered = Buffer.from(encrypted, 'base64');
    tampered[tampered.length - 1] ^= 0xff;
    expect(() => decryptFromQueue(tampered.toString('base64'))).toThrow();
  });
});
