/**
 * Google Sign-In — installed clients only (Android APK + desktop). No browser-tab flow.
 */
import { api, API } from './api';
import { openOAuthUrl } from './oauthBrowser';
import { isElectronApp, isNativeApp } from './platform';
import { bootstrapSessionFromDevice, getSessionToken } from './sessionStore';
import { recordDiagnostic } from './diagnosticLog';

export async function fetchGoogleConfig() {
  try {
    const { data } = await api.get('/auth/google/config');
    return data;
  } catch {
    return { enabled: false, client_id: '' };
  }
}

/** Complete sign-in after backend returns token + user. */
export async function completeGoogleAuth(
  { token, user, needs_username },
  { loginWithToken, navigate, refreshUser },
) {
  await loginWithToken(token, user);
  const needsSetup = needs_username || !user?.username || !user?.public_key;
  if (needsSetup) {
    navigate('/setup', { replace: true });
    return;
  }
  navigate('/chat', { replace: true });
  if (refreshUser) {
    refreshUser().catch((err) => {
      recordDiagnostic({ category: 'bootstrap', source: 'google-auth/refreshUser', message: err?.message || 'refreshUser after Google auth failed', detail: err });
    });
  }
}

function oauthPlatform() {
  if (isNativeApp()) return 'native';
  if (isElectronApp()) return 'desktop';
  return null;
}

/** Resume persisted session before opening OAuth (fixes #53 cold-start). */
export async function tryResumePersistedSession(refreshUser) {
  await bootstrapSessionFromDevice();
  if (!getSessionToken() || !refreshUser) return null;
  try {
    const user = await refreshUser();
    return user?.user_id ? user : null;
  } catch {
    return null;
  }
}

/** Installed: full-page OAuth inside the app shell (no external browser). */
export async function signInWithGoogleInstalled() {
  const platform = oauthPlatform();
  if (!platform) {
    throw new Error('Google sign-in requires the installed SSC app');
  }
  await openOAuthUrl(`${API}/auth/google/start?platform=${platform}`);
  return true;
}

/** Unified entry — installed clients only. */
export async function signInWithGoogle({ loginWithToken, navigate, refreshUser, onBusy, onError }) {
  const cfg = await fetchGoogleConfig();
  if (!cfg.enabled && !cfg.client_id) {
    onError?.('Google sign-in is not configured on the server yet.');
    return null;
  }

  const platform = oauthPlatform();
  if (!platform) {
    onError?.('Install the SSC app to sign in with Google.');
    return null;
  }

  onBusy?.(true);
  try {
    const resumed = await tryResumePersistedSession(refreshUser);
    if (resumed) {
      navigate('/chat', { replace: true });
      return resumed;
    }
    await signInWithGoogleInstalled();
    return null;
  } catch (e) {
    onError?.(e?.message || 'Google sign-in failed');
    return null;
  } finally {
    onBusy?.(false);
  }
}