import React, { useState } from 'react';
import LoginPage from './pages/LoginPage';
import DiagramCanvas from './components/editor/DiagramCanvas';
import './App.css';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(
  () =>
    Boolean(localStorage.getItem('token')) ||
    Boolean(sessionStorage.getItem('token'))
);

  // Si está autenticado, muestra el lienzo de React Flow
  if (isAuthenticated) {
    return (
      <div style={{ width: '100vw', height: '100vh', margin: 0, padding: 0 }}>
        <DiagramCanvas />
      </div>
    );
  }

  // Si NO está autenticado, muestra el nuevo login bonito
  return (
    <LoginPage onLoginSuccess={() => setIsAuthenticated(true)} />
  );
}

export default App;