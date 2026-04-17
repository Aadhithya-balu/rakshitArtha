// Keep sync-style API surface for current callers while using persistent storage under the hood.
// If the native AsyncStorage module is unavailable, we fall back to in-memory storage instead of crashing.
const memoryFallback: Record<string, string> = {};

type AsyncStorageModule = {
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
  multiGet: (keys: string[]) => Promise<[string, string | null][]>
};

let AsyncStorage: AsyncStorageModule | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  AsyncStorage = require('@react-native-async-storage/async-storage').default as AsyncStorageModule;
} catch {
  AsyncStorage = null;
}

export const Storage = {
  getItem: (key: string): string | null => memoryFallback[key] ?? null,
  setItem: (key: string, value: string): void => {
    memoryFallback[key] = value;
    AsyncStorage?.setItem(key, value).catch(() => {});
  },
  removeItem: (key: string): void => {
    delete memoryFallback[key];
    AsyncStorage?.removeItem(key).catch(() => {});
  },
  hydrate: async (keys: string[]) => {
    if (!AsyncStorage) {
      return;
    }

    try {
      const entries = await AsyncStorage.multiGet(keys);
      entries.forEach(([k, v]) => {
        if (v != null) memoryFallback[k] = v;
      });
    } catch {}
  }
};
