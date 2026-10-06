import { useRef, useSyncExternalStore } from 'react';
import { X, RotateCcw, Info } from 'lucide-react';
import { demoStore } from './store';
import { resetDemo } from '../auth/AuthContext';

export function DemoBar() {
  const dialog = useRef<HTMLDialogElement>(null);
  useSyncExternalStore(demoStore.subscribe, demoStore.snapshot);
  return <>
    <div className="shrink-0 flex items-center justify-between gap-3 px-5 md:px-8 py-2 border-b border-border bg-bg-surface text-[11px] text-text-secondary">
      <span><b className="text-text-primary">Interactive demo</b><span className="hidden sm:inline"> · Alex Morgan’s sample workspace · changes stay in this session</span></span>
      <button onClick={() => dialog.current?.showModal()} className="inline-flex items-center gap-1.5 hover:text-text-primary" aria-label="About this demo"><Info size={13} />About the scenario</button>
    </div>
    {demoStore.getPersistenceWarning() && <p className="px-5 text-xs text-warning" role="status">Browser storage is unavailable. Edits last until this page is reloaded.</p>}
    <dialog ref={dialog} aria-labelledby="demo-title" className="fixed inset-0 m-auto max-w-lg w-[calc(100%-2rem)] rounded-2xl bg-bg-primary text-text-primary border border-border p-7 shadow-xl max-h-[85vh] overflow-y-auto backdrop:bg-black/40">
        <button autoFocus onClick={() => dialog.current?.close()} className="absolute right-4 top-4 p-2" aria-label="Close scenario"><X size={16} /></button>
        <p className="text-xs uppercase tracking-widest text-text-tertiary">ASAP · a week in practice</p>
        <h2 id="demo-title" className="text-2xl font-bold mt-2 mb-4">Your goals. A shared working day.</h2>
        <div className="space-y-4 text-sm text-text-secondary leading-relaxed">
          <p><b className="text-text-primary">Monthly foundation.</b> Alex is a fictional Toronto realtor working toward a $30,000 month, with an assumed $10,000 commission per deal and 35 available hours per week. Buyer follow-up is the bottleneck.</p>
          <p><b className="text-text-primary">This week.</b> Sarah’s buying decision comes first. The sample calendar protects consultations and personal commitments, while ASAP prepares shortlists, drafts, and CRM next actions.</p>
          <p><b className="text-text-primary">Try it.</b> Review Sarah’s packet on Home, edit her brief in Clients, compare the resulting matches in Scout, and adjust a calendar block. Your decisions stay consistent across the tabs.</p>
          <p><b className="text-text-primary">Next week.</b> The sample retrospective favours buyer preparation and reduces content work that was repeatedly skipped. It illustrates how weekly planning uses monthly context and execution evidence.</p>
          <p className="text-xs">People, properties, outcomes, and activity are fictional. Time and value metrics are illustrative estimates. Chat uses local scenarios; no AI agent, CRM, or calendar account is connected. Attachments stay local. Voice, if enabled in your browser, uses its speech service.</p>
        </div>
        <button onClick={resetDemo} className="mt-6 inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm"><RotateCcw size={14} />Reset sample workspace</button>
    </dialog>
  </>;
}
