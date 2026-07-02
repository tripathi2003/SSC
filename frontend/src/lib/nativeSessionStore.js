/**
 * Native session persistence — TASK B (Engine 5 extension).
 * JWT held in memory at runtime; encrypted device wrap at rest (never plaintext ssc_token).
 */
import { isInstalledClient } from './platform';
import { wrapDeviceSecret, unwrapDeviceSecret } from './deviceWrapCrypto';

export const NATIVE_SESSION_WRAP_KEY = 'ssc_session_wrap_enc';

export async function persistNativeSession(token) {
  if (!isInstalledClient() || !token || typeof localStorage === 'undefined') return;
  const blob = await wrapDeviceSecret(token);
  // codeql[js/clear-text-storage-of-sensitive-information]: AES-GCM ciphertext only — never plaintext JWT (TASK B)
  if (blob) localStorage.setItem(NATIVE_SESSION_WRAP_KEY, blob);
}

export function hasPersistedNativeSession() {
  if (!isInstalledClient() || typeof localStorage === 'undefined') return false;
  return !!localStorage.getItem(NATIVE_SESSION_WRAP_KEY);
}

export async function restoreNativeSession() {
  if (!isInstalledClient() || typeof localStorage === 'undefined') return null;
  const blob = localStorage.getItem(NATIVE_SESSION_WRAP_KEY);
  if (!blob) return null;
  const token = await unwrapDeviceSecret(blob);
  if (!token) {
    // Transient Keystore lag on cold start — do not wipe ciphertext; bootstrap retries.
    return null;
  }
  return token;
}

export function clearNativeSession() {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(NATIVE_SESSION_WRAP_KEY);
}