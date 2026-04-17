import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { DashboardMetrics } from './useRealtimeDashboard';

const INSURANCE_PORT = 5000;

interface UseWebSocketDashboardOptions {
  userId?: string;
  email?: string;
  enabled?: boolean;
}

export function useWebSocketDashboard(options: UseWebSocketDashboardOptions = {}) {
  const { userId, email, enabled = true } = options;
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!enabled || (!userId && !email)) return;

    try {
      // Connect to WebSocket server
      const socket = io(`http://localhost:${INSURANCE_PORT}`, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5,
      });

      socketRef.current = socket;

      // Connect event
      socket.on('connect', () => {
        console.log('WebSocket connected');
        setIsConnected(true);

        // Join dashboard room
        socket.emit('join-dashboard', {
          userId,
          email,
        });
      });

      // Disconnect event
      socket.on('disconnect', () => {
        console.log('WebSocket disconnected');
        setIsConnected(false);
      });

      // Dashboard update event
      socket.on('dashboard-update', (data: DashboardMetrics) => {
        console.log('Dashboard update received:', data);
        setMetrics({
          ...data,
          lastUpdated: new Date(),
          connectionStatus: 'connected',
        });
      });

      // Error event
      socket.on('error', (error: unknown) => {
        console.error('WebSocket error:', error);
        setIsConnected(false);
      });

      return () => {
        socket.disconnect();
      };
    } catch (error) {
      console.error('Failed to initialize WebSocket:', error);
    }
  }, [enabled, userId, email]);

  return {
    metrics,
    isConnected,
    socket: socketRef.current,
  };
}

export default useWebSocketDashboard;
