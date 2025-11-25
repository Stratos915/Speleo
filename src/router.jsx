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
