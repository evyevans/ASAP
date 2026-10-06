import React, { useMemo } from 'react';
import { motion } from 'framer-motion';

interface Particle {
  id: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  duration: number;
  delay: number;
}

const ParticleBackground: React.FC = () => {
  const particles: Particle[] = useMemo(
    () =>
      Array.from({ length: 30 }).map((_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        dx: (Math.random() - 0.5) * 100,
        dy: (Math.random() - 0.5) * 100,
        duration: 8 + Math.random() * 6,
        delay: Math.random() * 3,
      })),
    []
  );

  const getParticleColor = (id: number) => {
    const variant = id % 3;
    if (variant === 0) return 'rgba(234, 179, 8, 0.6)';
    if (variant === 1) return 'rgba(253, 224, 71, 0.5)';
    return 'rgba(161, 98, 7, 0.5)';
  };

  const getParticleGlow = (id: number) => {
    const variant = id % 3;
    if (variant === 0) return '0 0 8px rgba(234, 179, 8, 0.5), 0 0 16px rgba(234, 179, 8, 0.2)';
    if (variant === 1) return '0 0 10px rgba(253, 224, 71, 0.6), 0 0 20px rgba(253, 224, 71, 0.2)';
    return '0 0 6px rgba(161, 98, 7, 0.4), 0 0 12px rgba(161, 98, 7, 0.2)';
  };

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 0 }}>
      {particles.map(particle => (
        <motion.div
          key={particle.id}
          className="absolute w-2 h-2 rounded-full"
          style={{
            left: `${particle.x}%`,
            top: `${particle.y}%`,
            background: getParticleColor(particle.id),
            boxShadow: getParticleGlow(particle.id),
          }}
          animate={{
            x: [0, particle.dx],
            y: [0, particle.dy],
            opacity: [0, 0.85, 0],
            scale: [0, 1, 0],
          }}
          transition={{
            duration: particle.duration,
            delay: particle.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
};

export default ParticleBackground;
