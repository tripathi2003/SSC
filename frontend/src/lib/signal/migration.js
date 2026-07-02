/**
 * Signal migration — Engine 8.6 dual-read + honest encryption labels.
 */
import { decryptMessage } from '../crypto';
import { ProtocolVersion } from './constants';
import {
  isSignalAttachmentEnvelope,
  parseSignalAttachmentEnvelope,
} from './attachments';
import {
  canUseSignalGroupMessaging,
  decryptGroupText,
  isSignalGroupV1Message,
} from './groupMessages';
import {
  canUseSignalMessaging,
  decryptSignalText,
  isSignalV1Message,
  signalRemoteUserId,
} from './messages';
import {
  cacheResolvedSender,
  parseSealedPlaintext,
} from './sealedSender';
import { isNativeLibsignalAvailable } from './nativeLibsignal';
import { usesSignalOnlyMessaging } from './installedOnly';
import {
  cacheReceivedPlaintext,
  getReceivedPlaintext,
  isDuplicateDecryptError,
} from '../receivedPlaintextCache';

export function getMessageProtocol(msg) {
  return msg?.protocol || ProtocolVersion.LEGACY_RSA;
}

export function isLegacyRsaMessage(msg) {
  return getMessageProtocol(msg) === ProtocolVersion.LEGACY_RSA;
}

/** Unified dual-read decrypt — legacy_rsa (vault) or signal_v1 (native store). */
export async function decryptMessageBody(msg, { myUserId, peerUserId, privateKey }) {
  if (msg?.message_id) {
    const cached = getReceivedPlaintext(msg.message_id);
    if (cached != null) return cached;
  }
  if (!msg?.ciphertext) {
    throw new Error('NO_CIPHERTEXT');
  }
  const remember = (plaintext) => {
    if (msg?.message_id && plaintext != null) {
      cacheReceivedPlaintext(msg.message_id, plaintext);
    }
    return plaintext;
  };
  try {
    if (isSignalGroupV1Message(msg)) {
      const senderId = msg.sender_id;
      if (!senderId || !myUserId) throw new Error('NO_KEY');
      const plaintext = await decryptGroupText(senderId, msg);
      if (isSignalAttachmentEnvelope(plaintext)) {
        const meta = parseSignalAttachmentEnvelope(plaintext);
        return remember(meta?.caption ?? '');
      }
      return remember(plaintext);
    }
    if (isSignalV1Message(msg)) {
      let remoteId = signalRemoteUserId(msg, { myUserId, peerUserId });
      if (!remoteId && msg?.sealed_sender) {
        remoteId = peerUserId;
      }
      if (!remoteId || !myUserId) throw new Error('NO_KEY');
      const { decryptSignalTextForLocalDevice } = await import('./multiDeviceMessaging');
      let plaintext = await decryptSignalTextForLocalDevice(msg, remoteId, myUserId);
      const sealed = parseSealedPlaintext(plaintext);
      if (sealed) {
        cacheResolvedSender(msg.message_id, sealed.sender_user_id);
        const inner = sealed.body || {};
        if (typeof inner.text === 'string') {
          plaintext = inner.text;
        } else if (typeof inner.attachment_envelope === 'string') {
          plaintext = inner.attachment_envelope;
        }
      }
      if (isSignalAttachmentEnvelope(plaintext)) {
        const meta = parseSignalAttachmentEnvelope(plaintext);
        return remember(meta?.caption ?? '');
      }
      return remember(plaintext);
    }
    if (!privateKey) throw new Error('VAULT_LOCKED');
    const myKey = msg.encrypted_keys?.[myUserId];
    if (!myKey || !msg.iv) throw new Error('NO_KEY');
    return remember(await decryptMessage(privateKey, msg.ciphertext, msg.iv, myKey));
  } catch (err) {
    if (msg?.message_id && isDuplicateDecryptError(err)) {
      const cached = getReceivedPlaintext(msg.message_id);
      if (cached != null) return cached;
    }
    throw err;
  }
}

