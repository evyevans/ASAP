/* Single Supabase client for the dashboard.
 *
 * Hermes locked the architecture: EVERY event (block/draft/doc/fub/lead/research/
 * system) lands in the ONE agent_events table in the ASAP project. So the whole
 * live feed + all current-state tables read from a single client that carries the
 * signed-in user's JWT (for the org-scoped RLS policies). No second project.
 */
export { supabase as asapSupabase } from '../auth/AuthContext';
