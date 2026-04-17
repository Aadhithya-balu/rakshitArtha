declare module 'wouter/src/memory-location' {
  import type { LocationHook, SearchHook } from 'wouter';

  export function memoryLocation(options?: {
    path?: string;
    searchPath?: string;
    static?: boolean;
    record?: boolean;
  }): {
    hook: LocationHook;
    searchHook: SearchHook;
    navigate: (to: string, options?: { replace?: boolean; state?: unknown; transition?: boolean }) => void;
  };
}
