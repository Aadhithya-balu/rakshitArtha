import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { NativeModules } from 'react-native';
import { Storage } from '@/utils/storage';
import { activityTelemetryService } from '@/services/activity-telemetry';
import { syncUserToBackend, updateUserProfileFields } from '@/services/auth-api';
import { clearWorkerProfileCache } from '@/services/api';

export interface UserProfile {
  name: string; phone: string; email: string; platform: string;
  role?: 'WORKER' | 'INSURER_ADMIN';
  jobType: string; workingHours: string; workingDays: string;
  avgDailyHours: string; city: string; deliveryZone: string;
  zoneType: string; preferredAreas: string; dailyIncome?: number;
  backendUserId?: string; kycVerified?: boolean; accountStatus?: string;
  themePreference?: 'light' | 'dark' | 'system'; profileImage?: string;
  activePlan?: 'standard' | 'premium';
  activityConsent?: boolean; weatherCrossCheckConsent?: boolean;
  activityTelemetry?: {
    accelerometerVariance?: number | null;
    idleRatio?: number | null;
    foregroundAppMinutes?: number | null;
    motionConsistencyScore?: number | null;
    sampleCount?: number;
    collectedAt?: string | null;
    deviceMotionAvailable?: boolean;
  };
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: UserProfile | null;
  login: (email: string, password: string) => UserProfile | null;
  register: (profile: UserProfile, password: string) => void;
  registerExternal: (profile: UserProfile) => void;
  updateUser: (updates: Partial<UserProfile>) => void;
  logout: () => void;
  isNewUser: (email: string) => boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

const STORAGE_KEY = 'rakshitartha_users';
const SESSION_KEY = 'rakshitartha_session';
const BACKEND_USER_ID_KEY = 'rakshitartha_backend_user_id';

function getUsers(): Record<string, { profile: UserProfile; password: string }> {
  try { return JSON.parse(Storage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [syncRetryTick, setSyncRetryTick] = useState(0);

  useEffect(() => {
    Storage.hydrate([SESSION_KEY, STORAGE_KEY]).then(() => {
      const session = Storage.getItem(SESSION_KEY);
      if (session) {
        try {
          const parsed = JSON.parse(session) as UserProfile;
          setUser(parsed);
          setIsAuthenticated(true);
          if (parsed.backendUserId) {
            Storage.setItem(BACKEND_USER_ID_KEY, parsed.backendUserId);
          }
        } catch {
          Storage.removeItem(SESSION_KEY);
        }
      }
    });
  }, []);

  useEffect(() => {
    if (!user || user.backendUserId) return;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    syncUserToBackend({
      name: user.name, email: user.email, phone: user.phone,
      location: [user.city, user.deliveryZone].filter(Boolean).join(', '),
      city: user.city,
      deliveryZone: user.deliveryZone,
      zoneType: user.zoneType,
      platform: user.platform, dailyIncome: user.dailyIncome,
      workingHours: user.workingHours,
      workingDays: user.workingDays,
      avgDailyHours: user.avgDailyHours,
      activityConsent: user.activityConsent,
      weatherCrossCheckConsent: user.weatherCrossCheckConsent,
      activityTelemetry: user.activityTelemetry,
    }).then(result => {
      if (cancelled) return;
      setUser(cur => {
        if (!cur) return cur;
        const updated = { ...cur, backendUserId: result.backendUserId, kycVerified: result.kycVerified, accountStatus: result.accountStatus };
        const users = getUsers();
        if (users[cur.email.toLowerCase()]) {
          users[cur.email.toLowerCase()].profile = updated;
          Storage.setItem(STORAGE_KEY, JSON.stringify(users));
        }
        Storage.setItem(SESSION_KEY, JSON.stringify(updated));
        if (updated.backendUserId) {
          Storage.setItem(BACKEND_USER_ID_KEY, updated.backendUserId);
        }
        return updated;
      });
    }).catch(() => {
      if (cancelled) return;
      retryTimer = setTimeout(() => setSyncRetryTick(tick => tick + 1), 5000);
    });
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [user, syncRetryTick]);

  useEffect(() => {
    if (!user?.backendUserId) return;
    const location = [user.city, user.deliveryZone].filter(Boolean).join(', ');
    clearWorkerProfileCache({ userId: user.backendUserId, email: user.email });
    updateUserProfileFields(user.backendUserId, {
      name: user.name,
      phone: user.phone,
      platform: user.platform,
      city: user.city,
      deliveryZone: user.deliveryZone,
      zoneType: user.zoneType,
      dailyIncome: user.dailyIncome,
      workingHours: user.workingHours,
      workingDays: user.workingDays,
      avgDailyHours: user.avgDailyHours,
      activityConsent: user.activityConsent,
      weatherCrossCheckConsent: user.weatherCrossCheckConsent,
      activityTelemetry: user.activityTelemetry,
      location: location || undefined,
    } as Record<string, unknown>).catch(() => {});
  }, [
    user?.backendUserId,
    user?.email,
    user?.name,
    user?.phone,
    user?.platform,
    user?.city,
    user?.deliveryZone,
    user?.zoneType,
    user?.dailyIncome,
    user?.workingHours,
    user?.workingDays,
    user?.avgDailyHours,
    user?.activityConsent,
    user?.weatherCrossCheckConsent,
    user?.activityTelemetry,
  ]);

  useEffect(() => {
    if (!user?.backendUserId) {
      activityTelemetryService.stop();
      return;
    }

    activityTelemetryService.start();
    const interval = setInterval(() => {
      const snapshot = activityTelemetryService.getSnapshot();
      setUser(current => {
        if (!current) return current;
        const updated = { ...current, activityTelemetry: snapshot };
        const users = getUsers();
        if (users[current.email.toLowerCase()]) {
          users[current.email.toLowerCase()].profile = updated;
          Storage.setItem(STORAGE_KEY, JSON.stringify(users));
        }
        Storage.setItem(SESSION_KEY, JSON.stringify(updated));
        return updated;
      });
      updateUserProfileFields(user.backendUserId!, { activityTelemetry: snapshot }).catch(() => {});
    }, 60000);

    return () => {
      clearInterval(interval);
      activityTelemetryService.stop();
    };
  }, [user?.backendUserId]);

  useEffect(() => {
    if (!user?.backendUserId) return;
    if (user.role === 'INSURER_ADMIN') return;
    if (!NativeModules?.RNFBAppModule) return;
    
    import('@/services/push-notifications')
      .then((mod) => {
        // Register device token for push notifications
        mod.registerDevicePushToken?.(user.backendUserId);
        // Setup handlers to receive and display OS notifications
        mod.setupPushNotificationHandlers?.();
      })
      .catch(() => {});
  }, [user?.backendUserId]);

  const isNewUser = (email: string) => !getUsers()[email.toLowerCase()];

  const login = (email: string, password: string): UserProfile | null => {
    const users = getUsers();
    const record = users[email.toLowerCase()];
    if (!record || record.password !== password) return null;
    setUser(record.profile);
    setIsAuthenticated(true);
    Storage.setItem(SESSION_KEY, JSON.stringify(record.profile));
    if (record.profile.backendUserId) {
      Storage.setItem(BACKEND_USER_ID_KEY, record.profile.backendUserId);
    }
    return record.profile;
  };

  const register = (profile: UserProfile, password: string): void => {
    const users = getUsers();
    users[profile.email.toLowerCase()] = { profile, password };
    Storage.setItem(STORAGE_KEY, JSON.stringify(users));
    setUser(profile);
    setIsAuthenticated(true);
    Storage.setItem(SESSION_KEY, JSON.stringify(profile));
    if (profile.backendUserId) {
      Storage.setItem(BACKEND_USER_ID_KEY, profile.backendUserId);
    }
  };

  const registerExternal = (profile: UserProfile): void => {
    const users = getUsers();
    users[profile.email.toLowerCase()] = { profile, password: '__external__' };
    Storage.setItem(STORAGE_KEY, JSON.stringify(users));
    setUser(profile);
    setIsAuthenticated(true);
    Storage.setItem(SESSION_KEY, JSON.stringify(profile));
    if (profile.backendUserId) {
      Storage.setItem(BACKEND_USER_ID_KEY, profile.backendUserId);
    }
  };

  const updateUser = (updates: Partial<UserProfile>): void => {
    if (!user) return;
    const updated = { ...user, ...updates };
    const users = getUsers();
    if (users[user.email.toLowerCase()]) {
      users[user.email.toLowerCase()].profile = updated;
      Storage.setItem(STORAGE_KEY, JSON.stringify(users));
    }
    setUser(updated);
    Storage.setItem(SESSION_KEY, JSON.stringify(updated));
    if (user.backendUserId) {
      const location = [updated.city, updated.deliveryZone].filter(Boolean).join(', ');
      clearWorkerProfileCache({ userId: user.backendUserId, email: user.email });
      updateUserProfileFields(user.backendUserId, {
        ...updates,
        location: location || updated.city || updated.deliveryZone || undefined,
      } as Record<string, unknown>).catch(() => {});
    }
  };

  const logout = () => {
    activityTelemetryService.reset();
    setUser(null);
    setIsAuthenticated(false);
    Storage.removeItem(SESSION_KEY);
    Storage.removeItem(BACKEND_USER_ID_KEY);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, login, register, registerExternal, updateUser, logout, isNewUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
