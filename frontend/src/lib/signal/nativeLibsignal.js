import { Capacitor, registerPlugin } from '@capacitor/core';
import { isElectronApp } from '../platform';
import { LIBSIGNAL_PINNED_VERSION } from './constants';

const SscLibsignal = registerPlugin('SscLibsignal', {
  web: () => import('./nativeLibsignalWeb').then((m) => new m.SscLibsignalWeb()),
});

function getLibsignalClient() {
  if (Capacitor.isNativePlatform()) return SscLibsignal;
  if (isElectronApp() && window.sscDesktop?.libsignal) return window.sscDesktop.libsignal;
  return null;
}

export function isNativeLibsignalAvailable() {
  return !!getLibsignalClient();
}

export async function getPinnedLibsignalVersion() {
  const client = getLibsignalClient();
  if (!client) {
    return { version: LIBSIGNAL_PINNED_VERSION, source: 'installed-only' };
  }
  return client.getPinnedVersion();
}

export async function generatePreKeyBundle() {
  const client = getLibsignalClient();
  if (!client) {
    throw new Error('Signal prekeys require an installed SSC app (Android, iOS, or desktop)');
  }
  const bundle = await client.generatePreKeyBundle();
  if (bundle?.libsignal_version && bundle.libsignal_version !== LIBSIGNAL_PINNED_VERSION) {
    throw new Error(`Unexpected libsignal version: ${bundle.libsignal_version}`);
  }
  return bundle;
}

export async function getNativeLocalDeviceId() {
  const client = getLibsignalClient();
  if (!client?.getLocalDeviceId) return { device_id: 1 };
  return client.getLocalDeviceId();
}

export async function setNativeLocalDeviceId(deviceId) {
  const client = getLibsignalClient();
  if (!client?.setLocalDeviceId) return { device_id: deviceId };
  return client.setLocalDeviceId({ device_id: deviceId });
}

export async function hasSignalSession(peerUserId, peerDeviceId = 1) {
  const client = getLibsignalClient();
  if (!client) {
    return { has_session: false, skipped: true, reason: 'installed-only' };
  }
  return client.hasSession({ peer_user_id: peerUserId, peer_device_id: peerDeviceId });
}

export async function establishSignalSession(peerUserId, bundle, ourUserId, options = {}) {
  const client = getLibsignalClient();
  if (!client) {
    throw new Error('Signal sessions require an installed SSC app (Android, iOS, or desktop)');
  }
  const peerDeviceId = options.peerDeviceId ?? bundle?.device_id ?? 1;
  return client.establishSession({
    peer_user_id: peerUserId,
    our_user_id: ourUserId,
    peer_device_id: peerDeviceId,
    bundle,
    force: !!options.force,
  });
}

export async function encryptSignalMessage(peerUserId, ourUserId, plaintext, peerDeviceId = 1) {
  const client = getLibsignalClient();
  if (!client) {
    throw new Error('Signal encrypt requires an installed SSC app (Android, iOS, or desktop)');
  }
  return client.encryptSignalMessage({
    peer_user_id: peerUserId,
    our_user_id: ourUserId,
    peer_device_id: peerDeviceId,
    plaintext,
  });
}

export async function decryptSignalMessage(
  peerUserId,
  ourUserId,
  ciphertext,
  signalMessageType,
  peerDeviceId = 1,
) {
  const client = getLibsignalClient();
  if (!client) {
    throw new Error('Signal decrypt requires an installed SSC app (Android, iOS, or desktop)');
  }
  return client.decryptSignalMessage({
    peer_user_id: peerUserId,
    our_user_id: ourUserId,
    peer_device_id: peerDeviceId,
    ciphertext,
    signal_message_type: signalMessageType,
  });
}

export async function createGroupSenderKeyDistribution(ourUserId, distributionId) {
  const client = getLibsignalClient();
  if (!client) {
    throw new Error('Group sender keys require an installed SSC app');
  }
  return client.createGroupSenderKeyDistribution({
    our_user_id: ourUserId,
    distribution_id: distributionId,
  });
}

export async function processGroupSenderKeyDistribution(senderUserId, skdm) {
  const client = getLibsignalClient();
  if (!client) {
    throw new Error('Group sender keys require an installed SSC app');
  }
  return client.processGroupSenderKeyDistribution({
    sender_user_id: senderUserId,
    skdm,
  });
}

export async function hasGroupSenderKey(senderUserId, distributionId) {
  const client = getLibsignalClient();
  if (!client) {
    return { has_sender_key: false, skipped: true, reason: 'installed-only' };
  }
  return client.hasGroupSenderKey({
    sender_user_id: senderUserId,
    distribution_id: distributionId,
  });
}

export async function encryptGroupMessage(ourUserId, distributionId, plaintext) {
  const client = getLibsignalClient();
  if (!client) {
    throw new Error('Group encrypt requires an installed SSC app');
  }
  return client.encryptGroupMessage({
    our_user_id: ourUserId,
    distribution_id: distributionId,
    plaintext,
  });
}

export async function decryptGroupMessage(senderUserId, ciphertext) {
  const client = getLibsignalClient();
  if (!client) {
    throw new Error('Group decrypt requires an installed SSC app');
  }
  return client.decryptGroupMessage({
    sender_user_id: senderUserId,
    ciphertext,
  });
}

/** Drop one peer session after remote identity rotation. */
export async function deleteSignalSession(peerUserId) {
  const client = getLibsignalClient();
  if (!client?.deleteSession) return { deleted: false, reason: 'unavailable' };
  return client.deleteSession({ peer_user_id: peerUserId });
}

/** Clear peer session + stale identity trust before re-establishing X3DH. */
export async function resetPeerSignalState(peerUserId, peerDeviceId = 1) {
  const client = getLibsignalClient();
  if (!client?.resetPeerSignalState) return { reset: false, reason: 'unavailable' };
  return client.resetPeerSignalState({ peer_user_id: peerUserId, peer_device_id: peerDeviceId });
}

export async function trustPeerIdentityFromBundle(peerUserId, bundle, peerDeviceId = 1) {
  const client = getLibsignalClient();
  if (!client?.trustPeerIdentityFromBundle) return { trusted: false, reason: 'unavailable' };
  return client.trustPeerIdentityFromBundle({
    peer_user_id: peerUserId,
    peer_device_id: peerDeviceId,
    bundle,
  });
}

/** Drop peer sessions only — used when server identity no longer matches this device. */
export async function clearAllSignalSessions() {
  const client = getLibsignalClient();
  if (!client?.clearAllSessions) return { cleared: false, reason: 'unavailable' };
  return client.clearAllSessions();
}

/** Panic wipe / reinstall — drop local Signal state so sessions can be rebuilt. */
export async function wipeLocalSignalStore() {
  const client = getLibsignalClient();
  if (!client?.resetLocalStore) return { wiped: false, reason: 'unavailable' };
  return client.resetLocalStore();
}