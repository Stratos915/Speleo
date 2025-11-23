import { Outlet } from 'react-router-dom';
import Header from './components/Header';
import './App.css';

export default function App() {
  return (
    <div className="app-shell">
      <Header />
      <main className="app-content">
        <Outlet />
      </main>
    </div>
  );
}
