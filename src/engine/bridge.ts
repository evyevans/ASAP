/* ================================================================
   ASAP — LiveBridge Singleton
   Centralizes the LiveEventBridge instance so it can be imported
   by App.tsx and AnalyticsDashboard without circular deps or
   breaking Vite fast-refresh (no mixing of components + exports).
   ================================================================ */

import { LiveEventBridge } from './EventIngestion';

export const liveBridge = new LiveEventBridge();

export function getAnalyticsEngine() {
  return liveBridge.getAnalyticsEngine();
}

/** Wrapper for the static method — avoids importing the class in App.tsx */
export function isBackendAvailable(baseUrl?: string): Promise<boolean> {
  return LiveEventBridge.isBackendAvailable(baseUrl);
}
