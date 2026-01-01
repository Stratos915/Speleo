import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import AuthProvider from './context/AuthContext.jsx';
import './index.css';

function ensureRecoveryRedirect() {
  if (typeof window === 'undefined') return;
  const hashParams = new URLSearchParams(window.location.hash.replace('#', ''));
  const searchParams = new URLSearchParams(window.location.search);
  const typeParam = hashParams.get('type') || searchParams.get('type');
  if (!typeParam) return;
  if (!['recovery', 'invite', 'signup'].includes(typeParam)) return;
  if (window.location.pathname.startsWith('/reset-password')) return;
  const search = window.location.search || '';
  const hash = window.location.hash || '';
  window.location.replace(`/reset-password${search}${hash}`);
}

ensureRecoveryRedirect();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </StrictMode>,
);
