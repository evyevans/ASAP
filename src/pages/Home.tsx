import { useState } from 'react';
import { AsapDashboard } from '../analytics/AsapDashboard';
import { useLiveWorldFeed } from '../hooks/useLiveWorldFeed';
import { BootSequence } from '../boot/BootSequence';
import { BOOT_SESSION_KEY } from '../boot/bootSession';
import { CharacterPlate } from '../presence/CharacterPlate';

/* The hero is a rendered video plate, not the real-time 3D stage.
 *
 * `AsapPresence` and its whole scene remain in src/presence/ with their tests
 * passing; putting the import back here is the entire rollback. Not importing
 * it means the landing route stops downloading a 1,035 kB (300 kB gzip) chunk
 * — the largest asset in the build — so no lazy/Suspense boundary is needed
 * any more either. CharacterPlate pulls in no three.js at all. */

export default function Home() {
  // The single writer feeding WorldStore from real agent_events — drives
  // AsapPresence's live status (idle/working/thinking) and its activity beat.
  useLiveWorldFeed();
  // Lazy initializer: if the boot ceremony already played this session, start
  // "booted" so the overlay never mounts at all on tab-return (Profile → Home)
  // instead of mounting and immediately taking BootSequence's skip path, which
  // still painted an opaque bg-bg-primary overlay for ~550ms.
  const [booted, setBooted] = useState(() => {
    try { return sessionStorage.getItem(BOOT_SESSION_KEY) === '1'; }
    catch { return true; }
  });
  return (
    <div>
      {!booted && <BootSequence onDone={() => setBooted(true)} />}
      <div className="max-w-6xl mx-auto px-5 md:px-8 pt-6">
        <CharacterPlate />
      </div>
      <AsapDashboard />
    </div>
  );
}
