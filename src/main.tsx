import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './index.css';
import App from './App';
import Home from './pages/Home';
import Profile from './pages/Profile';
import Alerts from './pages/Alerts';
import Memory from './pages/Memory';

/* Code-split the three new surfaces. Scout pulls in Leaflet + markercluster and
 * Calendar pulls in rrule; neither belongs in the bundle a realtor downloads to
 * look at their Home tab. Same posture as AsapPresence on Home. */
const Clients = lazy(() => import('./pages/Clients'));
const Scout = lazy(() => import('./pages/Scout'));
const Calendar = lazy(() => import('./pages/Calendar'));
/* Chat pulls in three.js for the animated core. Home no longer does — its hero
 * is a video now — so this is the only route that carries it, and it must stay
 * code-split or every tab pays for a ball only one of them shows. */
const Chat = lazy(() => import('./chat/ChatPage'));

/** Matches the page padding, so a route swap does not jump the layout. */
function RouteFallback() {
  return <div className="max-w-6xl mx-auto px-5 md:px-8 py-8"><div className="skeleton h-64 rounded-2xl" /></div>;
}
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider } from './auth/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public */}
            <Route path="/login" element={<Navigate to="/" replace />} />

            {/* Protected shell — Home / Clients / Scout / Calendar / Profile / Alerts / Memory */}
            <Route
              element={
                <ProtectedRoute>
                  <App />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<Home />} />
              <Route path="/chat" element={<Suspense fallback={<RouteFallback />}><Chat /></Suspense>} />
              <Route path="/clients" element={<Suspense fallback={<RouteFallback />}><Clients /></Suspense>} />
              <Route path="/map" element={<Suspense fallback={<RouteFallback />}><Scout /></Suspense>} />
              <Route path="/calendar" element={<Suspense fallback={<RouteFallback />}><Calendar /></Suspense>} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/alerts" element={<Alerts />} />
              <Route path="/memory" element={<Memory />} />
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
);
