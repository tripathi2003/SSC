import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useAuth } from './AuthContext';
import { authenticateBiometricUnlock, isBiometricUnlockAvailable } from '../lib/appLockBiometric';
import {
  hasAppLockPin,
  verifyAppLockPin,
} from '../lib/appLockPin';
import {
  isAppLockBiometricPrefEnabled,
  isAppLockEnabled,
  isAppLockFeatureAvailable,
} from '../lib/appLockStore';
import { isInstalledClient } from '../lib/platform';
import { withTimeout } from '../lib/asyncTimeout';

const AppLockCtx = createContext(null);

export function AppLockProvider({ children }) {
  const { user, loading } = useAuth();
  const [ready, setReady] = useState(!isAppLockFeatureAvailable());
  const [locked, setLocked] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  const shouldUseLock = isInstalledClient() && !!user && isAppLockEnabled();

  const refreshAvailability = useCallback(async () => {
    if (!isAppLockFeatureAvailable()) {
      setBiometricAvailable(false);
      setReady(true);
      setLocked(false);
      return;
    }
    const bio = await withTimeout(isBiometricUnlockAvailable(), 5000, false);
    setBiometricAvailable(bio);
    if (!user || loading) {
      setReady(true);
      setLocked(false);
      return;
    }
    const enabled = isAppLockEnabled();
    const pinSet = await withTimeout(hasAppLockPin(), 5000, false);
    if (enabled && pinSet) {
      setLocked(true);
    } else {
      setLocked(false);
    }
    setReady(true);
  }, [user, loading]);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    const safety = setTimeout(() => {
      if (!cancelled) setReady(true);
    }, 8000);
    refreshAvailability()
      .catch(() => { if (!cancelled) setReady(true); })
      .finally(() => clearTimeout(safety));
    return () => {
      cancelled = true;
      clearTimeout(safety);
    };
  }, [refreshAvailability]);

  useEffect(() => {
    if (!shouldUseLock) return undefined;
    let removeListener;
    (async () => {
      try {
        const { App } = await import('@capacitor/app');
        const handle = await App.addListener('appStateChange', ({ isActive }) => {
          if (!isActive) {
            setLocked(true);
          }
        });
        removeListener = () => handle.remove();
      } catch {
        /* optional */
      }
    })();
    return () => {
      if (removeListener) removeListener();
    };
  }, [shouldUseLock]);

  useEffect(() => {
    if (!isInstalledClient() || typeof document === 'undefined') return undefined;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden' && shouldUseLock) {
        setLocked(true);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [shouldUseLock]);

  const unlock = useCallback(() => {
    setLocked(false);
  }, []);

  const lock = useCallback(() => {
    if (shouldUseLock) setLocked(true);
  }, [shouldUseLock]);

  const unlockWithPin = useCallback(async (pin) => {
    const ok = await verifyAppLockPin(pin);
    if (!ok) throw new Error('WRONG_PIN');
    unlock();
    return true;
  }, [unlock]);

  const unlockWithBiometric = useCallback(async (reason) => {
    if (!isAppLockBiometricPrefEnabled() || !biometricAvailable) {
      throw new Error('BIOMETRIC_DISABLED');
    }
    await authenticateBiometricUnlock(reason);
    unlock();
    return true;
  }, [biometricAvailable, unlock]);

  const value = useMemo(() => ({
    ready,
    locked: shouldUseLock && locked,
    biometricAvailable,
    biometricEnabled: isAppLockBiometricPrefEnabled(),
    lockEnabled: isAppLockEnabled(),
    unlock,
    lock,
    unlockWithPin,
    unlockWithBiometric,
    refreshAvailability,
  }), [
    ready,
    locked,
    shouldUseLock,
    biometricAvailable,
    unlock,
    lock,
    unlockWithPin,
    unlockWithBiometric,
    refreshAvailability,
  ]);

  return <AppLockCtx.Provider value={value}>{children}</AppLockCtx.Provider>;
}

export function useAppLock() {
  const ctx = useContext(AppLockCtx);
  if (!ctx) throw new Error('useAppLock must be used within AppLockProvider');
  return ctx;
}