import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  getStoredUiLang,
  isLazyLocale,
  loadLocalePack,
  normalizeLang,
  seedUiLangFromDeviceIfNeeded,
  setStoredUiLang,
  t as translate,
} from '../lib/i18n';
import { isInstalledClient } from '../lib/platform';
import { recordDiagnostic } from '../lib/diagnosticLog';
import { useAuth } from './AuthContext';

const LocaleCtx = createContext(null);

export function LocaleProvider({ children }) {
  const { user } = useAuth();
  const [locale, setLocaleState] = useState(() => (
    isInstalledClient() ? seedUiLangFromDeviceIfNeeded() : getStoredUiLang()
  ));
  const [localeLoading, setLocaleLoading] = useState(() => isLazyLocale(
    isInstalledClient() ? seedUiLangFromDeviceIfNeeded() : getStoredUiLang(),
  ));

  useEffect(() => {
    if (!isLazyLocale(locale)) {
      setLocaleLoading(false);
      return undefined;
    }
    let cancelled = false;
    setLocaleLoading(true);
    loadLocalePack(locale)
      .catch((err) => {
        recordDiagnostic({ category: 'bootstrap', source: 'LocaleContext/loadLocalePack', message: err?.message || 'locale pack load failed', detail: err });
      })
      .finally(() => {
        if (!cancelled) setLocaleLoading(false);
      });
    return () => { cancelled = true; };
  }, [locale]);

  useEffect(() => {
    if (!user?.language || isInstalledClient()) return;
    const code = normalizeLang(user.language);
    setLocaleState(code);
    setStoredUiLang(code);
  }, [user?.language]);

  const setLocale = useCallback((code) => {
    const normalized = normalizeLang(code);
    setLocaleState(normalized);
    setStoredUiLang(normalized);
  }, []);

  const value = useMemo(() => ({
    locale,
    localeLoading,
    setLocale,
    t: (key, vars) => translate(key, locale, vars),
  }), [locale, localeLoading, setLocale]);

  return <LocaleCtx.Provider value={value}>{children}</LocaleCtx.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleCtx);
  if (!ctx) throw new Error('useLocale must be used within LocaleProvider');
  return ctx;
}