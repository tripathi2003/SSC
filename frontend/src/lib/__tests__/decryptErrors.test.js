import {
  isStaleDecryptError,
  isUntrustedIdentityError,
  normalizeDecryptError,
} from '../decryptErrors';

describe('decryptErrors', () => {
  it('detects untrusted identity', () => {
    const err = new Error('UntrustedIdentity - untrusted identity for address u_x.1');
    expect(isUntrustedIdentityError(err)).toBe(true);
  });

  it('classifies stale whisper decrypt failures', () => {
    const err = new Error('invalid Whisper message: decryption failed');
    const msg = { signal_message_type: 2 };
    expect(isStaleDecryptError(err, msg)).toBe(true);
    expect(normalizeDecryptError(err, msg)).toBe('DECRYPT_STALE');
  });

  it('keeps retriable decrypt as DECRYPT_FAIL', () => {
    const err = new Error('network timeout');
    expect(normalizeDecryptError(err)).toBe('DECRYPT_FAIL');
  });
});