import { useEffect, useRef, useState } from 'react';

// Adaptador opcional para el WebSocket del backend. El editor funciona también
// sin conexión y conserva el borrador local hasta que el servidor esté disponible.
export function useDiagramSocket(diagramId, onMessage) {
  const socketRef = useRef(null);
  const [status, setStatus] = useState('offline');

  useEffect(() => {
    if (!diagramId) return undefined;
    const apiUrl = import.meta.env.VITE_API_URL || window.location.origin;
    const base = import.meta.env.VITE_WS_URL || apiUrl.replace(/^http/, 'ws').replace(/\/api\/?$/, '/ws');
    const socket = new WebSocket(`${base.replace(/\/$/, '')}/diagrams/${diagramId}/`);
    socketRef.current = socket;
    socket.onopen = () => setStatus('connected');
    socket.onclose = () => setStatus('offline');
    socket.onerror = () => setStatus('offline');
    socket.onmessage = (event) => onMessage?.(JSON.parse(event.data));
    return () => socket.close();
  }, [diagramId, onMessage]);

  const send = (event) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) socketRef.current.send(JSON.stringify(event));
  };
  return { status, send };
}
