// src/router.jsx
import React from 'react';
import { createBrowserRouter } from 'react-router-dom';

import App from './App.jsx';

import Dashboard from './pages/Dashboard.jsx';
import Uscite from './pages/Uscite.jsx';
import Magazzino from './pages/Magazzino.jsx';
import Corsi from './pages/Corsi.jsx';
import Biblioteca from './pages/Biblioteca.jsx';
import Report from './pages/Report.jsx';
import Members from './pages/Members.jsx';

import NotFound from './pages/NotFound.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      {
        // pagina iniziale dopo il login
        index: true,
        element: (
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        ),
      },
      {
        path: 'uscite',
        element: (
          <ProtectedRoute>
            <Uscite />
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
        path: 'corsi',
        element: (
          <ProtectedRoute>
            <Corsi />
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
      {
        path: '*',
        element: <NotFound />,
      },
    ],
  },
]);
