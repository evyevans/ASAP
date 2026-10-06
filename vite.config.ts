import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true, // fail loudly instead of silently switching ports
  },
  optimizeDeps: {
    // leaflet.markercluster is a side-effect module: it monkey-patches the
    // global `L` object to add L.markerClusterGroup rather than exporting
    // anything. Vite's dependency optimizer rewrites such modules and can break
    // the patching, so L.markerClusterGroup comes back undefined at runtime —
    // a failure that only appears in a real build, never in dev.
    // REMI hit this and excluded it; scout/MarkerClusterLayer.tsx additionally
    // loads it through a dynamic import behind a `ready` gate.
    exclude: ['leaflet.markercluster'],
  },
})
