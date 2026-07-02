import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { t, getStoredUiLang } from '../lib/i18n';
import { unwrapPrivateKey } from '../lib/crypto';
import { unsubscribePush } from '../lib/push';
import { unsubscribeNativePush } from '../lib/native-push';
import { purgeLegacyPrivateKeyFromSession } from '../lib/vault';
import {
  authHeaders,
  LOGOUT_SERVER_PATH,
  PANIC_SERVER_PATH,
  runLogoutOrchestrator,
  runPanicOrchestrator,
} from '../lib/clientFootprintOrchestrator';
import { registerMemoryWipeHandler } from '../lib/memoryWipe';
import {
  bootstrapSessionFromDevice,
  clearSessionToken,
  getSessionToken,
  persistSessionToken,
  purgeLegacyJwtFromStorage,
  setSessionTokenInMemory,
} from '../lib/sessionStore';
import { purgeLegacyVerificationFlags } from '../lib/verification';
import { ensurePreKeysUploaded } from '../lib/signal/prekeys';
import { bootstrapSignalIdentity } from '../lib/signalIdentityBootstrap';
import { isInstalledClient } from '../lib/platform';
import {
  saveVaultCredential,
  loadVaultCredential,
  clearVaultCredential,
} from '../lib/vaultCredentialStore';

const AuthCtx = createContext(null);

function isGoogleOAuthReturn() {
  if (typeof window === 'undefined') return false;
  const hash = window.location.hash || '';
  return hash.includes('/auth/google') && hash.includes('oauth_code=');
}

function notifyEncryptionBootstrapFailure(result) {
  if (!isInstalledClient()) return;
  const lang = getStoredUiLang();
  let key = 'encryptionErrBootstrap';
  if (result?.reason === 'libsignal_unavailable') key = 'encryptionErrLibsignal';
  console.warn('[SSC] encryption bootstrap failed:', result?.reason || 'unknown');
  toast.error(t(key, lang));
}

