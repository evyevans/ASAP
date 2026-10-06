import React, { useMemo } from 'react';
import { motion } from 'framer-motion';

type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking';

interface OriaCoreProps {
  state: VoiceState;
  isSpeaking?: boolean;
}

const OriaCore: React.FC<OriaCoreProps> = ({ state }) => {
  const getStateConfig = () => {
    switch (state) {
      case 'listening': return { ringRotation: 360, ringDuration: 2, coreScale: 1.15, corePulse: 1.5, strokeColor: 'rgba(234, 179, 8, 0.6)', fillColor: 'rgba(234, 179, 8, 0.15)' };
      case 'processing': return { ringRotation: -360, ringDuration: 1, coreScale: 1.1, corePulse: 1, strokeColor: 'rgba(71, 85, 105, 0.6)', fillColor: 'rgba(71, 85, 105, 0.1)' };
      case 'speaking': return { ringRotation: 180, ringDuration: 3, coreScale: 1.2, corePulse: 2, strokeColor: 'rgba(234, 179, 8, 0.8)', fillColor: 'rgba(234, 179, 8, 0.2)' };
      default: return { ringRotation: 0, ringDuration: 0, coreScale: 1, corePulse: 1, strokeColor: 'rgba(234, 179, 8, 0.4)', fillColor: 'rgba(234, 179, 8, 0.08)' };
    }
  };

  const config = getStateConfig();
  const particles = useMemo(() => Array.from({ length: state === 'processing' ? 30 : state === 'listening' ? 20 : 8 }).map((_, i) => ({ id: i, angle: (i / 20) * Math.PI * 2, distance: 80 + Math.random() * 40 })), [state]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
      <svg viewBox="0 0 300 300" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', filter: 'drop-shadow(0 4px 12px rgba(234, 179, 8, 0.1))' }}>
        <motion.g
          animate={{ rotate: config.ringRotation || 360 }}
          transition={{ duration: config.ringDuration || 28, repeat: Infinity, ease: 'linear' }}
          style={{ transformOrigin: '150px 150px' }}
        >
          <circle cx="150" cy="150" r="110" fill="none" stroke={config.strokeColor} strokeWidth="1.5" strokeDasharray="10 5" opacity={0.5} />
          {Array.from({ length: 12 }).map((_, i) => (
            <line key={i} x1="150" y1="40" x2="150" y2="48" stroke={config.strokeColor} strokeWidth="1" opacity={0.4} transform={`rotate(${(i / 12) * 360} 150 150)`} />
          ))}
        </motion.g>

        <motion.g
          animate={{ rotate: config.ringRotation ? -config.ringRotation * 0.8 : -360 }}
          transition={{ duration: config.ringDuration ? config.ringDuration * 1.2 : 36, repeat: Infinity, ease: 'linear' }}
          style={{ transformOrigin: '150px 150px' }}
        >
          <circle cx="150" cy="150" r="85" fill="none" stroke={config.strokeColor} strokeWidth="1" opacity={0.35} />
        </motion.g>

        <motion.g
          animate={{ rotate: config.ringRotation || 360 }}
          transition={{ duration: config.ringDuration ? config.ringDuration * 1.5 : 44, repeat: Infinity, ease: 'linear' }}
          style={{ transformOrigin: '150px 150px' }}
        >
          <circle cx="150" cy="150" r="60" fill="none" stroke="rgba(148, 163, 184, 0.3)" strokeWidth="0.5" strokeDasharray="4 2" opacity={0.5} />
        </motion.g>

        {Array.from({ length: 4 }).map((_, i) => (
          <g key={i} opacity={0.4}>
            <line
              x1={150 + Math.cos((i / 4) * Math.PI * 2 + Math.PI / 4) * 115}
              y1={150 + Math.sin((i / 4) * Math.PI * 2 + Math.PI / 4) * 115}
              x2={150 + Math.cos((i / 4) * Math.PI * 2 + Math.PI / 4) * 122}
              y2={150 + Math.sin((i / 4) * Math.PI * 2 + Math.PI / 4) * 122}
              stroke={config.strokeColor} strokeWidth="2" strokeLinecap="round"
            />
          </g>
        ))}
      </svg>

      {particles.map(particle => (
        <motion.div
          key={particle.id}
          style={{ position: 'absolute', width: 4, height: 4, borderRadius: '50%', left: '50%', top: '50%', marginLeft: -2, marginTop: -2, background: 'rgba(234, 179, 8, 0.5)' }}
          animate={{ x: Math.cos(particle.angle) * particle.distance, y: Math.sin(particle.angle) * particle.distance, opacity: state === 'processing' ? [0.8, 0] : [0.5, 0.2], scale: state === 'processing' ? [1, 0.5] : [1, 0.7] }}
          transition={{ duration: state === 'processing' ? 0.8 : 2.5, repeat: Infinity, ease: state === 'processing' ? 'easeIn' : 'easeInOut', delay: particle.id / 20 }}
        />
      ))}
    </div>
  );
};

export default OriaCore;
