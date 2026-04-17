import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance, ColorSchemeName } from 'react-native';
import { colors } from '@/theme/tokens';
import { useAuth } from '@/context/AuthContext';

export type ThemePreference = 'system' | 'light' | 'dark';

type ThemeColors = {
  [K in keyof typeof colors]: K extends 'dark' ? typeof colors.dark : string;
};

type ThemeContextType = {
  preference: ThemePreference;
  resolvedTheme: 'light' | 'dark';
  colors: ThemeColors;
  setPreference: (next: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextType | null>(null);

function resolveTheme(preference: ThemePreference, system: ColorSchemeName): 'light' | 'dark' {
  if (preference === 'system') return system === 'dark' ? 'dark' : 'light';
  return preference;
}

function buildColors(mode: 'light' | 'dark'): ThemeColors {
  if (mode === 'light') return colors as unknown as ThemeColors;
  return {
    ...colors,
    ...colors.dark,
  } as ThemeColors;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { user, updateUser } = useAuth();
  const [systemTheme, setSystemTheme] = useState<ColorSchemeName>(Appearance.getColorScheme());
  const [preference, setPreferenceState] = useState<ThemePreference>(user?.themePreference || 'system');

  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => setSystemTheme(colorScheme));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    setPreferenceState(user?.themePreference || 'system');
  }, [user?.themePreference]);

  const resolvedTheme = resolveTheme(preference, systemTheme);
  const themeColors = useMemo(() => buildColors(resolvedTheme), [resolvedTheme]);

  const setPreference = (next: ThemePreference) => {
    setPreferenceState(next);
    updateUser({ themePreference: next });
  };

  return (
    <ThemeContext.Provider value={{ preference, resolvedTheme, colors: themeColors, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
