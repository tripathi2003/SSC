/**
 * Classify inbound decrypt failures for UI + telemetry.
 * DECRYPT_STALE = history encrypted with old keys/sessions (not retriable).
 */

export function isUntrustedIdentityError(err) {
  const m = (err?.message || String(err || '')).toLowerCase();
  return m.includes('untrustedidentity') || m.includes('untrusted identity');
}

export function isStaleDecryptError(err, msg = null) {
  const m = (err?.message || String(err || '')).toLowerCase();
  if (m.includes('invalid whisper') || m.includes('decryption failed')) {
    return true;
  }
  if (m.includes('bad mac') || m.includes('invalid message') || m.includes('invalid protocol')) {
    return true;
  }
  const whisper = msg?.signal_message_type === 2;
  if (whisper && m.includes('session') && (m.includes('not found') || m.includes('no session'))) {
    return true;
  }
  return false;
}

/**
 * @returns {'VAULT_LOCKED'|'NO_KEY'|'DECRYPT_STALE'|'DECRYPT_FAIL'}
 */
export function normalizeDecryptError(err, msg = null) {
  const code = err?.message;
  if (code === 'VAULT_LOCKED') return 'VAULT_LOCKED';
  if (code === 'NO_KEY' || code === 'NO_CIPHERTEXT') return 'NO_KEY';
  if (isStaleDecryptError(err, msg)) return 'DECRYPT_STALE';
  return 'DECRYPT_FAIL';
}