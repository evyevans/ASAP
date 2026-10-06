/* Listing sources — registered once, on import.
 *
 * Registration order is the order the UI offers them, so the two that work
 * today come first and the one that needs paperwork comes last. */

import { registerProvider } from './provider';
import { manualProvider } from './providers/manual';
import { webResearchProvider } from './providers/webResearch';
import { resoProvider } from './providers/reso';
import { repliersProvider } from './providers/repliers';

registerProvider(webResearchProvider);
registerProvider(manualProvider);
registerProvider(resoProvider);
registerProvider(repliersProvider);

export * from './provider';
export * from './normalize';
export { manualProvider, webResearchProvider, resoProvider, repliersProvider };
