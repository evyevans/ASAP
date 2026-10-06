/* ═══════════════════════════════════════════════════════════
   ASAP — Universal Login Page
   Premium Liquid Glass split-layout authentication screen.
   Cream/Titanium aesthetic matching the ASAP design system.
   ═══════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, ArrowRight, Eye, EyeOff, AlertCircle } from 'lucide-react';

import { useAuth } from '../auth/AuthContext';
import { isPasswordRecoveryUrl, clearAuthHashFromUrl } from '../auth/authCallback';
import { apiUrl } from '../config/api';
import { supabase } from '../auth/AuthContext';
import { motion } from 'framer-motion';
import { GlowingEffectDemo } from '../components/GlowingEffectDemo';
import './Login.css';

// ── Branding ──────────────────────────────────────────────────────
const SYSTEM_NAME     = 'ASAP';
const SYSTEM_SUBTITLE = 'Multi-Agent Command Center';

type Mode = 'signin' | 'signup';

export default function Login() {
  const navigate = useNavigate();
  const { signInWithPassword, signUp, signInWithGoogle, passwordRecoveryMode, updatePassword, resetPasswordForEmail } = useAuth();

  const [mode,           setMode          ] = useState<Mode>('signin');
  const [email,          setEmail         ] = useState('');
  const [password,       setPassword      ] = useState('');
  const [newPassword,    setNewPassword   ] = useState('');
  const [fullName,       setFullName      ] = useState('');
  const [showPassword,   setShowPassword  ] = useState(false);
  const [loading,        setLoading       ] = useState(false);
  const [googleLoading,  setGoogleLoading ] = useState(false);
  const [error,          setError         ] = useState<string | null>(null);
  const [success,        setSuccess       ] = useState<string | null>(null);

  useEffect(() => {
    if (isPasswordRecoveryUrl() || passwordRecoveryMode) return;
  }, [passwordRecoveryMode]);

  // ── Handlers ────────────────────────────────────────────────────
  const handleGoogle = async () => {
    try {
      setGoogleLoading(true);
      setError(null);
      await signInWithGoogle();
      // OAuth redirect — Supabase handles the rest
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to connect with Google');
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      if (passwordRecoveryMode || isPasswordRecoveryUrl()) {
        const { error: updateError } = await updatePassword(newPassword || password);
        if (updateError) {
          setError(updateError);
        } else {
          clearAuthHashFromUrl();
          setSuccess('Password updated. Signing you in…');
          const { data: sessionData } = await supabase.auth.getSession();
          const token = sessionData.session?.access_token;
          if (token) {
            await fetch(apiUrl('/api/v1/auth/provision'), {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}` },
            }).catch(() => {});
          }
          navigate('/', { replace: true });
        }
      } else if (mode === 'signup') {
        const { error: signUpError } = await signUp(email, password, fullName);
        if (signUpError) {
          setError(signUpError);
        } else {
          setSuccess('Account created! Check your email to confirm, then sign in.');
          setMode('signin');
        }
      } else {
        const { error: signInError } = await signInWithPassword(email, password);
        if (signInError) {
          setError(signInError);
        } else {
          const { data: sessionData } = await supabase.auth.getSession();
          const token = sessionData.session?.access_token;
          if (token) {
            await fetch(apiUrl('/api/v1/auth/provision'), {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}` },
            }).catch(() => {});
          }
          navigate('/', { replace: true });
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError('Enter your email above, then click Forgot password.');
      return;
    }
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const { error: resetError } = await resetPasswordForEmail(email.trim());
      if (resetError) {
        setError(resetError);
      } else {
        setSuccess('Password reset email sent. Open the link and set a new password on this page.');
      }
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => {
    setMode(mode === 'signin' ? 'signup' : 'signin');
    setError(null);
    setSuccess(null);
  };

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className="login-page">

      {/* ── Liquid Ambient Background ──────────────────────────── */}
      <div className="login-bg" aria-hidden="true">
        <motion.div
          className="login-blob login-blob--1"
          animate={{ x: [0, 50, 0], y: [0, 30, 0] }}
          transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="login-blob login-blob--2"
          animate={{ x: [0, -40, 0], y: [0, -50, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        />
        <motion.div
          className="login-blob login-blob--3"
          style={{ top: '50%', left: '50%' }}
          initial={{ x: '-50%', y: '-50%' }}
          animate={{ scale: [1, 1.1, 1], opacity: [0.2, 0.4, 0.2] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      {/* ── Split Layout ────────────────────────────────────────── */}
      <div className="login-split">

        {/* Left panel — Bento feature grid (desktop only) */}
        <motion.div
          className="login-left-panel"
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          aria-hidden="true"
        >
          <div className="login-left-panel__brand">
            <span className="login-left-panel__name">{SYSTEM_NAME}</span>
          </div>
          <p className="login-left-panel__tagline">
            Agentic intelligence that<br />thinks while you sleep.
          </p>
          <GlowingEffectDemo />
        </motion.div>

      {/* ── Right: Auth Form Column ─────────────────────────────── */}
      <div className="login-container">

        {/* Typographic branding above card */}
        <div className="login-brand">
          <h1 className="login-system-name">{SYSTEM_NAME}</h1>
          <p className="login-system-subtitle">{SYSTEM_SUBTITLE}</p>
        </div>

        {/* Glass Card */}
        <motion.div
          className="login-card"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* Top edge highlight */}
          <div className="login-card__highlight" aria-hidden="true" />

          <div className="login-card__header">
            <h2 className="login-welcome-title">
              {passwordRecoveryMode || isPasswordRecoveryUrl()
                ? 'Set a new password'
                : mode === 'signin'
                  ? 'Welcome back'
                  : 'Create an account'}
            </h2>
            <p className="login-welcome-subtitle">
              {passwordRecoveryMode || isPasswordRecoveryUrl()
                ? 'Choose a new password, then you will be signed in.'
                : mode === 'signin'
                  ? 'Enter your details to access the system.'
                  : 'Join your elite agentic workspace.'}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="login-form">

            {/* Error / Success banners */}
            {error && (
              <motion.div
                className="login-alert login-alert--error"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
              >
                <AlertCircle size={16} className="login-alert__icon" />
                {error}
              </motion.div>
            )}
            {success && (
              <motion.div
                className="login-alert login-alert--success"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
              >
                {success}
              </motion.div>
            )}

            {/* Full Name (sign-up only) */}
            {mode === 'signup' && !passwordRecoveryMode && (
              <input
                type="text"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="Full Name"
                className="login-input"
              />
            )}

            {/* Email */}
            {!passwordRecoveryMode && !isPasswordRecoveryUrl() && (
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Email address"
              required
              className="login-input"
            />
            )}

            {/* Password */}
            <div className="login-password-wrap">
              <input
                type={showPassword ? 'text' : 'password'}
                value={passwordRecoveryMode || isPasswordRecoveryUrl() ? newPassword : password}
                onChange={e => {
                  if (passwordRecoveryMode || isPasswordRecoveryUrl()) {
                    setNewPassword(e.target.value);
                  } else {
                    setPassword(e.target.value);
                  }
                }}
                placeholder={passwordRecoveryMode || isPasswordRecoveryUrl() ? 'New password' : 'Password'}
                required
                minLength={6}
                className="login-input login-input--password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="login-password-toggle"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={
                loading
                || (passwordRecoveryMode || isPasswordRecoveryUrl()
                  ? !newPassword
                  : !email || !password)
              }
              className="login-btn-submit"
            >
              {loading && <Loader2 size={16} className="login-spinner" />}
              {loading
                ? (passwordRecoveryMode || isPasswordRecoveryUrl()
                  ? 'Updating…'
                  : mode === 'signin'
                    ? 'Authenticating…'
                    : 'Creating…')
                : (passwordRecoveryMode || isPasswordRecoveryUrl()
                  ? 'Update password'
                  : mode === 'signin'
                    ? 'Sign in'
                    : 'Continue')}
              {!loading && <ArrowRight size={16} className="login-btn-arrow" />}
            </button>
          </form>

          {!passwordRecoveryMode && !isPasswordRecoveryUrl() && (
          <>
          {/* OR divider (above Google) */}
          <div className="login-divider">
            <div className="login-divider__line" />
            <span className="login-divider__label">or sign in</span>
            <div className="login-divider__line" />
          </div>

          {/* Google OAuth */}
          <button
            onClick={handleGoogle}
            disabled={googleLoading || loading}
            className="login-btn-google"
          >
            {googleLoading ? (
              <Loader2 size={18} className="login-spinner" />
            ) : (
              <svg viewBox="0 0 24 24" className="login-google-icon" aria-hidden="true">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
            )}
            Continue with Google
          </button>
          </>
          )}
        </motion.div>

        {/* Footer */}
        <footer className="login-footer">
          {!passwordRecoveryMode && !isPasswordRecoveryUrl() && mode === 'signin' && (
            <p className="login-footer__text">
              <button type="button" onClick={handleForgotPassword} className="login-footer__toggle">
                Forgot password?
              </button>
            </p>
          )}
          <p className="login-footer__text">
            {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}{' '}
            <button onClick={switchMode} className="login-footer__toggle">
              {mode === 'signin' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
          <p className="login-footer__terms">
            By continuing, you agree to {SYSTEM_NAME}&apos;s Terms of Service and Privacy.
          </p>
        </footer>

      </div>{/* end login-container */}
      </div>{/* end login-split */}
    </div>
  );
}
