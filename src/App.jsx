import { Outlet } from 'react-router-dom';
import Header from './components/Header';
import NavigationMenu from './components/NavigationMenu.jsx';
import './App.css';

export default function App() {
  return (
    <div className="app-shell">
      <Header />
      <NavigationMenu variant="top" />
      <main className="app-content">
        <Outlet />
      </main>
      <NavigationMenu variant="bottom" />
    </div>
  );
}
