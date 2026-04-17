import { AppState, AppStateStatus } from 'react-native';

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
  private foregroundStartMs: number | null = null;
  private foregroundAccumulatedMs = 0;
  private active = false;

  start() {
    if (this.active) return;
    this.active = true;
    this.appState = AppState.currentState;
    if (this.appState === 'active') {
      this.foregroundStartMs = Date.now();
    }

    this.appStateSubscription = AppState.addEventListener('change', this.onAppStateChange);
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
  }

  reset() {
    this.stop();
    this.foregroundAccumulatedMs = 0;
  }

  getSnapshot(): TelemetrySnapshot {
    const foregroundMs = this.foregroundAccumulatedMs + (this.foregroundStartMs ? Date.now() - this.foregroundStartMs : 0);
    const foregroundAppMinutes = foregroundMs / 60000;

    return {
      accelerometerVariance: null,
      idleRatio: null,
      foregroundAppMinutes: Number(foregroundAppMinutes.toFixed(2)),
      motionConsistencyScore: null,
      sampleCount: 0,
      collectedAt: new Date().toISOString(),
      deviceMotionAvailable: false,
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
