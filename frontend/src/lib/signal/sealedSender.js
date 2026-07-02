/**
 * Sealed sender — Q.52 (sender identity inside Signal ciphertext, not server metadata).
 */
import { api } from '../api';
import { isInstalledClient } from '../platform';
import { privacyFromUser } from '../privacySettings';
import { recordDiagnostic } from '../diagnosticLog';
import { ProtocolVersion } from './constants';
import { getLocalDeviceId } from './deviceStore';
import { encryptSignalTextForPeerDevices } from './multiDeviceMessaging';

export const SEALED_SENDER_VERSION = 1;

const resolvedSenderByMessageId = new Map();
const localSealedSentIds = new Set();

/** @internal test-only */
export function __resetSealedSenderStateForTests() {
  resolvedSenderByMessageId.clear();
  localSealedSentIds.clear();
}

export function sealedSenderEnabled(user) {
  if (!isInstalledClient()) return false;
  return privacyFromUser(user).sealed_sender !== false;
}

export function buildSealedInnerPayload({ senderUserId, senderDeviceId, body }) {
  return {
    v: SEALED_SENDER_VERSION,
    sender_user_id: senderUserId,
    sender_device_id: senderDeviceId,
    body,
  };
}

export function parseSealedPlaintext(plaintext) {
  if (!plaintext || typeof plaintext !== 'string') return null;
  try {
    const parsed = JSON.parse(plaintext);
    if (parsed?.v === SEALED_SENDER_VERSION && parsed.sender_user_id && parsed.body) {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

export function cacheResolvedSender(messageId, senderId) {
  if (messageId && senderId) {
    resolvedSenderByMessageId.set(messageId, senderId);
  }
}

export function markLocalSealedSend(messageId) {
  if (messageId) localSealedSentIds.add(messageId);
}

export function isLocalSealedSend(messageId) {
  return messageId ? localSealedSentIds.has(messageId) : false;
}

export function getResolvedSenderId(msg, myUserId) {
  if (!msg) return null;
  if (msg.sender_id) return msg.sender_id;
  if (msg.message_id && isLocalSealedSend(msg.message_id) && myUserId) {
    return myUserId;
  }
  if (msg.message_id) {
    return resolvedSenderByMessageId.get(msg.message_id) || null;
  }
  return null;
}

export async function mintSealedDeliveryToken(conversationId) {
  const { data } = await api.post('/messages/sealed-token', { conversation_id: conversationId });
  return data;
}

export async function encryptSealedSignalPayload(peerUserId, ourUserId, bodyFields) {
  const inner = buildSealedInnerPayload({
    senderUserId: ourUserId,
    senderDeviceId: getLocalDeviceId(),
    body: bodyFields,
  });
  const plaintext = JSON.stringify(inner);
  return encryptSignalTextForPeerDevices(peerUserId, ourUserId, plaintext);
}

export async function postSealedMessage({
  token,
  conversationId,
  enc,
  messageType = 'text',
  attachmentId,
  attachmentContentType,
  replyToMessageId,
}) {
  const { data } = await api.post(
    '/messages/sealed',
    {
      delivery_token: token,
      conversation_id: conversationId,
      protocol: ProtocolVersion.SIGNAL_V1,
      ciphertext: enc.ciphertext,
      signal_message_type: enc.signal_message_type,
      signal_device_ciphertexts: enc.signal_device_ciphertexts,
      message_type: messageType,
      attachment_id: attachmentId || undefined,
      attachment_content_type: attachmentContentType || undefined,
      reply_to_message_id: replyToMessageId || undefined,
    },
    { skipAuth: true },
  );
  if (data?.message_id) {
    markLocalSealedSend(data.message_id);
  }
  return data;
}

export async function sendSealedDirectMessage({
  conversationId,
  peerUserId,
  ourUserId,
  bodyFields,
  messageType = 'text',
  attachmentId,
  attachmentContentType,
  replyToMessageId,
}) {
  let tokenDoc;
  try {
    tokenDoc = await mintSealedDeliveryToken(conversationId);
  } catch (tokenErr) {
    recordDiagnostic({
      category: 'libsignal',
      source: 'sealedSender/mintToken',
      message: `Failed to mint sealed delivery token: ${tokenErr?.message || tokenErr}`,
      detail: { conversationId, status: tokenErr?.response?.status },
    });
    throw tokenErr;
  }
  const enc = await encryptSealedSignalPayload(peerUserId, ourUserId, bodyFields);
  return postSealedMessage({
    token: tokenDoc.token,
    conversationId,
    enc,
    messageType,
    attachmentId,
    attachmentContentType,
    replyToMessageId,
  });
}