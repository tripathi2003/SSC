/**
 * Message ingest — decrypt once when messages enter the client (Signal-style).
 * UI components must not call decrypt; they read messagePlaintextStore.
 */
import { isMessageDeleted } from './messageDelete';
import { getSentPlaintext } from './sentPlaintextCache';
import { decryptMessageBody } from './signal/migration';
import { isSignalV1Message } from './signal/messages';
import { getResolvedSenderId } from './signal/sealedSender';
import { ensureSignalSession } from './signal/x3dh';
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

/**
 * Sealed-sender messages omit sender_id on the wire (null). Never use
 * `sender_id !== myUserId ? sender_id : peer` — that yields null for inbound sealed.
 */
export function resolveIngestPeerUserId(msg, { myUserId, conversationPeerUserId } = {}) {
  const senderId = msg?.sender_id ?? null;
  if (senderId && myUserId && senderId !== myUserId) return senderId;
  if (senderId && myUserId && senderId === myUserId) {
    return conversationPeerUserId || null;
  }
  if (msg?.sealed_sender && conversationPeerUserId) return conversationPeerUserId;
  return conversationPeerUserId || null;
}

export function conversationPeerFromList(conversationId, conversations) {
  if (!conversationId || !Array.isArray(conversations)) return null;
  const conv = conversations.find((c) => c.conversation_id === conversationId);
  if (!conv || conv.is_group) return null;
  return conv.peer?.user_id || null;
}

function isRetriableIngestError(entry, peerUserId) {
  if (!entry?.error || entry.error === 'VAULT_LOCKED') return false;
  if (entry.error === 'NO_KEY' && peerUserId) return true;
  return false;
}

function isOwnSignalMessage(msg, myUserId) {
  if (!myUserId || !isSignalV1Message(msg)) return false;
  if (msg?.sender_id === myUserId) return true;
  return getResolvedSenderId(msg, myUserId) === myUserId;
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
    if (entry?.error && !isRetriableIngestError(entry, peerUserId)) return;
    if (isRetriableIngestError(entry, peerUserId)) {
      clearMessagePlaintextEntry(messageId);
    }
  }

  const inflight = getIngestInFlight(messageId);
  if (inflight) return inflight;

  if (isOwnSignalMessage(msg, myUserId)) {
    const outbound = getSentPlaintext(messageId, msg.ciphertext);
    if (outbound != null) {
      setMessagePlaintextSuccess(messageId, outbound, msg.expires_at);
      return;
    }
    if (msg?.sender_id === myUserId) return;
  }

  const work = (async () => {
    try {
      if (isSignalV1Message(msg) && peerUserId && myUserId) {
        await ensureSignalSession(peerUserId, myUserId).catch(() => {});
      }
      const plaintext = await decryptMessageBody(msg, { myUserId, peerUserId, privateKey });
      setMessagePlaintextSuccess(messageId, plaintext, msg.expires_at);
    } catch (err) {
      if (getReceivedPlaintext(messageId) != null) return;
      const code = err?.message || 'DECRYPT_FAIL';
      if (code === 'NO_KEY' && !peerUserId) return;
      setMessagePlaintextError(messageId, code, msg.expires_at);
    }
  })();

  return trackIngestInFlight(messageId, work);
}

/** Batch ingest — sequential to avoid parallel forceRefresh session races. */
export async function ingestMessagesPlaintext(messages, ctx) {
  if (!Array.isArray(messages) || messages.length === 0) return;
  for (const msg of messages) {
    await ingestMessagePlaintext(msg, ctx).catch(() => {});
  }
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
    if (myUserId && isOwnSignalMessage(msg, myUserId)) {
      const outbound = getSentPlaintext(msg.message_id, msg.ciphertext);
      if (outbound != null) bodies[msg.message_id] = outbound;
    }
  }
  return bodies;
}