/**
 * Multi-device Signal fan-out — Q.51.
 */
import { getLocalDeviceId } from './deviceStore';
import { encryptSignalText, decryptSignalText, isSignalV1Message } from './messages';
import { fetchPeerPreKeyBundles } from './x3dh';

export function resolveSignalCiphertextForDevice(msg, deviceId) {
  if (!msg || !isSignalV1Message(msg)) return null;
  const key = String(deviceId);
  const map = msg.signal_device_ciphertexts;
  if (map && map[key]) {
    return {
      ciphertext: map[key].ciphertext,
      signal_message_type: map[key].signal_message_type,
    };
  }
  return {
    ciphertext: msg.ciphertext,
    signal_message_type: msg.signal_message_type,
  };
}

export async function encryptSignalTextForPeerDevices(peerUserId, ourUserId, plaintext) {
  const { devices } = await fetchPeerPreKeyBundles(peerUserId);
  const targets = (devices || []).length ? devices : [{ device_id: 1 }];
  const signal_device_ciphertexts = {};
  let primary = null;

  for (const bundle of targets) {
    const deviceId = bundle.device_id || 1;
    const encrypted = await encryptSignalText(peerUserId, ourUserId, plaintext, deviceId);
    signal_device_ciphertexts[String(deviceId)] = {
      ciphertext: encrypted.ciphertext,
      signal_message_type: encrypted.signal_message_type,
    };
    if (!primary || deviceId === 1) {
      primary = encrypted;
    }
  }

  return {
    ...primary,
    signal_device_ciphertexts,
  };
}

export async function decryptSignalTextForLocalDevice(msg, peerUserId, ourUserId) {
  const deviceId = getLocalDeviceId();
  const slice = resolveSignalCiphertextForDevice(msg, deviceId);
  if (!slice?.ciphertext) {
    throw new Error('no ciphertext for this device');
  }
  const senderDeviceId = msg?.sender_device_id || 1;
  return decryptSignalText(
    peerUserId,
    ourUserId,
    { ...msg, ...slice },
    senderDeviceId,
  );
}