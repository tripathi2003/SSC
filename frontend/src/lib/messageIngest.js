/**
 * Message ingest — decrypt once when messages enter the client (Signal-style).
 * UI components must not call decrypt; they read messagePlaintextStore.
 */
import { isMessageDeleted } from './messageDelete';
import { getSentPlaintext } from './sentPlaintextCache';
import { decryptMessageBody } from './signal/migration';
import { isSignalV1Message } from './signal/messages';
import {
  clearMessagePlaintextEntry,
  getIngestInFlight,
  getMessagePlaintextEntry,
  getReceivedPlaintext,
  hasSuccessfulPlaintext,
  setMessagePlaintextError,
  setMessagePlaintextSuccess,
  trackIngestInFlight,
} from './messagePlaintextStore';

function isOutboundSignalEcho(msg, myUserId) {
  return Boolean(myUserId && msg?.sender_id === myUserId && isSignalV1Message(msg));
}

/**
 * Decrypt a single message at most once; store result for UI + search.
 * @param {object} msg
 * @param {{ myUserId: string, peerUserId?: string|null, privateKey?: CryptoKey|null, forceRetry?: boolean }} ctx
 */
export async function ingestMessagePlaintext(msg, ctx) {
  const messageId = msg?.message_id;
  if (!messageId || isMessageDeleted(msg)) return;

  const { myUserId, peerUserId, privateKey, forceRetry = false } = ctx;

  if (forceRetry) {
    const entry = getMessagePlaintextEntry(messageId);
    if (!entry?.plaintext) clearMessagePlaintextEntry(messageId);
  } else if (hasSuccessfulPlaintext(messageId)) {
    return;
  } else {
    const entry = getMessagePlaintextEntry(messageId);
    if (entry?.error && entry.error !== 'VAULT_LOCKED') return;
  }

  const inflight = getIngestInFlight(messageId);
  if (inflight) return inflight;

  if (myUserId && msg.sender_id === myUserId) {
    const outbound = getSentPlaintext(messageId, msg.ciphertext);
    if (outbound != null) {
      setMessagePlaintextSuccess(messageId, outbound, msg.expires_at);
      return;
    }
    if (isOutboundSignalEcho(msg, myUserId)) return;
  }

  const work = (async () => {
    try {
      const plaintext = await decryptMessageBody(msg, { myUserId, peerUserId, privateKey });
      setMessagePlaintextSuccess(messageId, plaintext, msg.expires_at);
    } catch (err) {
      if (getReceivedPlaintext(messageId) != null) return;
      const code = err?.message || 'DECRYPT_FAIL';
      setMessagePlaintextError(messageId, code, msg.expires_at);
    }
  })();

  return trackIngestInFlight(messageId, work);
}

/** Batch ingest for conversation load / search prefetch. */
export async function ingestMessagesPlaintext(messages, ctx) {
  if (!Array.isArray(messages) || messages.length === 0) return;
  await Promise.all(
    messages.map((msg) => ingestMessagePlaintext(msg, ctx).catch(() => {})),
  );
}

export function retryIngestMessagePlaintext(msg, ctx) {
  return ingestMessagePlaintext(msg, { ...ctx, forceRetry: true });
}

/** Map message_id → plaintext for chat search (inbound store + outbound sent cache). */
export function buildDecryptedBodiesMap(messages, myUserId) {
  const bodies = {};
  if (!Array.isArray(messages)) return bodies;
  for (const msg of messages) {
    if (!msg?.message_id || isMessageDeleted(msg)) continue;
    const stored = getReceivedPlaintext(msg.message_id);
    if (stored != null) {
      bodies[msg.message_id] = stored;
      continue;
    }
    if (myUserId && msg.sender_id === myUserId) {
      const outbound = getSentPlaintext(msg.message_id, msg.ciphertext);
      if (outbound != null) bodies[msg.message_id] = outbound;
    }
  }
  return bodies;
}