async function syncPrekeysOnInstalledClient({ notify = false } = {}) {
  if (!isInstalledClient()) return { ok: true, skipped: true };
  try {
    const result = await ensurePreKeysUploaded();
    if (result?.skipped && result?.reason === 'web') {
      const failure = { ok: false, reason: 'libsignal_unavailable' };
      if (notify) notifyEncryptionBootstrapFailure(failure);
      return failure;
    }
    return { ok: true, result };
  } catch (err) {
    console.error('[SSC] prekey upload failed:', err?.message || err);
    if (notify) toast.error(t('encryptionErrBootstrap', getStoredUiLang()));
    return { ok: false, reason: err?.message || 'prekey_upload_failed' };
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [privateKey, setPrivateKey] = useState(null);
  const autoUnlockAttempted = useRef(null);
  const authGeneration = useRef(0);

  const tryAutoUnlockVault = useCallback(async (userData, { force = false } = {}) => {
    if (!userData?.encrypted_private_key || !userData?.pk_salt) return null;
    if (!force && autoUnlockAttempted.current === userData.user_id) return null;
    const password = await loadVaultCredential(userData.user_id);
    if (!password) return null;
    autoUnlockAttempted.current = userData.user_id;
    try {
      const pk = await unwrapPrivateKey(userData.encrypted_private_key, userData.pk_salt, password);
      setPrivateKey(pk);
      return pk;
    } catch {
      clearVaultCredential(userData.user_id);
      autoUnlockAttempted.current = null;
      return null;
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const generation = authGeneration.current;
    try {
      const { data } = await api.get('/auth/me');
      if (generation !== authGeneration.current) return data;
      setUser(data);
      syncPrekeysOnInstalledClient().catch((err) => {
        console.error('[SSC] background prekey sync failed:', err?.message || err);
      });
      tryAutoUnlockVault(data).catch(() => {});
      return data;
    } catch (err) {
      if (generation !== authGeneration.current) return null;
      if (err?.response?.status === 401) {
        const retried = await bootstrapSessionFromDevice();
        if (retried && generation === authGeneration.current) {
          try {
            const { data } = await api.get('/auth/me');
            if (generation !== authGeneration.current) return data;
            setUser(data);
            syncPrekeysOnInstalledClient().catch((e) => {
              console.error('[SSC] background prekey sync failed:', e?.message || e);
            });
            tryAutoUnlockVault(data).catch(() => {});
            return data;
          } catch {
            /* fall through */
          }
        }
        if (!getSessionToken()) {
          setUser(null);
          clearSessionToken();
          autoUnlockAttempted.current = null;
        }
        return null;
      }
      return null;
    }
  }, [tryAutoUnlockVault]);

  const runSilentBootstrap = useCallback(async () => {
    if (!isInstalledClient()) return { ok: true, skipped: true };
    const pre = await syncPrekeysOnInstalledClient({ notify: true });
    if (!pre?.ok) return pre;
    const boot = await bootstrapSignalIdentity(refreshUser);
    if (!boot?.ok) {
      notifyEncryptionBootstrapFailure(boot);
      return boot;
    }
    const fresh = await refreshUser();
    if (fresh && !fresh.signal_prekeys_ready) {
      toast.error(t('encryptionErrSelfPrekeys', getStoredUiLang()));
    }
    return boot;
  }, [refreshUser]);

  useEffect(() => {
    purgeLegacyPrivateKeyFromSession();
    purgeLegacyVerificationFlags();
    purgeLegacyJwtFromStorage();
    if (typeof window !== 'undefined' && window.location.hash?.includes('session_id=')) {
      setLoading(false);
      return;
    }
    if (isGoogleOAuthReturn()) {
      setLoading(false);
      return;
    }
    (async () => {
      // Must fully await device session restore — 5s timeout caused false "Not authenticated"
      // on slower Android devices when hardware secret store + AES unwrap takes longer.
      await bootstrapSessionFromDevice();
      const data = await refreshUser();
      setLoading(false);
      if (data) {
        runSilentBootstrap().catch((err) => {
          console.error('[SSC] background bootstrap failed:', err?.message || err);
        });
      }
    })();
  }, [refreshUser, runSilentBootstrap]);

  useEffect(() => {
    if (!user?.encrypted_private_key || privateKey) return;
    tryAutoUnlockVault(user, { force: true }).catch(() => {});
  }, [user, privateKey, tryAutoUnlockVault]);

  useEffect(() => {
    return registerMemoryWipeHandler(() => {
      authGeneration.current += 1;
      setUser(null);
      setPrivateKey(null);
      autoUnlockAttempted.current = null;
      clearSessionToken();
    });
  }, []);

  const loginWithToken = async (token, userObj) => {
    authGeneration.current += 1;
    if (token) {
      setSessionTokenInMemory(token);
      await persistSessionToken(token);
    }
    setUser(userObj);
    setLoading(false);
    autoUnlockAttempted.current = null;
    void tryAutoUnlockVault(userObj);
    if (isInstalledClient()) {
      void (async () => {
        const boot = await runSilentBootstrap();
        if (!boot?.ok) {
          notifyEncryptionBootstrapFailure(boot);
        }
      })();
    }
  };

  /** Hold decrypted key in React state only — never written to storage (Engine 2.2). */
  const persistPrivateKey = async (pk) => {
    setPrivateKey(pk);
    return pk;
  };

  const unlockPrivateKey = async (password) => {
    if (!user?.encrypted_private_key || !user?.pk_salt) {
      throw new Error('No encryption key on this account');
    }
    if (!crypto?.subtle) {
      throw new Error('WebCrypto unavailable on this device');
    }
    const pk = await unwrapPrivateKey(user.encrypted_private_key, user.pk_salt, password);
    if (user?.user_id) {
      await saveVaultCredential(user.user_id, password);
    }
    return persistPrivateKey(pk);
  };

  const setPK = (pk) => setPrivateKey(pk);

  const logout = async () => {
    const uid = user?.user_id;
    await runLogoutOrchestrator({
      unsubscribePush: () => unsubscribePush(),
      unsubscribeNativePush: (token) => unsubscribeNativePush(token),
      postLogout: (token) => api.post(LOGOUT_SERVER_PATH, {}, authHeaders(token)),
      userId: uid,
    });
  };

  const panicWipe = async () => {
    await runPanicOrchestrator({
      postPanicWipe: (token) => api.post(PANIC_SERVER_PATH, {}, authHeaders(token)),
    });
  };

  return (
    <AuthCtx.Provider value={{ user, setUser, privateKey, setPK, loading, refreshUser, loginWithToken, unlockPrivateKey, persistPrivateKey, logout, panicWipe }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);