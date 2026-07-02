/**
 * X3DH session establishment — Engine 8.4.
 * Fetches peer prekey bundle (contacts only) and runs libsignal SessionBuilder on-device.
 */
import { api } from '../api';
import {
  establishSignalSession,
  hasSignalSession,
  isNativeLibsignalAvailable,
  resetPeerSignalState,
  trustPeerIdentityFromBundle as nativeTrustPeerIdentity,
} from './nativeLibsignal';

const sessionPromises = new Map();

export async function fetchPeerPreKeyBundle(peerUserId, deviceId = 1) {
  const { data } = await api.get(`/keys/prekey-bundle/${peerUserId}`, {
    params: { device_id: deviceId },
  });
  return data;
}

export async function fetchPeerPreKeyBundles(peerUserId) {
  const { data } = await api.get(`/keys/prekey-bundles/${peerUserId}`);
  return data;
}

export async function ensureSignalSession(peerUserId, ourUserId, peerDeviceId = 1) {
  if (!peerUserId) return { skipped: true, reason: 'no_peer' };
  if (!ourUserId) return { skipped: true, reason: 'no_local_user' };
  if (!isNativeLibsignalAvailable()) {
    return { skipped: true, reason: 'web' };
  }

  const sessionKey = `${peerUserId}:${peerDeviceId}`;
  const existing = sessionPromises.get(sessionKey);
  if (existing) return existing;
  const work = (async () => {
    const status = await hasSignalSession(peerUserId, peerDeviceId);
    if (status?.has_session) {
      return { established: false, already: true, has_session: true };
    }
    const bundle = await fetchPeerPreKeyBundle(peerUserId, peerDeviceId);
    const result = await establishSignalSession(peerUserId, bundle, ourUserId);
    // Verify the session was actually persisted to the native store.
    // If not, log a warning — the retry path in encryptSignalText will recover.
    const verify = await hasSignalSession(peerUserId, peerDeviceId);
    if (!verify?.has_session) {
      console.warn('[SSC] Signal session may not have persisted for', peerUserId, '— will retry at first encrypt');
    }
    return { ...result, has_session: !!(verify?.has_session ?? result?.has_session) };
  })();

  sessionPromises.set(sessionKey, work);
  try {
    return await work;
  } finally {
    sessionPromises.delete(sessionKey);
  }
}

/**
 * Force a fresh session establishment without checking hasSignalSession first.
 * Used to recover when the native store reports a session exists but
 * encryptSignalMessage fails with "session not found" (stale/incomplete write).
 */
export async function forceRefreshSignalSession(peerUserId, ourUserId, peerDeviceId = 1) {
  if (!peerUserId || !ourUserId) return;
  if (!isNativeLibsignalAvailable()) return;
  await resetPeerSignalState(peerUserId, peerDeviceId).catch(() => {});
  const bundle = await fetchPeerPreKeyBundle(peerUserId, peerDeviceId);
  await trustPeerIdentityFromBundle(peerUserId, bundle, peerDeviceId);
  await establishSignalSession(peerUserId, bundle, ourUserId, { force: true, peerDeviceId });
  const verify = await hasSignalSession(peerUserId, peerDeviceId);
  if (!verify?.has_session) {
    throw new Error(`signal session not ready after force refresh for ${peerUserId}:${peerDeviceId}`);
  }
}

/** Save peer long-term identity from server bundle before decrypting inbound prekey messages. */
export async function trustPeerIdentityFromBundle(peerUserId, bundle, peerDeviceId = 1) {
  if (!peerUserId || !bundle?.identity_key_public) return { trusted: false, reason: 'no_bundle' };
  if (!isNativeLibsignalAvailable()) return { trusted: false, reason: 'web' };
  return nativeTrustPeerIdentity(peerUserId, bundle, peerDeviceId);
}