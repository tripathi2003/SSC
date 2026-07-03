import React, { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { completeGoogleAuth } from '../lib/google-auth';
import { api } from '../lib/api';
import { isInstalledClient } from '../lib/platform';
import { closeOAuthBrowser } from '../lib/oauthBrowser';
import { persistSessionToken } from '../lib/sessionStore';
import { useLocale } from '../context/LocaleContext';

/** Handles installed-app OAuth return: /auth/google?oauth_code=…&needs_setup=0|1 */
export default function GoogleAuthCallback() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { loginWithToken, refreshUser } = useAuth();
  const { t } = useLocale();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;

    if (!isInstalledClient()) {
      navigate('/login', { replace: true });
      return;
    }

    const oauthCode = params.get('oauth_code');
    const needsSetup = params.get('needs_setup') === '1';

    (async () => {
      await closeOAuthBrowser();
      try {
        if (!oauthCode) {
          toast.error(t('googleSignInFailedMissingCode'));
          navigate('/login', { replace: true });
          return;
        }
        const { data } = await api.post('/auth/google/exchange', { code: oauthCode });
        const token = data?.token;
        if (!token) {
          toast.error(t('googleSignInFailedInvalidCode'));
          navigate('/login', { replace: true });
          return;
        }
        persistSessionToken(token);
        const { data: user } = await api.get('/auth/me');
        await completeGoogleAuth(
          { token, user, needs_username: needsSetup },
          { loginWithToken, navigate, refreshUser },
        );
      } catch {
        toast.error(t('googleSignInFailed'));
        navigate('/login', { replace: true });
      }
    })();
  }, [loginWithToken, navigate, params, refreshUser, t]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0A0A0A] text-[#A1A1AA] font-mono text-xs tracking-[0.25em]">
      <div className="flex items-center gap-3">
        <span className="w-1.5 h-1.5 rounded-full bg-[#00E5FF] pulse-glow" />
        {t('completingGoogleSignIn')}
      </div>
    </div>
  );
}