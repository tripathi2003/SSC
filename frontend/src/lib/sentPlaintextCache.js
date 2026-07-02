/**
 * Local plaintext cache for outbound Signal messages (cannot decrypt own ciphertext).
 */
import { subscribeMemoryWipe } from './memoryWipe';

const MAX_ENTRIES = 500;
const byMessageId = new Map();
const byCiphertext = new Map();
const order = [];

function touch(key) {
  const idx = order.indexOf(key);
  if (idx >= 0) order.splice(idx, 1);
  order.push(key);
  while (order.length > MAX_ENTRIES) {
    const evict = order.shift();
    if (evict) {
      byMessageId.delete(evict);
      for (const [ct, id] of byCiphertext.entries()) {
        if (id === evict) byCiphertext.delete(ct);
      }
    }
  }
}

export function cacheSentPlaintext(messageId, plaintext, ciphertext = null) {
  if (plaintext == null || plaintext === '') return;
  const text = String(plaintext);
  if (messageId) {
    byMessageId.set(messageId, text);
    touch(messageId);
  }
  if (ciphertext) {
    byCiphertext.set(ciphertext, text);
  }
}

export function getSentPlaintext(messageId, ciphertext = null) {
  if (messageId && byMessageId.has(messageId)) {
    return byMessageId.get(messageId);
  }
  if (ciphertext && byCiphertext.has(ciphertext)) {
    return byCiphertext.get(ciphertext);
  }
  return null;
}

export function clearSentPlaintextCache() {
  byMessageId.clear();
  byCiphertext.clear();
  order.length = 0;
}

subscribeMemoryWipe(clearSentPlaintextCache);