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

export const router = createBrowserRouter([
  { path: '/', element: <Login /> },
  {
    path: '/',
    element: <App />,
    children: [
      { path: 'dashboard', element: <Dashboard /> },
      { path: 'uscite', element: <Uscite /> },
      { path: 'uscite/:id', element: <UscitaDettaglio /> },
      { path: 'magazzino', element: <Magazzino /> },
      { path: 'corsi', element: <Corso /> },
      { path: 'biblioteca', element: <Biblioteca /> },
      { path: 'report', element: <Report /> },
    ],
  },
  { path: '*', element: <NotFound /> },
]);
