import { Outlet } from 'react-router-dom';
import Header from './components/Header';

export default function App() {
  return (
    <div>
      <Header />
      <main style={{ padding: '1.5rem' }}>
        <Outlet />
      </main>
    </div>
  );
}
