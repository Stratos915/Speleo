import { lazy } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import Login from './pages/Login.jsx';
import AuthCallback from './pages/AuthCallback.jsx';
import ApprovalPending from './pages/ApprovalPending.jsx';
import PublicHome from './pages/PublicHome.jsx';
import Privacy from './pages/Privacy.jsx';
import Terms from './pages/Terms.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import NotFound from './pages/NotFound.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Lazy from './components/LazyPage.jsx';
import { getPageEditRoles } from './utils/permissions.js';

// Le pagine interne vengono scaricate solo quando servono: l'app si apre più in fretta.
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Uscite = lazy(() => import('./pages/Uscite.jsx'));
const UscitaDettaglio = lazy(() => import('./pages/UscitaDettaglio.jsx'));
const UscitaNuova = lazy(() => import('./pages/UscitaNuova.jsx'));
const Magazzino = lazy(() => import('./pages/Magazzino.jsx'));
const Corso = lazy(() => import('./pages/Corso.jsx'));
const Biblioteca = lazy(() => import('./pages/Biblioteca.jsx'));
const Report = lazy(() => import('./pages/Report.jsx'));
const Members = lazy(() => import('./pages/Members.jsx'));
const PrestitoAvanzato = lazy(() => import('./pages/PrestitoAvanzato.jsx'));
const StoricoPrestiti = lazy(() => import('./pages/StoricoPrestiti.jsx'));


export const router = createBrowserRouter([
  { path: '/', element: <Login /> },
  { path: '/public', element: <PublicHome /> },
  { path: '/auth/callback', element: <AuthCallback /> },
  { path: '/approval-pending', element: <ApprovalPending /> },
  { path: '/privacy', element: <Privacy /> },
  { path: '/terms', element: <Terms /> },
  { path: '/reset', element: <ResetPassword /> },
  { path: '/reset-password', element: <ResetPassword /> },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <App />
      </ProtectedRoute>
    ),
    children: [
      {
        path: 'dashboard',
        element: (
          <ProtectedRoute page="dashboard">
            <Lazy>
              <Dashboard />
            </Lazy>
          </ProtectedRoute>
        ),
      },
      {
        path: 'uscite',
        element: (
          <ProtectedRoute page="uscite">
            <Lazy>
              <Uscite />
            </Lazy>
          </ProtectedRoute>
        ),
      },
      {
        path: 'uscite/new',
        element: (
          <ProtectedRoute page="uscite" roles={getPageEditRoles('uscite')}>
            <Lazy>
              <UscitaNuova />
            </Lazy>
          </ProtectedRoute>
        ),
      },
      {
        path: 'uscite/:id',
        element: (
          <ProtectedRoute page="uscite">
            <Lazy>
              <UscitaDettaglio />
            </Lazy>
          </ProtectedRoute>
        ),
      },
      {
        path: 'magazzino',
        element: (
          <ProtectedRoute page="magazzino">
            <Lazy>
              <Magazzino />
            </Lazy>
          </ProtectedRoute>
        ),
      },
      {
        path: 'soci',
        element: (
          <ProtectedRoute page="soci">
            <Lazy>
              <Members />
            </Lazy>
          </ProtectedRoute>
        ),
      },
      {
        path: 'prestito-avanzato',
        element: (
          <ProtectedRoute page="prestiti">
            <Lazy>
              <PrestitoAvanzato />
            </Lazy>
          </ProtectedRoute>
        ),
      },
      {
        path: 'storico-prestiti',
        element: (
          <ProtectedRoute page="prestiti">
            <Lazy>
              <StoricoPrestiti />
            </Lazy>
          </ProtectedRoute>
        ),
      },
      {
        path: 'corsi',
        element: (
          <ProtectedRoute page="scuola">
            <Lazy>
              <Corso />
            </Lazy>
          </ProtectedRoute>
        ),
      },
      {
        path: 'biblioteca',
        element: (
          <ProtectedRoute page="biblioteca">
            <Lazy>
              <Biblioteca />
            </Lazy>
          </ProtectedRoute>
        ),
      },
      {
        path: 'report',
        element: (
          <ProtectedRoute page="report">
            <Lazy>
              <Report />
            </Lazy>
          </ProtectedRoute>
        ),
      },
    ],
  },
  { path: '*', element: <NotFound /> },
]);
