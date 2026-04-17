import React from 'react';
import {
  TouchableOpacity, Text, ActivityIndicator,
  StyleSheet, ViewStyle, TextStyle,
} from 'react-native';
import { colors, radius, shadow } from '@/theme/tokens';

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'glass';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps {
  onPress?: () => void;
  children: React.ReactNode;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  accessibilityLabel?: string;
}

const variantStyles: Record<Variant, { container: ViewStyle; text: TextStyle }> = {
  primary: {
    container: { backgroundColor: colors.primary, ...shadow.primary },
    text: { color: colors.primaryForeground, fontWeight: '700' },
  },
  secondary: {
    container: { backgroundColor: colors.secondary, borderWidth: 1, borderColor: colors.border },
    text: { color: colors.foreground, fontWeight: '600' },
  },
  ghost: {
    container: { backgroundColor: 'transparent' },
    text: { color: colors.foreground, fontWeight: '500' },
  },
  destructive: {
    container: { backgroundColor: colors.destructive },
    text: { color: '#fff', fontWeight: '700' },
  },
  glass: {
    container: { backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
    text: { color: '#fff', fontWeight: '700' },
  },
};

const sizeStyles: Record<Size, { container: ViewStyle; text: TextStyle }> = {
  sm: { container: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.lg }, text: { fontSize: 12 } },
  md: { container: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: radius.xl }, text: { fontSize: 14 } },
  lg: { container: { paddingHorizontal: 28, paddingVertical: 16, borderRadius: radius['2xl'] }, text: { fontSize: 16 } },
};

export function Button({
  onPress, children, variant = 'primary', size = 'md',
  disabled, loading, style, textStyle, accessibilityLabel,
}: ButtonProps) {
  const v = variantStyles[variant];
  const s = sizeStyles[size];
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.base, v.container, s.container,
        (disabled || loading) && styles.disabled,
        style,
      ]}
    >
      {loading
        ? <ActivityIndicator color={v.text.color as string} size="small" />
        : typeof children === 'string'
          ? <Text style={[styles.text, v.text, s.text, textStyle]}>{children}</Text>
          : children}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  text: { fontSize: 14 },
  disabled: { opacity: 0.5 },
});
