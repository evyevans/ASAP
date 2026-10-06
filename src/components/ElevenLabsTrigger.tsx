import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import BiometricConsentModal from './BiometricConsentModal';
import { hasBiometricConsent, grantBiometricConsent } from '../hooks/useBiometricConsent';
import { useAuth } from '../auth/AuthContext';
import { useOrgId } from '../hooks/useOrgId';
import { DEV_AUTO_VOICE, isGuestAccess } from '../auth/devBypass';
import { apiUrl, ELEVENLABS_AGENT_ID } from '../config/api';
import './ElevenLabsTrigger.css';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'elevenlabs-convai': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & { 
        'agent-id': string;
        'dynamic-variables'?: string;
      };
    }
  }
}

export default function ElevenLabsTrigger() {
  const guestMode = isGuestAccess();
  const [consentGranted, setConsentGranted] = useState(
    () => hasBiometricConsent() || (DEV_AUTO_VOICE && guestMode),
  );
  const [showConsentModal, setShowConsentModal] = useState(false);
  const { user, session } = useAuth();
  const { orgId } = useOrgId();
  const [dynamicVars, setDynamicVars] = useState<Record<string, string> | null>(null);

  const agentId = ELEVENLABS_AGENT_ID || 'agent_1901kea4xg8bep5vt2ey7z5n43wy';

  useEffect(() => {
    if (DEV_AUTO_VOICE && guestMode && !hasBiometricConsent()) {
      grantBiometricConsent();
    }
  }, [guestMode]);

  // ElevenLabs widget script — injected only after consent
  useEffect(() => {
    if (!consentGranted) return;
    if (!document.querySelector('script[src="https://unpkg.com/@elevenlabs/convai-widget-embed"]')) {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/@elevenlabs/convai-widget-embed';
      script.async = true;
      script.type = 'text/javascript';
      document.body.appendChild(script);
    }
  }, [consentGranted]);

  // Fetch dynamic context variables for current tenant/user. Pulled into a
  // callback so we can refetch right before a call starts (the schedule is
  // time-sensitive — fetching only once on consent goes stale fast).
  const fetchContext = useCallback(() => {
    if (!consentGranted || !orgId) return;
    const headers: Record<string, string> = { 'x-tenant-id': orgId };
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
    fetch(apiUrl('/api/v1/wfusa/call-context'), { headers })
      .then(res => res.json())
      .then(data => {
        if (data && !data.detail) {
          setDynamicVars(data);
        }
      })
      .catch(console.error);
  }, [consentGranted, orgId, session?.access_token]);

  // Initial fetch on consent.
  useEffect(() => {
    fetchContext();
  }, [fetchContext]);

  // Refetch when the tab regains focus so reopening the page/widget after a
  // while always grounds the agent on the current calendar.
  useEffect(() => {
    if (!consentGranted) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchContext();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', fetchContext);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', fetchContext);
    };
  }, [consentGranted, fetchContext]);

  // Optional: track mouse position for the interactive gradient highlight
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    e.currentTarget.style.setProperty('--mouse-x', `${x}%`);
    e.currentTarget.style.setProperty('--mouse-y', `${y}%`);
  }, []);

  const handleConsent = () => { setConsentGranted(true); setShowConsentModal(false); };
  const handleDecline = () => { setShowConsentModal(false); };

  const firstName = user?.user_metadata?.full_name?.split(' ')[0]
    ?? user?.email?.split('@')[0]
    ?? (guestMode ? 'Tester' : 'there');

  return (
    <div className="fusc-page" onMouseMove={handleMouseMove}>

      {/* ═══════════════════════════════════════════════════
          BACKGROUND GRADIENT ANIMATION
          5 blobs with mix-blend-mode:hard-light + blur
          Faithful Aceternity port, ASAP gold palette
          ═══════════════════════════════════════════════════ */}
      <div className="fusc-gradient-bg" aria-hidden>
        <div className="fusc-gradient-blobs">
          <div className="fusc-blob fusc-blob--1" />
          <div className="fusc-blob fusc-blob--2" />
          <div className="fusc-blob fusc-blob--3" />
          <div className="fusc-blob fusc-blob--4" />
          <div className="fusc-blob fusc-blob--5" />
        </div>
        {/* Mouse-following interactive glow */}
        <div className="fusc-gradient-interactive" />
      </div>

      {/* ═══════════════════════════════════════════════════
          LAMP SECTION HEADER
          Left arm + Right arm + Center cone + Hairline bar
          Faithful Aceternity LampContainer port
          ═══════════════════════════════════════════════════ */}
      <motion.div
        className="fusc-lamp-container"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.1, ease: 'easeOut' }}
      >
        {/* Conic light cone pointing down */}
        <div className="fusc-lamp-cone" aria-hidden />
        {/* Left arm glow */}
        <div className="fusc-lamp-arm-left" aria-hidden />
        {/* Right arm glow */}
        <div className="fusc-lamp-arm-right" aria-hidden />
        {/* Hairline bar with center dot */}
        <div className="fusc-lamp-bar">
          <div className="fusc-lamp-dot" />
        </div>
      </motion.div>

      {/* BIPA Consent Modal */}
      <BiometricConsentModal
        isOpen={showConsentModal}
        onConsent={handleConsent}
        onDecline={handleDecline}
      />

      {/* ═══════════════════════════════════════════════════
          MAIN CONTENT — lit from above by the lamp
          ═══════════════════════════════════════════════════ */}
      <div className="fusc-scroll">

        <motion.h1
          className="fusc-heading"
          initial={{ opacity: 0.5, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.8, ease: 'easeInOut' }}
        >
          Hi <span className="fusc-heading-name">{firstName}</span>
        </motion.h1>

        <motion.p
          className="fusc-subheading"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.7, ease: 'easeInOut' }}
        >
          Your <span className="fusc-subheading-accent">F.U.S.C</span> (Follow Up Success Coach) is standing by.
          <br />
          <span className="fusc-subheading-dim">
            The neural environment has loaded your historical context, strategic blueprints, and weekly operational data.
          </span>
        </motion.p>

        {/* Vertical fade line */}
        <motion.div
          className="fusc-divider"
          initial={{ scaleY: 0, opacity: 0 }}
          animate={{ scaleY: 1, opacity: 1 }}
          transition={{ delay: 0.7, duration: 0.6 }}
        />

        {/* Status indicator */}
        <motion.div
          className="fusc-status-row"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.85 }}
        >
          <div className={`fusc-status-dot ${consentGranted ? '' : 'fusc-status-dot--inactive'}`} />
          <span className="fusc-status-label">
            {consentGranted
              ? 'Click the widget in the corner to commence'
              : 'Voice consent required before activating'}
          </span>
        </motion.div>

      </div>

      {/* ── Voice Widget — fixed bottom-right ── */}
      {/* Refetch context on pointer-down so the agent gets the freshest
          schedule the instant the user opens the widget to start a call. */}
      <div className="fusc-widget-anchor" onPointerDownCapture={fetchContext}>
        {consentGranted ? (
          <elevenlabs-convai
            agent-id={agentId}
            dynamic-variables={dynamicVars ? JSON.stringify(dynamicVars) : undefined}
          />
        ) : (
          <motion.button
            className="fusc-consent-btn"
            onClick={() => setShowConsentModal(true)}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.9, duration: 0.4 }}
            title="Enable voice coaching (requires biometric consent)"
          >
            🎙️
          </motion.button>
        )}
      </div>
    </div>
  );
}
