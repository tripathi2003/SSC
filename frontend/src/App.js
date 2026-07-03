import React, { useEffect } from 'react';
import { BrowserRouter, HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppLockProvider, useAppLock } from './context/AppLockContext';
import { LocaleProvider, useLocale } from './context/LocaleContext';
import AppLockGate from './components/AppLockGate';
import { Toaster } from 'sonner';
import Login from './pages/Login';
import RecoveryPassword from './pages/RecoveryPassword';
import Register from './pages/Register';
import VerifyEmail from './pages/VerifyEmail';
import SetupUsername from './pages/SetupUsername';

import GoogleAuthCallback from './pages/GoogleAuthCallback';
import ChatHome from './pages/ChatHome';
import Landing from './pages/Landing';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import ThreatModel from './pages/ThreatModel';
import VulnerabilityDisclosure from './pages/VulnerabilityDisclosure';
import Status from './pages/Status';
import InstalledClientGate from './components/InstalledClientGate';
import DeepLinkListener from './components/DeepLinkListener';
import { getSessionToken } from './lib/sessionStore';
import { hideNativeSplash } from './lib/capacitor-init';
import { initCrashReportingFromStorage } from './lib/crashReporting';
import { isElectronApp, isInstalledClient, prefersHashRouter } from './lib/platform';
import { bootstrapSignalIdentity, userHasUnifiedIdentity } from './lib/signalIdentityBootstrap';
import './App.css';

/** Dismiss native splash after auth bootstrap + first paint. */
function NativeBootGate({ children }) {
  const { loading } = useAuth();
  useEffect(() => {
    if (loading) return undefined;
    const id = requestAnimationFrame(() => {
      hideNativeSplash();
    });
    return () => cancelAnimationFrame(id);
  }, [loading]);
  return children;
}

