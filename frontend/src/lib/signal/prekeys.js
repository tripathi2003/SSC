import { api } from '../api';
import { getLocalDeviceId } from './deviceStore';
import { registerLocalDevice } from './devices';
import { LIBSIGNAL_PINNED_VERSION } from './constants';
import { bundleHasKyberPrekeys } from './pqxdhPolicy';
import {
  clearAllSignalSessions,
  generatePreKeyBundle,
  isNativeLibsignalAvailable,
  setNativeLocalDeviceId,
} from './nativeLibsignal';
import { recordDiagnostic } from '../diagnosticLog';

let uploadPromise = null;

/** @internal test-only */
export function __resetPrekeysUploadStateForTests() {
  uploadPromise = null;
}

export async function uploadPreKeyBundle(bundle) {
  if (!bundleHasKyberPrekeys(bundle)) {
    throw new Error('kyber_prekeys_required');
  }
  const payload = {
    registration_id: bundle.registration_id,
    device_id: bundle.device_id || 1,
    identity_key_public: bundle.identity_key_public,
    signed_prekey_id: bundle.signed_prekey_id,
    signed_prekey_public: bundle.signed_prekey_public,
    signed_prekey_signature: bundle.signed_prekey_signature,
    kyber_prekey_id: bundle.kyber_prekey_id,
    kyber_prekey_public: bundle.kyber_prekey_public,
    kyber_prekey_signature: bundle.kyber_prekey_signature,
    one_time_prekeys: bundle.one_time_prekeys,
    libsignal_version: bundle.libsignal_version || LIBSIGNAL_PINNED_VERSION,
  };
  const { data } = await api.put('/keys/prekey-bundle', payload);
  return data;
}

export async function fetchMyPreKeyStatus(deviceId = getLocalDeviceId()) {
  const { data } = await api.get('/keys/prekey-bundle/me', { params: { device_id: deviceId } });
  return data;
}

function identityMismatch(serverStatus, localBundle) {
  if (!serverStatus?.ready || !serverStatus?.identity_key_public) return false;
  if (!localBundle?.identity_key_public) return true;
  return serverStatus.identity_key_public !== localBundle.identity_key_public;
}

export async function ensurePreKeysUploaded() {
  if (!isNativeLibsignalAvailable()) {
    return { skipped: true, reason: 'web' };
  }
  if (uploadPromise) return uploadPromise;

  uploadPromise = (async () => {
    try {
      const deviceId = getLocalDeviceId();
      await setNativeLocalDeviceId(deviceId).catch((err) => {
        recordDiagnostic({ category: 'libsignal', source: 'prekeys/setNativeLocalDeviceId', message: err?.message || 'setNativeLocalDeviceId failed', detail: err });
      });
      await registerLocalDevice().catch((err) => {
        recordDiagnostic({ category: 'libsignal', source: 'prekeys/registerLocalDevice', message: err?.message || 'registerLocalDevice failed', detail: err });
      });
      const status = await fetchMyPreKeyStatus(deviceId);
      const localBundle = await generatePreKeyBundle();
      if (localBundle && !localBundle.device_id) {
        localBundle.device_id = deviceId;
      }
      const mismatch = identityMismatch(status, localBundle);

      if (status?.ready && !mismatch) {
        return { uploaded: false, already: true };
      }

      if (mismatch) {
        const clearResult = await clearAllSignalSessions();
        if (clearResult?.cleared !== true) {
          const detail = clearResult?.reason || 'clear_failed';
          console.error('[SSC] clearAllSignalSessions failed after identity mismatch:', detail);
          throw new Error(`session_clear_failed:${detail}`);
        }
        console.info('[SSC] Local Signal identity differs from server — re-uploading prekeys');
      }

      const bundle = mismatch ? await generatePreKeyBundle() : localBundle;
      const result = await uploadPreKeyBundle(bundle);
      return {
        uploaded: true,
        result,
        identity_rotated: mismatch,
      };
    } finally {
      uploadPromise = null;
    }
  })();

  return uploadPromise;
}