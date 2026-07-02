/**
 * Show at most one call-signaling decrypt toast per peer per minute (ICE spam guard).
 */
import { recordDiagnostic } from './diagnosticLog';

const recent = new Map();

export function toastCallSignalingDecryptFailedOnce(peerUserId, toast, t) {
  const key = peerUserId || '_unknown';
  if (recent.has(key)) return;
  recent.set(key, Date.now());
  recordDiagnostic({
    category: 'call',
    source: 'callSignalingDecryptFailed',
    message: 'call_signaling_decrypt_failed',
    detail: { peer_user_id: peerUserId },
  });
  toast.error(t('callSignalingDecryptFailed'));
  setTimeout(() => {
    if (recent.get(key) && Date.now() - recent.get(key) >= 55_000) {
      recent.delete(key);
    }
  }, 60_000);
}

/** @internal test-only */
export function __resetCallSignalingToastGuardForTests() {
  recent.clear();
}