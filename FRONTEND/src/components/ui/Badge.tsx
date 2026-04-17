import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { colors, radius } from '@/theme/tokens';

type Variant = 'high' | 'medium' | 'low' | 'info' | 'default';

interface BadgeProps {
  label: string;
  variant?: Variant;
  style?: ViewStyle;
}

const variantMap: Record<Variant, { bg: string; text: string; border: string }> = {
  high:    { bg: 'rgba(239,68,68,0.2)',   text: '#fca5a5', border: 'rgba(239,68,68,0.4)' },
  medium:  { bg: 'rgba(245,158,11,0.2)',  text: '#fcd34d', border: 'rgba(245,158,11,0.4)' },
  low:     { bg: 'rgba(34,197,94,0.2)',   text: '#86efac', border: 'rgba(34,197,94,0.4)' },
  info:    { bg: 'rgba(59,130,246,0.2)',  text: '#93c5fd', border: 'rgba(59,130,246,0.4)' },
  default: { bg: colors.secondary,        text: colors.mutedForeground, border: colors.border },
};

export function Badge({ label, variant = 'default', style }: BadgeProps) {
  const v = variantMap[variant];
  return (
    <View style={[styles.badge, { backgroundColor: v.bg, borderColor: v.border }, style]}>
      <Text style={[styles.text, { color: v.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  text: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
});
