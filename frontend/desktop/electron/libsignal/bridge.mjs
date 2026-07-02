/**
 * libsignal bridge — API parity with Android SscLibsignalPlugin.
 */
import {
  CiphertextMessageType,
  groupDecrypt,
  groupEncrypt,
  PreKeyBundle,
  PreKeySignalMessage,
  processPreKeyBundle,
  processSenderKeyDistributionMessage,
  ProtocolAddress,
  PublicKey,
  SenderKeyDistributionMessage,
  signalDecrypt,
  signalDecryptPreKey,
  signalEncrypt,
  SignalMessage,
  KEMPublicKey,
} from '@signalapp/libsignal-client';
import { SscDesktopSignalStore, LIBSIGNAL_PINNED_VERSION } from './store.mjs';

const b64 = (buf) => Buffer.from(buf).toString('base64');
const dec = (str) => new Uint8Array(Buffer.from(str, 'base64'));

let store = null;

export function initLibsignalBridge(userDataPath) {
  store = SscDesktopSignalStore.forUserData(userDataPath);
  return { version: LIBSIGNAL_PINNED_VERSION };
}

function requireStore() {
  if (!store) throw new Error('libsignal bridge not initialized');
  return store;
}

function buildPreKeyBundle(bundle) {
  const identityKey = PublicKey.deserialize(dec(bundle.identity_key_public));
  const signedPreKey = PublicKey.deserialize(dec(bundle.signed_prekey_public));
  const signedSig = dec(bundle.signed_prekey_signature);
  const kyberKey = KEMPublicKey.deserialize(dec(bundle.kyber_prekey_public));
  const kyberSig = dec(bundle.kyber_prekey_signature);

  let preKeyId = null;
  let preKey = null;
  const oneTime = bundle.one_time_prekeys || [];
  if (oneTime.length > 0) {
    preKeyId = oneTime[0].prekey_id;
    preKey = PublicKey.deserialize(dec(oneTime[0].public));
  }

  return PreKeyBundle.new(
    bundle.registration_id,
    bundle.device_id || 1,
    preKeyId,
    preKey,
    bundle.signed_prekey_id,
    signedPreKey,
    signedSig,
    identityKey,
    bundle.kyber_prekey_id,
    kyberKey,
    kyberSig,
  );
}

