import { useCallback, useEffect, useRef, useState } from 'react';

// Reconnects after transient server/network failures and keeps the latest canvas
// update until the channel becomes available again.
export function useDiagramSocket(diagramId, onMessage) {
  const socketRef = useRef(null);
  const messageRef = useRef(onMessage);
  const retryRef = useRef(null);
  const pendingEventRef = useRef(null);
  const [status, setStatus] = useState('offline');

  useEffect(() => { messageRef.current = onMessage; }, [onMessage]);

  useEffect(() => {
    if (!diagramId) return undefined;

    let disposed = false;
    const apiUrl = import.meta.env.VITE_API_URL || window.location.origin;
    const base = import.meta.env.VITE_WS_URL || apiUrl.replace(/^http/, 'ws').replace(/\/api\/?$/, '/ws');
    const url = `${base.replace(/\/$/, '')}/diagramas/${diagramId}/`;
    const connect = () => {
      if (disposed) return;
      setStatus('connecting');
      const socket = new WebSocket(url);
      socketRef.current = socket;
      socket.onopen = () => {
        if (disposed || socketRef.current !== socket) return;
        setStatus('connected');
        if (pendingEventRef.current) {
          socket.send(JSON.stringify(pendingEventRef.current));
          pendingEventRef.current = null;
        }
      };
      socket.onclose = () => {
        if (disposed || socketRef.current !== socket) return;
        setStatus('offline');
        retryRef.current = window.setTimeout(connect, 2000);
      };
      socket.onerror = () => socket.close();
      socket.onmessage = (event) => {
        try { messageRef.current?.(JSON.parse(event.data)); }
        catch { setStatus('offline'); }
      };
    };
    connect();
    return () => {
      disposed = true;
      window.clearTimeout(retryRef.current);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [diagramId]);

  useEffect(() => {
    if (!diagramId) return undefined;
    const heartbeat = window.setInterval(() => {
      const socket = socketRef.current;
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'presence.heartbeat', diagram_id: diagramId }));
    }, 20000);
    return () => window.clearInterval(heartbeat);
  }, [diagramId]);

  const send = useCallback((event) => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(event));
    else pendingEventRef.current = event;
  }, []);
  return { status, send };
}
