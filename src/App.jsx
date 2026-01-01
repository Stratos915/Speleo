import { useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Header from './components/Header';
import NavigationMenu from './components/NavigationMenu.jsx';
import useAuth from './context/useAuth.js';
import { startPresencePing, trackPageView } from './services/analytics.js';
import './App.css';

export default function App() {
  const location = useLocation();
  const { user, isAuthenticated } = useAuth();
  const presenceCleanupRef = useRef(null);

  useEffect(() => {
    if (!isAuthenticated) {
      presenceCleanupRef.current?.();
      presenceCleanupRef.current = null;
      return () => {};
    }
    presenceCleanupRef.current?.();
    presenceCleanupRef.current = startPresencePing({ user });
    return () => {
      presenceCleanupRef.current?.();
      presenceCleanupRef.current = null;
    };
  }, [isAuthenticated, user]);

  useEffect(() => {
    if (!isAuthenticated) return;
    trackPageView({ page: `${location.pathname}${location.search}`, user }).catch((error) => {
      console.warn('[Analytics] impossibile tracciare la page view:', error.message);
    });
  }, [isAuthenticated, location.pathname, location.search, user]);

  return (
    <div className="app-shell">
      <Header />
      <NavigationMenu variant="top" />
      <main className="app-content">
        <Outlet />
      </main>
      <NavigationMenu variant="bottom" />
    </div>
  );
}
