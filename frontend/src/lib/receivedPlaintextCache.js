/**
 * Cache successfully decrypted inbound message bodies.
 * Signal ratchet state advances on first decrypt — re-decrypting the same
 * ciphertext throws DuplicateMessageException and blanks the UI.
 */
import { subscribeMemoryWipe } from './memoryWipe';

const MAX_ENTRIES = 2000;
const byMessageId = new Map();
const order = [];

function touch(messageId) {
  const idx = order.indexOf(messageId);
  if (idx >= 0) order.splice(idx, 1);
  order.push(messageId);
  while (order.length > MAX_ENTRIES) {
    const evict = order.shift();
    if (evict) byMessageId.delete(evict);
  }
}

export function cacheReceivedPlaintext(messageId, plaintext) {
  if (!messageId || plaintext == null) return;
  byMessageId.set(messageId, String(plaintext));
  touch(messageId);
}

export function getReceivedPlaintext(messageId) {
  if (!messageId) return null;
  return byMessageId.has(messageId) ? byMessageId.get(messageId) : null;
}

export function clearReceivedPlaintextCache() {
  byMessageId.clear();
  order.length = 0;
}

export function isDuplicateDecryptError(err) {
  const m = (err?.message || String(err || '')).toLowerCase();
  return m.includes('duplicatemessage')
    || m.includes('duplicate message')
    || m.includes('old counter')
    || m.includes('stale key');
}

subscribeMemoryWipe(clearReceivedPlaintextCache);