export async function resolveOutgoingEncryptionHint({ isGroup, peer, user, members }) {
  const signalOnly = usesSignalOnlyMessaging();

  if (isGroup) {
    if (!isNativeLibsignalAvailable()) {
      return signalOnly
        ? { mode: ProtocolVersion.SIGNAL_GROUP_V1, reason: 'signal_not_ready' }
        : { mode: ProtocolVersion.LEGACY_RSA, reason: 'web_client' };
    }
    if (!user?.signal_prekeys_ready) {
      return signalOnly
        ? { mode: ProtocolVersion.SIGNAL_GROUP_V1, reason: 'signal_not_ready' }
        : { mode: ProtocolVersion.LEGACY_RSA, reason: 'self_no_prekeys' };
    }
    const ready = await canUseSignalGroupMessaging(members, user?.user_id, user);
    if (ready) {
      return { mode: ProtocolVersion.SIGNAL_GROUP_V1, reason: null };
    }
    return signalOnly
      ? { mode: ProtocolVersion.SIGNAL_GROUP_V1, reason: 'signal_not_ready' }
      : { mode: ProtocolVersion.LEGACY_RSA, reason: 'group_chat' };
  }
  if (!peer?.user_id || !user?.user_id) {
    return signalOnly
      ? { mode: ProtocolVersion.SIGNAL_V1, reason: 'signal_not_ready' }
      : { mode: ProtocolVersion.LEGACY_RSA, reason: 'no_peer' };
  }
  if (!isNativeLibsignalAvailable()) {
    return signalOnly
      ? { mode: ProtocolVersion.SIGNAL_V1, reason: 'signal_not_ready' }
      : { mode: ProtocolVersion.LEGACY_RSA, reason: 'web_client' };
  }
  if (!user.signal_prekeys_ready) {
    return signalOnly
      ? { mode: ProtocolVersion.SIGNAL_V1, reason: 'signal_not_ready' }
      : { mode: ProtocolVersion.LEGACY_RSA, reason: 'self_no_prekeys' };
  }
  if (!peer.signal_prekeys_ready) {
    return signalOnly
      ? { mode: ProtocolVersion.SIGNAL_V1, reason: 'signal_not_ready' }
      : { mode: ProtocolVersion.LEGACY_RSA, reason: 'peer_no_prekeys' };
  }
  const ready = await canUseSignalMessaging(peer.user_id, user.user_id, true);
  if (ready) {
    return { mode: ProtocolVersion.SIGNAL_V1, reason: null };
  }
  return signalOnly
    ? { mode: ProtocolVersion.SIGNAL_V1, reason: 'signal_not_ready' }
    : { mode: ProtocolVersion.LEGACY_RSA, reason: 'no_signal_session' };
}

export async function shouldSendWithSignal({ isGroup, peer, user, members }) {
  if (isGroup) {
    if (!user?.user_id) return false;
    return canUseSignalGroupMessaging(members, user.user_id, user);
  }
  if (!peer?.user_id || !user?.user_id) return false;
  if (!user.signal_prekeys_ready) return false;
  const peerReady = peer.signal_prekeys_ready !== false;
  return canUseSignalMessaging(peer.user_id, user.user_id, peerReady);
}

/** Map outgoing hint reason → i18n key for composer banner. */
export function encryptionHintI18nKey(hint) {
  if (!hint) return null;
  if (hint.mode === ProtocolVersion.SIGNAL_V1 || hint.mode === ProtocolVersion.SIGNAL_GROUP_V1) {
    return 'encryptionHintSignal';
  }
  switch (hint.reason) {
    case 'web_client': return 'encryptionHintLegacyWeb';
    case 'self_no_prekeys': return 'encryptionHintLegacySelf';
    case 'peer_no_prekeys': return 'encryptionHintLegacyPeer';
    case 'no_signal_session': return 'encryptionHintLegacySession';
    case 'group_chat': return 'encryptionHintLegacyGroup';
    case 'signal_not_ready': return 'encryptionNotReady';
    default: return 'encryptionHintLegacyFallback';
  }
}