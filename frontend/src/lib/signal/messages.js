/**
 * Double Ratchet messaging — Engine 8.5 (signal_v1).
 */
import { ProtocolVersion } from './constants';
import {
  decryptSignalMessage as nativeDecrypt,
  encryptSignalMessage as nativeEncrypt,
  hasSignalSession,
  isNativeLibsignalAvailable,
} from './nativeLibsignal';
import { getResolvedSenderId } from './sealedSender';
import { ensureSignalSession, forceRefreshSignalSession } from './x3dh';

/** Match the native-plugin "session not found" error family across Android and Electron. */
function isSessionNotFoundError(err) {
  const m = (err?.message || String(err || '')).toLowerCase();
  return m.includes('session') && (
    m.includes('not found')
    || m.includes('no session')
    || m.includes('session record')
    || m.includes('message_encrypt')
    || m.includes('message_decrypt')
    || m.includes('encrypt_message')
    || m.includes('decrypt_message')
  );
}

export function isSignalV1Message(msg) {
  return (msg?.protocol || ProtocolVersion.LEGACY_RSA) === ProtocolVersion.SIGNAL_V1;
}

export async function canUseSignalMessaging(peerUserId, ourUserId, peerHasPrekeys, peerDeviceId = 1) {
  if (!peerUserId || !ourUserId || !peerHasPrekeys) return false;
  if (!isNativeLibsignalAvailable()) return false;
  try {
    await ensureSignalSession(peerUserId, ourUserId, peerDeviceId);
    const status = await hasSignalSession(peerUserId, peerDeviceId);
    return !!status?.has_session;
  } catch {
    return false;
  }
}

export async function encryptSignalText(peerUserId, ourUserId, plaintext, peerDeviceId = 1) {
  await ensureSignalSession(peerUserId, ourUserId, peerDeviceId);
  const MAX_SESSION_HEAL_ATTEMPTS = 2;
  let lastErr = null;
  for (let attempt = 0; attempt <= MAX_SESSION_HEAL_ATTEMPTS; attempt += 1) {
    try {
      return await nativeEncrypt(peerUserId, ourUserId, plaintext ?? '', peerDeviceId);
    } catch (err) {
      if (!isSessionNotFoundError(err)) throw err;
      lastErr = err;
      if (attempt >= MAX_SESSION_HEAL_ATTEMPTS) break;
      console.warn(
        '[SSC] encryptSignalText: session not found at encrypt time — forcing re-establish for',
        peerUserId,
        peerDeviceId,
        err?.message || err,
      );
      await forceRefreshSignalSession(peerUserId, ourUserId, peerDeviceId);
    }
  }
  throw lastErr || new Error('signal encrypt failed after session heal');
}

export async function decryptSignalText(peerUserId, ourUserId, msg, peerDeviceId = 1) {
  if (!isSignalV1Message(msg)) {
    throw new Error('not a signal_v1 message');
  }
  const runDecrypt = async () => {
    const result = await nativeDecrypt(
      peerUserId,
      ourUserId,
      msg.ciphertext,
      msg.signal_message_type,
      peerDeviceId,
    );
    return result?.plaintext ?? '';
  };
  try {
    return await runDecrypt();
  } catch (err) {
    if (!isSessionNotFoundError(err)) throw err;
    console.warn('[SSC] decryptSignalText: re-establishing session for', peerUserId, err?.message || err);
    await forceRefreshSignalSession(peerUserId, ourUserId, peerDeviceId);
    return await runDecrypt();
  }
}

/** Remote user id for session lookup: sender when receiving, peer when viewing own sends. */
export function signalRemoteUserId(msg, { myUserId, peerUserId }) {
  if (!msg || !myUserId) return null;
  const senderId = getResolvedSenderId(msg, myUserId);
  if (senderId === myUserId) return peerUserId;
  return senderId;
}