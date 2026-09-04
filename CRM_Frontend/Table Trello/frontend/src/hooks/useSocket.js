import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:3003';

export function useSocket(eventHandlers = {}) {
  const socketRef = useRef(null);
  const handlersRef = useRef(eventHandlers);

  useEffect(() => {
    handlersRef.current = eventHandlers;
  }, [eventHandlers]);

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling']
    });
    socketRef.current = socket;

    const wrappedHandlers = Object.fromEntries(
      Object.keys(eventHandlers).map((event) => [
        event,
        (...args) => handlersRef.current[event]?.(...args)
      ])
    );

    Object.entries(wrappedHandlers).forEach(([event, handler]) => {
      socket.on(event, handler);
    });

    socket.on('connect', () => {
      console.log('Socket.IO conectado:', socket.id);
    });

    socket.on('connect_error', (error) => {
      console.warn('Error de conexion Socket.IO:', error.message);
    });

    return () => {
      Object.entries(wrappedHandlers).forEach(([event, handler]) => {
        socket.off(event, handler);
      });
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const emit = (event, data) => {
    if (socketRef.current) {
      socketRef.current.emit(event, data);
    }
  };

  return { socket: socketRef.current, emit };
}