export const libsignalHandlers = {
  async getPinnedVersion() {
    return { version: LIBSIGNAL_PINNED_VERSION, source: '@signalapp/libsignal-client' };
  },

  async getLocalDeviceId() {
    const s = requireStore();
    return { device_id: s.getLocalDeviceId() };
  },

  async setLocalDeviceId({ device_id: deviceId }) {
    const s = requireStore();
    return { device_id: s.setLocalDeviceId(deviceId) };
  },

  async generatePreKeyBundle() {
    const s = requireStore();
    return s.buildPreKeyBundleJson();
  },

  async hasSession({ peer_user_id: peerUserId, peer_device_id: peerDeviceId = 1 }) {
    const s = requireStore();
    await s.ensureLocalKeys();
    const addr = ProtocolAddress.new(peerUserId, peerDeviceId || 1);
    const session = await s.getSession(addr);
    return { has_session: !!session };
  },

  async establishSession({
    peer_user_id: peerUserId,
    our_user_id: ourUserId,
    peer_device_id: peerDeviceId = 1,
    bundle,
    force = false,
  }) {
    const s = requireStore();
    await s.ensureLocalKeys();
    const peerDev = bundle?.device_id || peerDeviceId || 1;
    const remote = ProtocolAddress.new(peerUserId, peerDev);
    const local = ProtocolAddress.new(ourUserId, s.getLocalDeviceId());
    if (force) {
      s.resetPeerSignalState(peerUserId, peerDev);
    }
    const hadSession = !force && !!(await s.getSession(remote));
    if (!hadSession) {
      const runProcess = async () => {
        const preKeyBundle = buildPreKeyBundle(bundle);
        await processPreKeyBundle(preKeyBundle, remote, local, s, s, new Date());
      };
      try {
        await runProcess();
      } catch (err) {
        const msg = (err?.message || String(err)).toLowerCase();
        if (msg.includes('untrustedidentity') || msg.includes('untrusted identity')) {
          s.resetPeerSignalState(peerUserId, peerDev);
          const preKeyBundle = buildPreKeyBundle(bundle);
          await s.saveIdentity(remote, preKeyBundle.identityKey());
          await runProcess();
        } else {
          throw err;
        }
      }
    }
    return {
      peer_user_id: peerUserId,
      established: !hadSession,
      already_had_session: hadSession,
      has_session: !!(await s.getSession(remote)),
      identity_rotated: false,
    };
  },

  async trustPeerIdentityFromBundle({
    peer_user_id: peerUserId,
    peer_device_id: peerDeviceId = 1,
    bundle,
  }) {
    const s = requireStore();
    await s.ensureLocalKeys();
    const peerDev = bundle?.device_id || peerDeviceId || 1;
    const remote = ProtocolAddress.new(peerUserId, peerDev);
    const preKeyBundle = buildPreKeyBundle(bundle);
    await s.saveIdentity(remote, preKeyBundle.identityKey());
    return { trusted: true, peer_user_id: peerUserId, peer_device_id: peerDev };
  },

  async encryptSignalMessage({
    peer_user_id: peerUserId,
    our_user_id: ourUserId,
    peer_device_id: peerDeviceId = 1,
    plaintext,
  }) {
    const s = requireStore();
    await s.ensureLocalKeys();
    const remote = ProtocolAddress.new(peerUserId, peerDeviceId || 1);
    const local = ProtocolAddress.new(ourUserId, s.getLocalDeviceId());
    const encrypted = await signalEncrypt(
      new TextEncoder().encode(plaintext),
      remote,
      local,
      s,
      s,
      new Date(),
    );
    return {
      protocol: 'signal_v1',
      ciphertext: b64(encrypted.serialize()),
      signal_message_type: encrypted.type(),
    };
  },

  async decryptSignalMessage({
    peer_user_id: peerUserId,
    our_user_id: ourUserId,
    peer_device_id: peerDeviceId = 1,
    ciphertext,
    signal_message_type: messageType,
  }) {
    const s = requireStore();
    await s.ensureLocalKeys();
    const remote = ProtocolAddress.new(peerUserId, peerDeviceId || 1);
    const local = ProtocolAddress.new(ourUserId, s.getLocalDeviceId());
    const serialized = dec(ciphertext);
    const errMsg = (err) => (err?.message || String(err)).toLowerCase();
    const isUntrustedIdentityErr = (err) => {
      const m = errMsg(err);
      return m.includes('untrustedidentity') || m.includes('untrusted identity');
    };
    const isSessionNotFoundErr = (err) => {
      const m = errMsg(err);
      return m.includes('session') && (m.includes('not found') || m.includes('no session'));
    };
    const decryptOnce = async () => {
      if (messageType === CiphertextMessageType.PreKey) {
        const msg = PreKeySignalMessage.deserialize(serialized);
        return { plain: await signalDecryptPreKey(msg, remote, local, s, s, s, s, s), preKeyMsg: msg };
      }
      if (messageType === CiphertextMessageType.Whisper) {
        const msg = SignalMessage.deserialize(serialized);
        return { plain: await signalDecrypt(msg, remote, local, s, s), preKeyMsg: null };
      }
      throw new Error(`unsupported signal_message_type: ${messageType}`);
    };
    let result;
    try {
      result = await decryptOnce();
    } catch (err) {
      if (isUntrustedIdentityErr(err)) {
        s.resetPeerSignalState(peerUserId, peerDeviceId || 1);
        throw err;
      } else if (isSessionNotFoundErr(err)) {
        s.resetPeerSignalState(peerUserId, peerDeviceId || 1);
        result = await decryptOnce();
      } else {
        throw err;
      }
    }
    const plain = result.plain;
    return { plaintext: new TextDecoder().decode(plain) };
  },

  async createGroupSenderKeyDistribution({ our_user_id: ourUserId, distribution_id: distributionId }) {
    const s = requireStore();
    await s.ensureLocalKeys();
    const local = ProtocolAddress.new(ourUserId, 1);
    const skdm = await SenderKeyDistributionMessage.create(local, distributionId, s);
    return { skdm: b64(skdm.serialize()), distribution_id: distributionId };
  },

  async processGroupSenderKeyDistribution({ sender_user_id: senderUserId, skdm: skdmB64 }) {
    const s = requireStore();
    await s.ensureLocalKeys();
    const sender = ProtocolAddress.new(senderUserId, 1);
    const skdm = SenderKeyDistributionMessage.deserialize(dec(skdmB64));
    await processSenderKeyDistributionMessage(sender, skdm, s);
    return { processed: true };
  },

  async hasGroupSenderKey({ sender_user_id: senderUserId, distribution_id: distributionId }) {
    const s = requireStore();
    await s.ensureLocalKeys();
    const has = await s.hasSenderKey(senderUserId, distributionId);
    return { has_sender_key: has };
  },

  async encryptGroupMessage({ our_user_id: ourUserId, distribution_id: distributionId, plaintext }) {
    const s = requireStore();
    await s.ensureLocalKeys();
    const local = ProtocolAddress.new(ourUserId, 1);
    const encrypted = await groupEncrypt(
      local,
      distributionId,
      s,
      new TextEncoder().encode(plaintext),
    );
    return {
      protocol: 'signal_group_v1',
      ciphertext: b64(encrypted.serialize()),
      signal_message_type: encrypted.type(),
      distribution_id: distributionId,
    };
  },

  async decryptGroupMessage({ sender_user_id: senderUserId, ciphertext }) {
    const s = requireStore();
    await s.ensureLocalKeys();
    const sender = ProtocolAddress.new(senderUserId, 1);
    const plain = await groupDecrypt(sender, s, dec(ciphertext));
    return { plaintext: new TextDecoder().decode(plain) };
  },

  async deleteSession({ peer_user_id: peerUserId }) {
    if (!peerUserId) throw new Error('peer_user_id required');
    const s = requireStore();
    s.deleteSession(peerUserId);
    return { deleted: true };
  },

  async resetPeerSignalState({ peer_user_id: peerUserId, peer_device_id: peerDeviceId = 1 }) {
    if (!peerUserId) throw new Error('peer_user_id required');
    const s = requireStore();
    s.resetPeerSignalState(peerUserId, peerDeviceId);
    return { reset: true };
  },

  async clearAllSessions() {
    const s = requireStore();
    s.clearAllSessions();
    return { cleared: true };
  },

  async resetLocalStore() {
    const s = requireStore();
    s.wipeAll();
    return { wiped: true };
  },
};

export async function invokeLibsignal(method, args = {}) {
  const handler = libsignalHandlers[method];
  if (!handler) throw new Error(`unknown libsignal method: ${method}`);
  return handler(args);
}