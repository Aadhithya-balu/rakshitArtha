import { NativeModules } from 'react-native';

const INSURANCE_PORT = 5000;

function getConfiguredApiHost(): string | null {
  const envHost = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    ?.process?.env?.EXPO_PUBLIC_API_HOST;
  const host = envHost?.trim();
  return host ? host.replace(/^https?:\/\//i, '') : null;
}

function getMetroHost(): string | null {
  const scriptURL = NativeModules?.SourceCode?.scriptURL as string | undefined;
  if (!scriptURL) return null;
  const match = scriptURL.match(/^https?:\/\/([^/:]+)(?::\d+)?\//i);
  return match?.[1] || null;
}

function getInsuranceBases(): string[] {
  const metroHost = getMetroHost();
  const configuredHost = getConfiguredApiHost();
  const candidates = [
    metroHost ? `http://${metroHost}:${INSURANCE_PORT}` : null,
    configuredHost ? `http://${configuredHost}:${INSURANCE_PORT}` : null,
    `http://10.0.2.2:${INSURANCE_PORT}`,
    `http://localhost:${INSURANCE_PORT}`,
    `http://127.0.0.1:${INSURANCE_PORT}`,
  ].filter(Boolean) as string[];

  return [...new Set(candidates)];
}

async function fetchWithFallback(path: string, init?: RequestInit): Promise<Response> {
  let lastErr: unknown;
  for (const base of getInsuranceBases()) {
    try {
      const res = await fetch(`${base}${path}`, init);
      if ([502, 503, 504].includes(res.status)) continue;
      return res;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('All insurance API bases unreachable');
}

async function parseJson(res: Response) {
  const raw = await res.text();
  let body: unknown = null;
  if (raw) { try { body = JSON.parse(raw); } catch { body = { message: raw }; } }
  if (!res.ok) {
    const b = body as Record<string, unknown>;
    throw new Error((b?.message as string) || 'Request failed');
  }
  return (body ?? {}) as Record<string, unknown>;
}

const platformMap: Record<string, string> = {
  SWIGGY: 'SWIGGY', ZOMATO: 'ZOMATO', 'DELIVERY PARTNER': 'OTHER', OTHER: 'OTHER',
};

export type ActivityTelemetryPayload = {
  accelerometerVariance?: number | null;
  idleRatio?: number | null;
  foregroundAppMinutes?: number | null;
  motionConsistencyScore?: number | null;
  sampleCount?: number;
  collectedAt?: string | null;
  deviceMotionAvailable?: boolean;
};

export type ActivityStatePayload = {
  state: 'MOVING' | 'IDLE' | 'WALKING' | string;
  recordedAt?: string;
  source?: string;
  accelerometerVariance?: number | null;
  idleRatio?: number | null;
  motionConsistencyScore?: number | null;
  sampleCount?: number;
  deviceMotionAvailable?: boolean;
};

export type BackendUserProfile = {
  _id: string; name: string; email?: string; phone?: string;
  platform: string; location?: string; dailyIncome?: number | null;
  accountStatus?: string; role?: 'WORKER' | 'INSURER_ADMIN'; kyc?: { verified?: boolean };
  workingHours?: string;
  workingDays?: string;
  avgDailyHours?: string;
  city?: string;
  deliveryZone?: string;
  zoneType?: string;
};

export type SyncResponse = { backendUserId: string; accountStatus: string; kycVerified: boolean };

export type AdminLoginResponse = {
  backendUserId: string;
  name: string;
  email: string;
  role: 'INSURER_ADMIN';
  accountStatus: string;
};



export async function syncUserToBackend(payload: {
  name: string; email: string; phone: string; location: string; platform: string;
  city?: string; deliveryZone?: string; zoneType?: string;
  dailyIncome?: number; workingHours?: string; workingDays?: string; avgDailyHours?: string;
  activityConsent?: boolean; weatherCrossCheckConsent?: boolean; activityTelemetry?: ActivityTelemetryPayload;
}): Promise<SyncResponse> {
  const normalized = {
    ...payload,
    email: payload.email.trim().toLowerCase(),
    phone: (payload.phone.replace(/\D/g, '').slice(-10)) || '9000000000',
    platform: platformMap[payload.platform.toUpperCase()] || 'OTHER',
    activityConsent: payload.activityConsent !== false,
  };
  const res = await fetchWithFallback('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...normalized, workerType: 'GIG' }),
  });
  if (res.ok) {
    const json = await parseJson(res);
    const d = json.data as Record<string, unknown>;
    const backendUserId = (d?.userId || d?._id) as string;
    if (!backendUserId) throw new Error('Backend did not return a user ID');

    const locationParts = normalized.location.split(',').map(part => part.trim()).filter(Boolean);
    try {
      await updateUserProfileFields(backendUserId, {
        name: normalized.name,
        phone: normalized.phone,
        platform: normalized.platform,
        location: normalized.location,
        city: normalized.city || locationParts[0],
        deliveryZone: normalized.deliveryZone || locationParts.slice(1).join(', ') || undefined,
        zoneType: normalized.zoneType,
        dailyIncome: normalized.dailyIncome,
        workingHours: normalized.workingHours,
        workingDays: normalized.workingDays,
        avgDailyHours: normalized.avgDailyHours,
        activityConsent: normalized.activityConsent,
        weatherCrossCheckConsent: normalized.weatherCrossCheckConsent,
        activityTelemetry: normalized.activityTelemetry,
      });
    } catch {
      // Registration succeeded; profile patch can retry via AuthContext sync effect.
    }

    return { backendUserId, accountStatus: (d?.status as string) || 'VERIFICATION_PENDING', kycVerified: false };
  }
  const existing = await fetchWithFallback(`/auth/profile-by-email/${encodeURIComponent(normalized.email)}`);
  const ej = await parseJson(existing);
  const eu = ej.data as Record<string, unknown>;
  const locationParts = normalized.location.split(',').map(part => part.trim()).filter(Boolean);
  await updateUserProfileFields(eu._id as string, {
    name: normalized.name,
    phone: normalized.phone,
    platform: normalized.platform,
    location: normalized.location,
    city: locationParts[0],
    deliveryZone: locationParts.slice(1).join(', ') || undefined,
    dailyIncome: normalized.dailyIncome,
    workingHours: normalized.workingHours,
    workingDays: normalized.workingDays,
    avgDailyHours: normalized.avgDailyHours,
    activityConsent: normalized.activityConsent,
    weatherCrossCheckConsent: normalized.weatherCrossCheckConsent,
    activityTelemetry: normalized.activityTelemetry,
  });
  return {
    backendUserId: eu._id as string,
    accountStatus: (eu.accountStatus as string) || 'VERIFICATION_PENDING',
    kycVerified: Boolean((eu.kyc as Record<string, unknown>)?.verified),
  };
}

export async function verifyKyc(
  backendUserId: string, documentType: string, documentId: string,
  options?: { documentImage?: string; profileImage?: string }
) {
  const res = await fetchWithFallback(`/auth/verify-kyc/${backendUserId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ documentType, documentId, ...options }),
  });
  return parseJson(res);
}

export async function updateDailyIncome(backendUserId: string, dailyIncome: number) {
  const res = await fetchWithFallback(`/auth/profile/${backendUserId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dailyIncome }),
  });
  return parseJson(res);
}

export async function updateUserProfileFields(backendUserId: string, payload: Record<string, unknown>) {
  const normalizedPayload = {
    ...payload,
    platform: typeof payload.platform === 'string'
      ? (platformMap[payload.platform.toUpperCase()] || payload.platform.toUpperCase())
      : payload.platform,
  };
  const res = await fetchWithFallback(`/auth/profile/${backendUserId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(normalizedPayload),
  });
  return parseJson(res);
}

export async function fetchBackendProfileByEmail(email: string): Promise<BackendUserProfile | null> {
  try {
    const res = await fetchWithFallback(`/auth/profile-by-email/${encodeURIComponent(email.trim().toLowerCase())}`);
    if (!res.ok) return null;
    const json = await parseJson(res);
    return json.data as BackendUserProfile;
  } catch { return null; }
}

export async function registerPushDeviceToken(backendUserId: string, token: string, platform: 'android' | 'ios' | 'web' = 'android') {
  const res = await fetchWithFallback(`/auth/device-token/${backendUserId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, platform }),
  });
  return parseJson(res);
}

export async function recordActivityState(backendUserId: string, payload: ActivityStatePayload) {
  const res = await fetchWithFallback(`/auth/activity-state/${backendUserId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJson(res);
}

export async function insurerAdminLogin(email: string, password: string): Promise<AdminLoginResponse> {
  const res = await fetchWithFallback('/auth/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
  });
  const json = await parseJson(res);
  const data = json.data as Record<string, unknown>;
  return {
    backendUserId: data.userId as string,
    name: data.name as string,
    email: data.email as string,
    role: 'INSURER_ADMIN',
    accountStatus: data.accountStatus as string,
  };
}
