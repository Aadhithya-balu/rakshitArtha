import { AppState, AppStateStatus } from 'react-native';
import { accelerometer, setUpdateIntervalForType, SensorTypes } from 'react-native-sensors';

type TelemetrySnapshot = {
  accelerometerVariance: number | null;
  idleRatio: number | null;
  foregroundAppMinutes: number | null;
  motionConsistencyScore: number | null;
  sampleCount: number;
  collectedAt: string | null;
  deviceMotionAvailable: boolean;
};

const SAMPLE_WINDOW = 180;
const IDLE_THRESHOLD = 0.12;

class ActivityTelemetryService {
  private appState: AppStateStatus = AppState.currentState;
  private appStateSubscription: { remove: () => void } | null = null;
  private sensorSubscription: { unsubscribe?: () => void } | null = null;
  private foregroundStartMs: number | null = null;
  private foregroundAccumulatedMs = 0;
  private magnitudes: number[] = [];
  private active = false;
  private motionAvailable = false;

  start() {
    if (this.active) return;
    this.active = true;
    this.appState = AppState.currentState;
    if (this.appState === 'active') {
      this.foregroundStartMs = Date.now();
    }

    this.appStateSubscription = AppState.addEventListener('change', this.onAppStateChange);

    try {
      setUpdateIntervalForType(SensorTypes.accelerometer, 1000);
      this.sensorSubscription = accelerometer.subscribe({
        next: ({ x, y, z }) => {
          this.motionAvailable = true;
          const magnitude = Math.sqrt(x * x + y * y + z * z);
          this.magnitudes.push(magnitude);
          if (this.magnitudes.length > SAMPLE_WINDOW) {
            this.magnitudes.shift();
          }
        },
        error: () => {
          this.motionAvailable = false;
        },
      });
    } catch {
      this.motionAvailable = false;
    }
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    if (this.foregroundStartMs) {
      this.foregroundAccumulatedMs += Date.now() - this.foregroundStartMs;
      this.foregroundStartMs = null;
    }
    this.appStateSubscription?.remove();
    this.appStateSubscription = null;
    this.sensorSubscription?.unsubscribe?.();
    this.sensorSubscription = null;
  }

  reset() {
    this.stop();
    this.magnitudes = [];
    this.foregroundAccumulatedMs = 0;
    this.motionAvailable = false;
  }

  getSnapshot(): TelemetrySnapshot {
    const sampleCount = this.magnitudes.length;
    const mean = sampleCount ? this.magnitudes.reduce((sum, value) => sum + value, 0) / sampleCount : 0;
    const variance = sampleCount
      ? this.magnitudes.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / sampleCount
      : 0;
    const idleSamples = sampleCount
      ? this.magnitudes.filter((value) => Math.abs(value - mean) < IDLE_THRESHOLD).length
      : 0;
    const foregroundMs = this.foregroundAccumulatedMs + (this.foregroundStartMs ? Date.now() - this.foregroundStartMs : 0);
    const foregroundAppMinutes = foregroundMs / 60000;
    const idleRatio = sampleCount ? idleSamples / sampleCount : null;
    const accelerometerVariance = sampleCount ? variance : null;
    const motionConsistencyScore = sampleCount
      ? Math.max(0, Math.min(1, (variance * 3.2) + ((1 - (idleRatio ?? 1)) * 0.45) + Math.min(foregroundAppMinutes / 180, 0.15)))
      : null;

    return {
      accelerometerVariance: accelerometerVariance != null ? Number(accelerometerVariance.toFixed(4)) : null,
      idleRatio: idleRatio != null ? Number(idleRatio.toFixed(4)) : null,
      foregroundAppMinutes: Number(foregroundAppMinutes.toFixed(2)),
      motionConsistencyScore: motionConsistencyScore != null ? Number(motionConsistencyScore.toFixed(4)) : null,
      sampleCount,
      collectedAt: new Date().toISOString(),
      deviceMotionAvailable: this.motionAvailable,
    };
  }

  private onAppStateChange = (nextState: AppStateStatus) => {
    if (this.appState === 'active' && nextState !== 'active' && this.foregroundStartMs) {
      this.foregroundAccumulatedMs += Date.now() - this.foregroundStartMs;
      this.foregroundStartMs = null;
    }
    if (this.appState !== 'active' && nextState === 'active') {
      this.foregroundStartMs = Date.now();
    }
    this.appState = nextState;
  };
}

export const activityTelemetryService = new ActivityTelemetryService();
export type { TelemetrySnapshot };
