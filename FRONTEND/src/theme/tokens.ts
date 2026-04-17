// Design tokens mirroring the web app HSL values as hex/rgba for RN StyleSheet use
export const colors = {
  // Light theme
  background: '#f5f8fc',
  foreground: '#0b1220',
  card: '#ffffff',
  cardForeground: '#0b1220',
  cardBorder: '#d1d9e6',
  primary: '#ea580c',
  primaryForeground: '#ffffff',
  secondary: '#e9eef5',
  muted: '#edf2f8',
  mutedForeground: '#475569',
  accent: '#e2e8f0',
  destructive: '#dc2626',
  success: '#16a34a',
  warning: '#d97706',
  border: '#d6deea',
  ring: '#ea580c',
  sidebar: '#0f172a',
  sidebarForeground: '#f8fafc',
  sidebarPrimary: '#ea580c',
  sidebarBorder: '#1e293b',

  // Semantic
  riskHigh: '#ef4444',
  riskMedium: '#f59e0b',
  riskLow: '#22c55e',

  // Dark theme overrides (used via theme context)
  dark: {
    background: '#030712',
    foreground: '#e5edf7',
    card: '#0f172a',
    cardForeground: '#e5edf7',
    cardBorder: '#243247',
    secondary: '#172033',
    muted: '#172033',
    mutedForeground: '#9fb1c8',
    border: '#2a3a52',
    sidebar: '#020617',
  },
} as const;

export const radius = {
  sm: 8,
  md: 10,
  lg: 12,   // 0.75rem base
  xl: 16,
  '2xl': 20,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
} as const;

export const fontSize = {
  xs: 10,
  sm: 12,
  base: 14,
  md: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
} as const;

export const fontWeight = {
  normal: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
};

export const shadow = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  primary: {
    shadowColor: '#f97316',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
} as const;
