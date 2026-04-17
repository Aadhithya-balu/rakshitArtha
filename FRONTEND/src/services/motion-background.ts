import { NativeEventEmitter, NativeModules, PermissionsAndroid, Platform } from 'react-native';
import { recordActivityState } from '@/services/auth-api';

let AsyncStorage: { getItem: (key: string) => Promise<string | null> } | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
} catch {
  AsyncStorage = null;
}

type MotionPayload = {
  state: 'MOVING' | 'IDLE' | 'WALKING' | string;
  source?: string;
  accelerometerVariance?: number;
  idleRatio?: number;
  sampleCount?: number;
  timestamp?: number;
  deviceMotionAvailable?: boolean;
};

type MotionNativeModule = {
  startService?: () => void;
  stopService?: () => void;
};

const SESSION_KEY = 'rakshitartha_session';
const BACKEND_USER_ID_KEY = 'rakshitartha_backend_user_id';
const MIN_SEND_INTERVAL_MS = 45_000;
const MotionBackgroundNative: MotionNativeModule | undefined = NativeModules.MotionBackground;

let listenerSub: { remove: () => void } | null = null;
let lastSentAt = 0;
let lastState = '';

function normalizePayload(input: unknown): MotionPayload {
  const obj = (input || {}) as Record<string, unknown>;
  return {
    state: String(obj.state || 'IDLE').toUpperCase(),
    source: String(obj.source || 'foreground-service'),
    accelerometerVariance: Number(obj.accelerometerVariance || 0),
    idleRatio: Number(obj.idleRatio || 0),
    sampleCount: Number(obj.sampleCount || 0),
    timestamp: Number(obj.timestamp || Date.now()),
    deviceMotionAvailable: Boolean(obj.deviceMotionAvailable),
  };
}

async function resolveBackendUserId(): Promise<string | null> {
  if (!AsyncStorage) return null;

  const fromDirect = await AsyncStorage.getItem(BACKEND_USER_ID_KEY);
  if (fromDirect && fromDirect.trim()) return fromDirect.trim();

  const sessionRaw = await AsyncStorage.getItem(SESSION_KEY);
  if (!sessionRaw) return null;

  try {
    const parsed = JSON.parse(sessionRaw) as { backendUserId?: string };
    return parsed.backendUserId?.trim() || null;
  } catch {
    return null;
  }
}

async function sendMotionStatus(payload: MotionPayload) {
  const backendUserId = await resolveBackendUserId();
  if (!backendUserId) return;

  await recordActivityState(backendUserId, {
    state: payload.state,
    recordedAt: new Date(payload.timestamp || Date.now()).toISOString(),
    source: payload.source || 'foreground-service',
    accelerometerVariance: Number((payload.accelerometerVariance || 0).toFixed(4)),
    idleRatio: Number((payload.idleRatio || 0).toFixed(4)),
    sampleCount: payload.sampleCount || 0,
    deviceMotionAvailable: payload.deviceMotionAvailable !== false,
    motionConsistencyScore: Math.max(
      0,
      Math.min(
        1,
        Number((((payload.accelerometerVariance || 0) * 3.0) + ((1 - (payload.idleRatio || 0)) * 0.4)).toFixed(4))
      )
    ),
  });
}

async function processMotionPayload(raw: unknown, force = false) {
  const payload = normalizePayload(raw);
  const now = Date.now();
  const stateChanged = payload.state !== lastState;

  if (!force && !stateChanged && now - lastSentAt < MIN_SEND_INTERVAL_MS) {
    return;
  }

  try {
    await sendMotionStatus(payload);
    lastSentAt = now;
    lastState = payload.state;
  } catch {
    // Ignore transient network failures and keep service alive.
  }
}

async function requestAndroidPermissions() {
  if (Platform.OS !== 'android') return;

  try {
    if (Platform.Version >= 29) {
      await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION);
    }
    if (Platform.Version >= 33) {
      await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    }
  } catch {
    // Permissions denial should not crash startup.
  }
}

export async function bootstrapMotionBackground() {
  if (Platform.OS !== 'android') return;

  await requestAndroidPermissions();
  MotionBackgroundNative?.startService?.();

  if (!listenerSub && MotionBackgroundNative) {
    const emitter = new NativeEventEmitter(MotionBackgroundNative as object);
    listenerSub = emitter.addListener('MotionStateChanged', (event) => {
      processMotionPayload(event);
    });
  }
}

export function stopMotionBackground() {
  listenerSub?.remove();
  listenerSub = null;
  MotionBackgroundNative?.stopService?.();
}

export async function motionHeadlessTask(data: unknown) {
  await processMotionPayload(data, true);
}
