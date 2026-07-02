/**
 * Client session token storage — Engine 5 + TASK B.
 * Web (5.3): HttpOnly cookie only — never localStorage.
 * Native (5.4 + B): in-memory Bearer at runtime; encrypted wrap via nativeSessionStore.js.
 */
import { isInstalledClient } from './platform';
import { migrateDeviceWrapKeyToHardware } from './deviceWrapCrypto';
import {
  clearNativeSession,
  persistNativeSession,
  restoreNativeSession,
} from './nativeSessionStore';

import { LEGACY_JWT_KEY } from './sessionConstants';

let nativeMemoryToken = null;

const BOOTSTRAP_MAX_ATTEMPTS = 6;
const BOOTSTRAP_RETRY_MS = 200;

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Cookie auth retired — SSC is installed-apps only. */
export function usesCookieAuth() {
  return false;
}

/** Purge legacy JWT from localStorage (pre-5.3 web / pre-5.4 native installs). */
export function purgeLegacyJwtFromStorage() {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(LEGACY_JWT_KEY);
}

/** @deprecated Use purgeLegacyJwtFromStorage */
export function purgeLegacyWebJwtFromStorage() {
  purgeLegacyJwtFromStorage();
}

/** Restore encrypted session from device before first API call (cold start). */
export async function bootstrapSessionFromDevice() {
  if (usesCookieAuth()) return null;
  if (nativeMemoryToken) return nativeMemoryToken;
  for (let attempt = 1; attempt <= BOOTSTRAP_MAX_ATTEMPTS; attempt += 1) {
    await migrateDeviceWrapKeyToHardware();
    const token = await restoreNativeSession();
    if (token) {
      nativeMemoryToken = token;
      return nativeMemoryToken;
    }
    if (attempt < BOOTSTRAP_MAX_ATTEMPTS) {
      await sleep(BOOTSTRAP_RETRY_MS * attempt);
    }
  }
  return null;
}

/** Set in-memory token immediately so the next API call can authenticate. */
export function setSessionTokenInMemory(token) {
  if (!token || usesCookieAuth()) return;
  nativeMemoryToken = token;
}

export async function persistSessionToken(token) {
  if (!token || usesCookieAuth()) return;
  setSessionTokenInMemory(token);
  await persistNativeSession(token);
}

export function getSessionToken() {
  if (usesCookieAuth()) return null;
  return nativeMemoryToken;
}

export function clearSessionToken() {
  nativeMemoryToken = null;
  clearNativeSession();
  purgeLegacyJwtFromStorage();
}

export function hasNativeSessionToken() {
  return !usesCookieAuth() && !!nativeMemoryToken;
}

/** Whether Bearer header is required for API calls on this platform. */
export function usesBearerAuth() {
  return !usesCookieAuth();
}