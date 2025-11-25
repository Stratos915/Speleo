import { createBrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Uscite from './pages/Uscite.jsx';
import UscitaDettaglio from './pages/UscitaDettaglio.jsx';
import Magazzino from './pages/Magazzino.jsx';
import Corso from './pages/Corso.jsx';
import Biblioteca from './pages/Biblioteca.jsx';
import Report from './pages/Report.jsx';
import NotFound from './pages/NotFound.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import PrestitoAvanzato from './pages/PrestitoAvanzato.jsx';
import StoricoPrestiti from './pages/StoricoPrestiti.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import Members from './pages/Members.jsx';

export const router = createBrowserRouter([
  { path: '/', element: <Login /> },
  { path: '/reset', element: <ResetPassword /> },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <App />
      </ProtectedRoute>
    ),
    children: [
      { path: 'dashboard', element: <Dashboard /> },
      { path: 'uscite', element: <Uscite /> },
      {
        path: 'uscite/:id',
        element: (
          <ProtectedRoute>
            <UscitaDettaglio />
          </ProtectedRoute>
        ),
      },
      {
        path: 'magazzino',
        element: (
          <ProtectedRoute>
            <Magazzino />
          </ProtectedRoute>
        ),
      },
      {
        path: 'prestito-avanzato',
        element: (
          <ProtectedRoute roles={['admin']}>
            <PrestitoAvanzato />
          </ProtectedRoute>
        ),
      },
      {
        path: 'storico-prestiti',
        element: (
          <ProtectedRoute>
            <StoricoPrestiti />
          </ProtectedRoute>
        ),
      },
      {
        path: 'corsi',
        element: (
          <ProtectedRoute>
            <Corso />
          </ProtectedRoute>
        ),
      },
      {
        path: 'biblioteca',
        element: (
          <ProtectedRoute>
            <Biblioteca />
          </ProtectedRoute>
        ),
      },
      
            {
      path: 'report',
      element: (
        <ProtectedRoute roles={['admin']}>
          <Report />
        </ProtectedRoute>
      ),
    },
    {
      path: 'soci',
      element: (
        <ProtectedRoute>
          <Members />
        </ProtectedRoute>
      ),
    },
  ],
  { path: '*', element: <NotFound /> },
]);
