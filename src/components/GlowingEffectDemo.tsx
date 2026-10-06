import { Aperture, Lightning, ChartLineUp, WarningOctagon, CalendarCheck } from '@phosphor-icons/react';
import { GlowingEffect } from './ui/GlowingEffect';
import './GlowingEffectDemo.css';

interface BentoItem {
  icon: React.ReactNode;
  title: string;
  description: string;
  className: string;
}

const ITEMS: BentoItem[] = [
  {
    icon: <Aperture weight="duotone" size={24} />,
    title: 'Multi-Agent Orchestration',
    description: 'Coordinate Planning, Calendar, WFUSA, and MSP agents in real time — all from a single command center.',
    className: 'bento-item bento-item--1',
  },
  {
    icon: <Lightning weight="duotone" size={24} />,
    title: 'Live Activity Canvas',
    description: 'Pixel-art office visualization with live agent status, task streams, and event trails.',
    className: 'bento-item bento-item--2',
  },
  {
    icon: <ChartLineUp weight="duotone" size={24} />,
    title: 'Intelligent Analytics',
    description: 'Real-time throughput, task duration curves, and agent performance — no refresh required.',
    className: 'bento-item bento-item--3',
  },
  {
    icon: <WarningOctagon weight="bold" size={24} />,
    title: 'Human-in-the-Loop',
    description: 'Smart escalation with HITL checkpoints. Critical decisions surface to you instantly.',
    className: 'bento-item bento-item--4',
  },
  {
    icon: <CalendarCheck weight="duotone" size={24} />,
    title: 'Month → Week Synchronization',
    description: 'Automatically decompose your monthly plan into actionable weekly tasks, synced to your calendar.',
    className: 'bento-item bento-item--5',
  },
];

export function GlowingEffectDemo() {
  return (
    <ul className="bento-grid">
      {ITEMS.map((item) => (
        <BentoCard key={item.title} {...item} />
      ))}
    </ul>
  );
}

function BentoCard({ icon, title, description, className }: BentoItem) {
  return (
    <li className={className}>
      <div className="bento-card">
        <GlowingEffect glow disabled={false} spread={40} borderWidth={2} proximity={64} inactiveZone={0.01} />
        <div className="bento-card__inner">
          <div className="bento-card__icon-wrap">
            <span className="bento-card__icon">{icon}</span>
          </div>
          <div className="bento-card__body">
            <h3 className="bento-card__title">{title}</h3>
            <p className="bento-card__desc">{description}</p>
          </div>
        </div>
      </div>
    </li>
  );
}