function Protected({ children }) {
  const { user, loading, refreshUser } = useAuth();
  const { t } = useLocale();
  const location = useLocation();
  const [identityBoot, setIdentityBoot] = React.useState(isInstalledClient() ? 'pending' : 'done');
  const [identityRetry, setIdentityRetry] = React.useState(0);
  const [sessionRecovery, setSessionRecovery] = React.useState('idle');
  const [desktopLibsignal, setDesktopLibsignal] = React.useState(
    isElectronApp() ? null : { ok: true },
  );

  React.useEffect(() => {
    if (!isElectronApp() || !window.sscDesktop?.libsignalInitStatus) {
      setDesktopLibsignal({ ok: true });
      return undefined;
    }
    let cancelled = false;
    window.sscDesktop.libsignalInitStatus().then((status) => {
      if (!cancelled) setDesktopLibsignal(status);
    }).catch(() => {
      if (!cancelled) setDesktopLibsignal({ ok: false, error: 'status_unavailable' });
    });
    return () => { cancelled = true; };
  }, []);

  React.useEffect(() => {
    if (loading || user) {
      setSessionRecovery('idle');
      return;
    }
    if (!getSessionToken()) return;
    setSessionRecovery('pending');
    refreshUser().finally(() => setSessionRecovery('done'));
  }, [loading, user, refreshUser]);

  React.useEffect(() => {
    if (identityBoot !== 'pending') return undefined;
    const timeout = setTimeout(() => {
      setIdentityBoot((state) => (state === 'pending' ? 'failed' : state));
    }, 45000);
    return () => clearTimeout(timeout);
  }, [identityBoot]);

  React.useEffect(() => {
    if (!user || !isInstalledClient() || identityBoot !== 'pending') return;
    let cancelled = false;
    bootstrapSignalIdentity(refreshUser).then(async (res) => {
      if (cancelled) return;
      if (res.ok) {
        const refreshed = await refreshUser();
        const ready = userHasUnifiedIdentity(refreshed || user);
        setIdentityBoot(ready ? 'done' : 'failed');
        return;
      }
      setIdentityBoot('failed');
    });
    return () => { cancelled = true; };
  }, [user, refreshUser, identityBoot, identityRetry]);

  const retrySignalIdentity = () => {
    setIdentityBoot('pending');
    setIdentityRetry((n) => n + 1);
  };

  if (loading || sessionRecovery === 'pending' || identityBoot === 'pending' || desktopLibsignal == null) {
    return <div className="mobile-shell flex items-center justify-center bg-[#0A0A0A] text-[#A1A1AA] font-mono text-xs safe-top safe-bottom">{t('initializing')}</div>;
  }
  if (isElectronApp() && desktopLibsignal && !desktopLibsignal.ok) {
    return (
      <div className="mobile-shell flex flex-col items-center justify-center gap-3 bg-[#0A0A0A] text-[#A1A1AA] font-mono text-xs p-6 text-center safe-top safe-bottom">
        <p>{t('encryptionErrLibsignal')}</p>
        {desktopLibsignal.error && (
          <p className="text-[10px] text-[#FF3B30] break-all max-w-md">{desktopLibsignal.error}</p>
        )}
        <p className="text-[10px]">{t('signalIdentityRetry')}</p>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (!user.username || !user.public_key) return <Navigate to="/setup" replace />;
  if (isInstalledClient() && (identityBoot === 'failed' || !userHasUnifiedIdentity(user))) {
    return (
      <div className="mobile-shell flex flex-col items-center justify-center gap-4 bg-[#0A0A0A] text-[#A1A1AA] font-mono text-xs p-6 text-center safe-top safe-bottom">
        <p>{t('signalIdentityRequired')}</p>
        <button
          type="button"
          onClick={retrySignalIdentity}
          className="px-4 py-2 rounded-md border border-[#27272A] text-[#F0F0F0] hover:bg-[#1A1A1A] transition text-sm"
        >
          {t('signalIdentityRetry')}
        </button>
      </div>
    );
  }
  return children;
}

function AuthenticatedShell({ children }) {
  const { user, loading } = useAuth();
  const { locked, ready } = useAppLock();
  const { t } = useLocale();

  if (loading || !ready) {
    return (
      <div className="mobile-shell flex items-center justify-center bg-[#0A0A0A] text-[#A1A1AA] font-mono text-xs safe-top safe-bottom">
        {t('initializing')}
      </div>
    );
  }
  if (user && locked) {
    return <AppLockGate />;
  }
  return children;
}

function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/security" element={<ThreatModel />} />
      <Route path="/vdp" element={<VulnerabilityDisclosure />} />
      <Route path="/status" element={<Status />} />
      <Route path="/login" element={<InstalledClientGate><Login /></InstalledClientGate>} />
      <Route path="/recovery" element={<InstalledClientGate><RecoveryPassword /></InstalledClientGate>} />
      <Route path="/auth/google" element={<InstalledClientGate><GoogleAuthCallback /></InstalledClientGate>} />
      <Route path="/register" element={<InstalledClientGate><Register /></InstalledClientGate>} />
      <Route path="/verify-email" element={<InstalledClientGate><VerifyEmail /></InstalledClientGate>} />
      <Route path="/setup" element={<InstalledClientGate><SetupUsername /></InstalledClientGate>} />
      <Route path="/chat" element={<InstalledClientGate><Protected><ChatHome /></Protected></InstalledClientGate>} />
      <Route path="/chat/:conversationId" element={<InstalledClientGate><Protected><ChatHome /></Protected></InstalledClientGate>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  const Router = prefersHashRouter() ? HashRouter : BrowserRouter;
  useEffect(() => {
    if (isInstalledClient()) {
      void initCrashReportingFromStorage();
    }
  }, []);
  return (
    <div className="App grain">
      <Router>
        <AuthProvider>
          <LocaleProvider>
            <AppLockProvider>
              <NativeBootGate>
                <AuthenticatedShell>
                  <DeepLinkListener />
                  <AppRouter />
                </AuthenticatedShell>
              </NativeBootGate>
            </AppLockProvider>
          </LocaleProvider>
          <Toaster
            theme="dark"
            position="top-center"
            offset={16}
            style={{ zIndex: 99999 }}
            toastOptions={{ style: { background: '#1A1A1A', border: '1px solid #27272A', color: '#F0F0F0', zIndex: 99999 } }}
          />
        </AuthProvider>
      </Router>
    </div>
  );
}
