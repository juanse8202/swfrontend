import { useEffect, useState } from 'react';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DiagramCanvas from './components/editor/DiagramCanvas';
import { cerrarSesion, obtenerSesion } from './api/authApi';
import './App.css';

let sessionRequest;
function verificarSesionUnaVez() {
  if (!sessionRequest) sessionRequest = obtenerSesion();
  return sessionRequest;
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(null);
  const [authView, setAuthView] = useState('login');

  useEffect(() => {
    let active = true;
    verificarSesionUnaVez().then((session) => { if (active) setIsAuthenticated(Boolean(session)); }).catch(() => { if (active) setIsAuthenticated(false); });
    return () => { active = false; };
  }, []);

  const handleLogout = async () => {
    try {
      await cerrarSesion();
    } catch (error) {
      console.warn('No se pudo cerrar la sesi\u00f3n en el servidor.', error);
    } finally {
      setIsAuthenticated(false);
    }
  };

  if (isAuthenticated === null) return <div className="grid min-h-screen place-items-center bg-[#0b1326] text-slate-300">Verificando sesión…</div>;

  // Si está autenticado, muestra el lienzo de React Flow
  if (isAuthenticated) {
    return (
      <div style={{ width: '100vw', height: '100vh', margin: 0, padding: 0 }}>
        <DiagramCanvas onLogout={handleLogout} />
      </div>
    );
  }

  // Si NO está autenticado, muestra el nuevo login bonito
  if (authView === 'register') return <RegisterPage onRegisterSuccess={() => setIsAuthenticated(true)} onLogin={() => setAuthView('login')} />;
  return <LoginPage onLoginSuccess={() => setIsAuthenticated(true)} onRegister={() => setAuthView('register')} />;
}

export default App;
