/* ═══════════════════════════════════════════════════════════════════════════
   AddListingDialog — the `manual` provider's user interface.

   WHY THIS IS THE MOST IMPORTANT FORM IN THE INTEGRATION RIGHT NOW
   There is no MLS feed (asap-buyer-match.md:18), and REMI's adapters are all
   US-only with an unimplemented RESO stub. Until a board data agreement lands,
   this dialog and Hermes's public research ARE the inventory. It is what makes
   Market Scout and the grid work on day one instead of next quarter.

   It runs the same normalizeListing path every other source runs, so a
   hand-entered home gets the same address normalisation, the same dedupe key,
   the same provenance stamp and the same rights flags as anything else. No
   special case — which is exactly why swapping in a real feed later changes
   nothing downstream.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useRef, useState } from 'react';
import { X, Plus } from 'lucide-react';
import { Button, Input } from '../components/ui';
import { useListings } from '../hooks/useMatches';
import { useOrgId } from '../hooks/useOrgId';
import { normalizeListing } from '../listings/normalize';
import { MANUAL_RIGHTS } from '../listings/provider';
import { PROPERTY_TYPE_LABEL } from '../clients/clientCopy';
import type { MarketRow, PropertyType, Tenure } from '../matching/types';

const TYPES = Object.keys(PROPERTY_TYPE_LABEL) as PropertyType[];

/** Module scope, NOT inside the component.
 *
 *  Defining this in the render body gives React a brand-new component type on
 *  every keystroke, so it unmounts and remounts the input underneath — and the
 *  field loses focus after each character. On a fifteen-field form that is the
 *  difference between usable and unusable. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] font-medium text-text-secondary">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

export interface AddListingDialogProps {
  markets: MarketRow[];
  defaultMarket: string | null;
  onClose: () => void;
  onAdded: () => void;
}

export function AddListingDialog({ markets, defaultMarket, onClose, onAdded }: AddListingDialogProps) {
  const { orgId } = useOrgId();
  const { addListing } = useListings({ limit: 1 });

  const [marketSlug, setMarketSlug] = useState(defaultMarket ?? markets[0]?.slug ?? '');
  const [tenure, setTenure] = useState<Tenure>('for_sale');
  const [form, setForm] = useState({
    address: '', unit: '', neighbourhood: '', price: '', soldPrice: '', soldAt: '',
    bedrooms: '', bathrooms: '', sqft: '', parkingSpaces: '', maintenanceFee: '',
    propertyType: '' as PropertyType | '', url: '', listedAt: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  // Focus the first field and close on Escape — a modal that traps the keyboard
  // without giving it back is worse than no modal.
  useEffect(() => {
    firstFieldRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    setError(null);

    if (!orgId) { setError('No organisation on this session — sign in again.'); return; }
    if (!marketSlug) { setError('Pick a market.'); return; }

    // Same normaliser as every other source. A hand-entered home is not a
    // special case, it is just another provider.
    const outcome = normalizeListing({
      raw: {
        address: form.address,
        unit: form.unit || null,
        neighbourhood: form.neighbourhood || null,
        price: form.price || null,
        soldPrice: form.soldPrice || null,
        soldAt: form.soldAt || null,
        bedrooms: form.bedrooms || null,
        bathrooms: form.bathrooms || null,
        sqft: form.sqft || null,
        parkingSpaces: form.parkingSpaces || null,
        maintenanceFee: form.maintenanceFee || null,
        propertyType: form.propertyType || null,
        url: form.url || null,
        listedAt: form.listedAt || null,
        status: tenure === 'sold' ? 'sold' : 'active',
      },
      orgId,
      marketSlug,
      tenure,
      sourceId: 'manual',
      rights: MANUAL_RIGHTS,
      fetchedAt: new Date().toISOString(),
    });

    if (!outcome.ok) {
      setError(outcome.rejected.reason);
      return;
    }

    setBusy(true);
    const saved = await addListing(outcome.listing);
    setBusy(false);

    if (saved) onAdded();
    else setError('That listing could not be saved. Check the market and try again.');
  };

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-bg-dark/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Add a listing"
        className="w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-2xl border border-border bg-bg-surface shadow-xl"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-bg-surface z-10">
          <div>
            <h2 className="text-base font-bold text-text-primary">Add a listing</h2>
            <p className="text-[11px] text-text-tertiary mt-0.5">
              Anything you add is treated as confirmed by you, and can be shared with a client.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1 text-text-tertiary hover:text-text-primary">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="rounded-xl border border-error/30 bg-error/8 px-4 py-2.5 text-sm text-error">
              {error}
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Market">
              <select
                value={marketSlug}
                onChange={(e) => setMarketSlug(e.target.value)}
                className="w-full bg-bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
              >
                {markets.map((m) => <option key={m.slug} value={m.slug}>{m.name}</option>)}
              </select>
            </Field>
            <Field label="Listing type">
              <select
                value={tenure}
                onChange={(e) => setTenure(e.target.value as Tenure)}
                className="w-full bg-bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
              >
                <option value="for_sale">For sale</option>
                <option value="for_rent">For rent</option>
                <option value="sold">Sold (reference comp only)</option>
              </select>
            </Field>
          </div>

          {tenure === 'sold' && (
            <p className="text-[11px] text-warning">
              Sold listings are stored as comparable context. They are never matched to a client
              and are never shared with one.
            </p>
          )}

          <Field label="Street address">
            <Input ref={firstFieldRef} value={form.address} onChange={set('address')}
              placeholder="12 Test Street" />
          </Field>

          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Unit (optional)"><Input value={form.unit} onChange={set('unit')} placeholder="1203" /></Field>
            <Field label="Neighbourhood (optional)">
              <Input value={form.neighbourhood} onChange={set('neighbourhood')} placeholder="Leslieville" />
            </Field>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            {tenure === 'sold' ? (
              <>
                <Field label="Sold price"><Input type="number" value={form.soldPrice} onChange={set('soldPrice')} /></Field>
                <Field label="Sold on"><Input type="date" value={form.soldAt} onChange={set('soldAt')} /></Field>
              </>
            ) : (
              <>
                <Field label={tenure === 'for_rent' ? 'Rent / month' : 'Asking price'}>
                  <Input type="number" value={form.price} onChange={set('price')} />
                </Field>
                <Field label="Listed on"><Input type="date" value={form.listedAt} onChange={set('listedAt')} /></Field>
              </>
            )}
            <Field label="Property type">
              <select
                value={form.propertyType}
                onChange={(e) => setForm((f) => ({ ...f, propertyType: e.target.value as PropertyType }))}
                className="w-full bg-bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
              >
                <option value="">—</option>
                {TYPES.map((t) => <option key={t} value={t}>{PROPERTY_TYPE_LABEL[t]}</option>)}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Field label="Bedrooms"><Input value={form.bedrooms} onChange={set('bedrooms')} placeholder="3+1" /></Field>
            <Field label="Bathrooms"><Input type="number" value={form.bathrooms} onChange={set('bathrooms')} /></Field>
            <Field label="Sq ft"><Input type="number" value={form.sqft} onChange={set('sqft')} /></Field>
            <Field label="Parking"><Input type="number" value={form.parkingSpaces} onChange={set('parkingSpaces')} /></Field>
            <Field label="Condo fee"><Input type="number" value={form.maintenanceFee} onChange={set('maintenanceFee')} /></Field>
          </div>

          <Field label="Listing URL (optional)">
            <Input value={form.url} onChange={set('url')} placeholder="https://…" />
          </Field>

          <p className="text-[11px] text-text-tertiary">
            Leave anything you do not know blank. ASAP treats a missing field as unknown —
            it will flag it for you to confirm rather than guessing or excluding the home.
          </p>
        </div>

        <div className="px-5 py-4 border-t border-border flex justify-end gap-2 sticky bottom-0 bg-bg-surface">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" icon={Plus} loading={busy} onClick={submit}>Add listing</Button>
        </div>
      </div>
    </div>
  );
}
