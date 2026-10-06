/* ═══════════════════════════════════════════════════════════════════════════
   StagePoster — what the hero shows when the 3D scene cannot run.

   A blank div is precisely what made the original failure invisible: the card
   looked "not finished yet" rather than broken, so nobody investigated. This
   renders a deliberate, composed still that carries the SAME status copy and the
   SAME aria-live region as the live scene, so the product keeps working — you
   still learn what ASAP is doing — while the reason is stated plainly.

   Deliberately CSS-only, no image asset. A poster that 404s is a second failure
   layered on the first, and this must be the one thing that cannot fail.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface StagePosterProps {
  label: string;
  caption: string;
  /** Why the scene isn't running. Shown quietly; omitted in the happy path. */
  reason?: string;
  onRetry?: () => void;
}

export function StagePoster({ label, caption, reason, onRetry }: StagePosterProps) {
  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{
        // The same near-black stage the live scene uses, so a degraded hero
        // still sits in the design rather than looking like an error page.
        background:
          'radial-gradient(120% 90% at 50% 34%, #16181F 0%, #0A0B0F 45%, #050609 100%)',
      }}
    >
      {/* A single soft key from the upper left — the stage lighting, implied. */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(42% 38% at 34% 26%, rgba(232,115,58,0.10) 0%, transparent 70%)',
        }}
      />

      {/* A suggestion of the figure: a soft vertical column of light. */}
      <div
        aria-hidden
        className="absolute left-1/2 top-[30%] h-[46%] w-[16%] -translate-x-1/2 rounded-full blur-2xl"
        style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.09), transparent)' }}
      />

      <div className="absolute bottom-4 left-5 right-5">
        <div className="text-sm font-bold text-white/90">{label}</div>
        <div className="text-xs text-white/55 truncate">{caption}</div>
        {reason && (
          <div className="mt-1.5 flex items-center gap-2">
            <span className="text-[10px] text-white/35">{reason}</span>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="text-[10px] font-semibold text-white/70 underline underline-offset-2 hover:text-white"
              >
                Try again
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
