import { useCallback, useEffect, useRef, useState } from 'react';

// Adaptador opcional para el WebSocket del backend. El editor funciona también
// sin conexión y conserva el borrador local hasta que el servidor esté disponible.
export function useDiagramSocket(diagramId, onMessage) {
  const socketRef = useRef(null);
  const [status, setStatus] = useState('offline');

  useEffect(() => {
    if (!diagramId) return undefined;
    const apiUrl = import.meta.env.VITE_API_URL || window.location.origin;
    const base = import.meta.env.VITE_WS_URL || apiUrl.replace(/^http/, 'ws').replace(/\/api\/?$/, '/ws');
    const socket = new WebSocket(`${base.replace(/\/$/, '')}/diagramas/${diagramId}/`);
    socketRef.current = socket;
    socket.onopen = () => setStatus('connected');
    socket.onclose = () => setStatus('offline');
    socket.onerror = () => setStatus('offline');
    socket.onmessage = (event) => {
      try {
        onMessage?.(JSON.parse(event.data));
      } catch {
        setStatus('offline');
      }
    };
    return () => socket.close();
  }, [diagramId, onMessage]);

  useEffect(() => {
    if (!diagramId) return undefined;

    const heartbeat = window.setInterval(() => {
      const socket = socketRef.current;
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'presence.heartbeat', diagram_id: diagramId }));
      }
    }, 20000);

    return () => window.clearInterval(heartbeat);
  }, [diagramId]);

  const send = useCallback((event) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) socketRef.current.send(JSON.stringify(event));
  }, []);
  return { status, send };
}
