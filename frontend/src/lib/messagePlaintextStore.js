/**
 * Ephemeral message plaintext store — decrypt-once at ingest, UI reads only.
 * Plaintext entries honor server expires_at and are wiped on logout/panic.
 */
import { subscribeMemoryWipe } from './memoryWipe';

const MAX_ENTRIES = 3000;
/** @type {Map<string, { plaintext?: string, error?: string, expiresAt?: string|null }>} */
const entries = new Map();
const order = [];
const listeners = new Set();
/** @type {Map<string, Promise<void>>} */
const ingestInFlight = new Map();

let purgeIntervalId = null;

function touch(messageId) {
  const idx = order.indexOf(messageId);
  if (idx >= 0) order.splice(idx, 1);
  order.push(messageId);
  while (order.length > MAX_ENTRIES) {
    const evict = order.shift();
    if (evict) entries.delete(evict);
  }
}

function notify(messageId) {
  for (const fn of listeners) {
    try {
      fn(messageId);
    } catch {
      /* ignore */
    }
  }
}

export function purgeExpiredPlaintextEntries() {
  const now = Date.now();
  for (const [id, entry] of entries) {
    if (!entry?.expiresAt) continue;
    const exp = new Date(entry.expiresAt).getTime();
    if (!Number.isNaN(exp) && exp <= now) {
      entries.delete(id);
      const idx = order.indexOf(id);
      if (idx >= 0) order.splice(idx, 1);
      notify(id);
    }
  }
}

function ensurePurgeInterval() {
  if (purgeIntervalId != null) return;
  purgeIntervalId = setInterval(() => {
    purgeExpiredPlaintextEntries();
  }, 60_000);
}

export function getMessagePlaintextEntry(messageId) {
  if (!messageId) return null;
  purgeExpiredPlaintextEntries();
  return entries.get(messageId) || null;
}

export function hasSuccessfulPlaintext(messageId) {
  const entry = getMessagePlaintextEntry(messageId);
  return entry?.plaintext != null;
}

export function getReceivedPlaintext(messageId) {
  const entry = getMessagePlaintextEntry(messageId);
  return entry?.plaintext != null ? entry.plaintext : null;
}

export function cacheReceivedPlaintext(messageId, plaintext, expiresAt = null) {
  setMessagePlaintextSuccess(messageId, plaintext, expiresAt);
}

export function setMessagePlaintextSuccess(messageId, plaintext, expiresAt = null) {
  if (!messageId || plaintext == null) return;
  entries.set(messageId, {
    plaintext: String(plaintext),
    error: null,
    expiresAt: expiresAt ?? null,
  });
  touch(messageId);
  ensurePurgeInterval();
  notify(messageId);
}

export function setMessagePlaintextError(messageId, errorCode, expiresAt = null) {
  if (!messageId || !errorCode) return;
  const prev = entries.get(messageId);
  if (prev?.plaintext != null) return;
  entries.set(messageId, {
    plaintext: null,
    error: errorCode,
    expiresAt: expiresAt ?? null,
  });
  touch(messageId);
  notify(messageId);
}

export function clearMessagePlaintextEntry(messageId) {
  if (!messageId) return;
  if (!entries.delete(messageId)) return;
  const idx = order.indexOf(messageId);
  if (idx >= 0) order.splice(idx, 1);
  notify(messageId);
}

export function clearMessagePlaintextStore() {
  entries.clear();
  order.length = 0;
  ingestInFlight.clear();
  if (purgeIntervalId != null) {
    clearInterval(purgeIntervalId);
    purgeIntervalId = null;
  }
  notify(null);
}

/** @deprecated alias */
export const clearReceivedPlaintextCache = clearMessagePlaintextStore;

export function subscribeMessagePlaintext(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function trackIngestInFlight(messageId, promise) {
  ingestInFlight.set(messageId, promise);
  promise.finally(() => {
    if (ingestInFlight.get(messageId) === promise) {
      ingestInFlight.delete(messageId);
    }
  });
  return promise;
}

export function getIngestInFlight(messageId) {
  return ingestInFlight.get(messageId);
}

export function isDuplicateDecryptError(err) {
  const m = (err?.message || String(err || '')).toLowerCase();
  return m.includes('duplicatemessage')
    || m.includes('duplicate message')
    || m.includes('old counter')
    || m.includes('stale key');
}

subscribeMemoryWipe(clearMessagePlaintextStore);