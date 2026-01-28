import { createBrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import Login from './pages/Login.jsx';
import AuthCallback from './pages/AuthCallback.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Uscite from './pages/Uscite.jsx';
import UscitaDettaglio from './pages/UscitaDettaglio.jsx';
import UscitaNuova from './pages/UscitaNuova.jsx';
import Magazzino from './pages/Magazzino.jsx';
import Corso from './pages/Corso.jsx';
import Biblioteca from './pages/Biblioteca.jsx';
import Report from './pages/Report.jsx';
import Members from './pages/Members.jsx';
import PrestitoAvanzato from './pages/PrestitoAvanzato.jsx';
import StoricoPrestiti from './pages/StoricoPrestiti.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import NotFound from './pages/NotFound.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import { getPageEditRoles } from './utils/permissions.js';

export const router = createBrowserRouter([
  { path: '/', element: <Login /> },
  { path: '/auth/callback', element: <AuthCallback /> },
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
            <Dashboard />
          </ProtectedRoute>
        ),
      },
      {
        path: 'uscite',
        element: (
          <ProtectedRoute page="uscite">
            <Uscite />
          </ProtectedRoute>
        ),
      },
      {
        path: 'uscite/new',
        element: (
          <ProtectedRoute page="uscite" roles={getPageEditRoles('uscite')}>
            <UscitaNuova />
          </ProtectedRoute>
        ),
      },
      {
        path: 'uscite/:id',
        element: (
          <ProtectedRoute page="uscite">
            <UscitaDettaglio />
          </ProtectedRoute>
        ),
      },
      {
        path: 'magazzino',
        element: (
          <ProtectedRoute page="magazzino">
            <Magazzino />
          </ProtectedRoute>
        ),
      },
      {
        path: 'soci',
        element: (
          <ProtectedRoute page="soci">
            <Members />
          </ProtectedRoute>
        ),
      },
      {
        path: 'prestito-avanzato',
        element: (
          <ProtectedRoute page="prestiti">
            <PrestitoAvanzato />
          </ProtectedRoute>
        ),
      },
      {
        path: 'storico-prestiti',
        element: (
          <ProtectedRoute page="prestiti">
            <StoricoPrestiti />
          </ProtectedRoute>
        ),
      },
      {
        path: 'corsi',
        element: (
          <ProtectedRoute page="scuola">
            <Corso />
          </ProtectedRoute>
        ),
      },
      {
        path: 'biblioteca',
        element: (
          <ProtectedRoute page="biblioteca">
            <Biblioteca />
          </ProtectedRoute>
        ),
      },
      {
        path: 'report',
        element: (
          <ProtectedRoute page="report">
            <Report />
          </ProtectedRoute>
        ),
      },
    ],
  },
  { path: '*', element: <NotFound /> },
]);
