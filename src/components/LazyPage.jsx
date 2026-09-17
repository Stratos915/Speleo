import { Suspense } from 'react';

export default function LazyPage({ children }) {
  return <Suspense fallback={<p>Caricamento pagina...</p>}>{children}</Suspense>;
}
