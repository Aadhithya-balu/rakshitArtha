import { useEffect, useRef, useState, useCallback } from 'react';
import { api, InsurerDashboard } from '@/services/api';

export interface DashboardMetrics extends InsurerDashboard {
  lastUpdated?: Date;
  isLoading?: boolean;
  connectionStatus?: 'connected' | 'disconnected' | 'reconnecting';
}

interface UseRealtimeDashboardOptions {
  userId?: string;
  email?: string;
  pollInterval?: number; // milliseconds, default 5000
  enableAutoRefresh?: boolean;
  enabled?: boolean;
}

export function useRealtimeDashboard(options: UseRealtimeDashboardOptions = {}) {
  const {
    userId,
    email,
    pollInterval = 5000,
    enableAutoRefresh = true,
    enabled = true,
  } = options;

  const [metrics, setMetrics] = useState<DashboardMetrics>({
    isLoading: true,
    connectionStatus: 'disconnected',
  });

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttemptsRef = useRef(5);

  // Fetch dashboard data
  const fetchDashboardData = useCallback(async () => {
    try {
      setMetrics((prev) => ({
        ...prev,
        isLoading: true,
        connectionStatus: 'connected',
      }));

      const response = await api.getInsurerDashboard({
        userId,
        email,
      });

      setMetrics({
        portfolio: response.portfolio,
        finance: response.finance,
        predictive: response.predictive,
        platform: response.platform,
        lastUpdated: new Date(),
        isLoading: false,
        connectionStatus: 'connected',
      });

      // Reset reconnect attempts on success
      reconnectAttemptsRef.current = 0;
    } catch (error) {
      console.error('Dashboard data fetch failed:', error);
      setMetrics((prev) => ({
        ...prev,
        isLoading: false,
        connectionStatus: 'disconnected',
      }));
    }
  }, [userId, email]);

  // Initial fetch
  useEffect(() => {
    if (enabled && (userId || email)) {
      fetchDashboardData();
    }
  }, [enabled, userId, email, fetchDashboardData]);

  // Auto-refresh polling
  useEffect(() => {
    if (!enabled || !enableAutoRefresh || (!userId && !email)) {
      return;
    }

    pollIntervalRef.current = setInterval(() => {
      fetchDashboardData();
    }, pollInterval);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [enabled, enableAutoRefresh, pollInterval, userId, email, fetchDashboardData]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  // Manual refresh function
  const refresh = useCallback(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Stop polling
  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  // Start polling
  const startPolling = useCallback(() => {
    if (!enabled) return;
    if (pollIntervalRef.current) return; // Already polling

    pollIntervalRef.current = setInterval(() => {
      fetchDashboardData();
    }, pollInterval);
  }, [enabled, pollInterval, fetchDashboardData]);

  return {
    ...metrics,
    refresh,
    stopPolling,
    startPolling,
    isLoading: metrics.isLoading,
    connectionStatus: metrics.connectionStatus,
    lastUpdated: metrics.lastUpdated,
  };
}

export default useRealtimeDashboard;
