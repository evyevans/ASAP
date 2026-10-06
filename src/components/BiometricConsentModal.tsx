/**
 * BiometricConsentModal — BIPA-Compliant Voice Data Consent Gate
 * 
 * Renders a modal that MUST be accepted before the ElevenLabs voice widget loads.
 * Complies with Illinois BIPA written consent requirements.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { grantBiometricConsent } from '../hooks/useBiometricConsent';

interface BiometricConsentModalProps {
  isOpen: boolean;
  onConsent: () => void;
  onDecline: () => void;
}

export default function BiometricConsentModal({ isOpen, onConsent, onDecline }: BiometricConsentModalProps) {
  const [accepted, setAccepted] = useState(false);

  const handleConsent = () => {
    grantBiometricConsent();
    onConsent();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="bipa-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
            style={{
              background: 'linear-gradient(145deg, #1a1918 0%, #0f0e0d 100%)',
              borderRadius: '20px',
              border: '1px solid rgba(161, 98, 7, 0.2)',
              padding: '2.5rem',
              maxWidth: '560px',
              width: '90vw',
              maxHeight: '85vh',
              overflowY: 'auto',
              boxShadow: '0 32px 64px rgba(0,0,0,0.5), 0 0 80px rgba(161, 98, 7, 0.08)',
              color: '#e8e4df',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div style={{
                width: '40px', height: '40px', borderRadius: '12px',
                background: 'linear-gradient(135deg, rgba(161, 98, 7, 0.2), rgba(234, 179, 8, 0.1))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.2rem',
              }}>🎙️</div>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: '#f5f0eb', letterSpacing: '-0.01em' }}>
                  Voice Data Disclosure & Consent
                </h2>
                <p style={{ margin: 0, fontSize: '0.72rem', color: '#8C867C', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>
                  Biometric Information Privacy
                </p>
              </div>
            </div>

            <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgba(161, 98, 7, 0.3), transparent)', margin: '0.5rem 0 1.25rem' }} />

            {/* Body */}
            <div style={{ fontSize: '0.88rem', lineHeight: 1.7, color: '#b5afa8' }}>
              <p style={{ marginTop: 0 }}>
                ASAP uses <strong style={{ color: '#e8e4df' }}>AI-powered voice coaching</strong> via ElevenLabs to deliver 
                real-time, personalized coaching sessions. By using this feature, the following data is collected:
              </p>

              <ul style={{ paddingLeft: '1.25rem', margin: '0.75rem 0' }}>
                <li><strong style={{ color: '#d4cdc5' }}>Voice recordings</strong> from your coaching sessions</li>
                <li><strong style={{ color: '#d4cdc5' }}>Transcripts</strong> produced from those recordings</li>
                <li><strong style={{ color: '#d4cdc5' }}>Voice characteristics</strong> that may constitute biometric identifiers under applicable law</li>
              </ul>

              <div style={{
                background: 'rgba(161, 98, 7, 0.08)',
                borderLeft: '3px solid rgba(161, 98, 7, 0.4)',
                borderRadius: '0 8px 8px 0',
                padding: '0.75rem 1rem',
                margin: '1rem 0',
                fontSize: '0.82rem',
              }}>
                <strong style={{ color: '#eab308' }}>Purpose:</strong> Personalized coaching, automated weekly planning, and your accountability record.
                <br />
                <strong style={{ color: '#eab308' }}>Retention:</strong> Raw recordings are retained for 90 days, then deleted. Transcripts are retained for 12 months.
                <br />
                <strong style={{ color: '#eab308' }}>Sharing:</strong> Limited to ElevenLabs (voice processing) and secure cloud storage under written data protection agreements. 
                Your voice data is <strong style={{ color: '#e8e4df' }}>never sold</strong> or used for advertising.
              </div>

              <p style={{ marginBottom: '0.5rem' }}>
                You may <strong style={{ color: '#e8e4df' }}>withdraw consent at any time</strong> through Settings → AI & Automation, which will 
                stop future voice collection and trigger deletion of your voice data in accordance with our retention schedule.
              </p>
            </div>

            {/* Checkbox */}
            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.75rem',
                margin: '1.25rem 0',
                cursor: 'pointer',
                padding: '0.75rem',
                borderRadius: '12px',
                border: accepted ? '1px solid rgba(161, 98, 7, 0.4)' : '1px solid rgba(255,255,255,0.08)',
                background: accepted ? 'rgba(161, 98, 7, 0.06)' : 'rgba(255,255,255,0.02)',
                transition: 'all 0.2s ease',
              }}
            >
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                style={{
                  width: '18px', height: '18px', marginTop: '2px',
                  accentColor: '#A16207', cursor: 'pointer',
                }}
              />
              <span style={{ fontSize: '0.82rem', lineHeight: 1.6, color: '#d4cdc5' }}>
                I have read and understood this Voice Data Disclosure & Consent. I voluntarily consent to ASAP collecting, 
                using, storing, and disclosing my voice recordings and related biometric information as described above.
              </span>
            </label>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
              <button
                onClick={onDecline}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  borderRadius: '12px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'transparent',
                  color: '#8C867C',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                onMouseOver={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; e.currentTarget.style.color = '#b5afa8'; }}
                onMouseOut={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#8C867C'; }}
              >
                Decline
              </button>
              <button
                onClick={handleConsent}
                disabled={!accepted}
                style={{
                  flex: 2,
                  padding: '0.75rem',
                  borderRadius: '12px',
                  border: 'none',
                  background: accepted
                    ? 'linear-gradient(135deg, #A16207, #ca8a04)'
                    : 'rgba(161, 98, 7, 0.15)',
                  color: accepted ? '#0f0e0d' : '#5c5449',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  cursor: accepted ? 'pointer' : 'not-allowed',
                  transition: 'all 0.3s ease',
                  boxShadow: accepted ? '0 4px 20px rgba(161, 98, 7, 0.3)' : 'none',
                }}
              >
                I Consent — Enable Voice Coaching
              </button>
            </div>

            {/* Footer */}
            <p style={{ textAlign: 'center', fontSize: '0.7rem', color: '#5c5449', marginTop: '1rem', marginBottom: 0 }}>
              This consent is in compliance with the Illinois Biometric Information Privacy Act (740 ILCS 14), 
              GDPR Art. 9, and equivalent global biometric data protection laws.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
