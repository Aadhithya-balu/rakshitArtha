import React from 'react';
import { TextInput, View, Text, StyleSheet, TextInputProps, ViewStyle } from 'react-native';
import { colors, radius } from '@/theme/tokens';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  containerStyle?: ViewStyle;
  prefix?: string;
}

export function Input({ label, error, containerStyle, prefix, style, ...props }: InputProps) {
  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.inputRow}>
        {prefix && <Text style={styles.prefix}>{prefix}</Text>}
        <TextInput
          style={[styles.input, prefix && styles.inputWithPrefix, error && styles.inputError, style]}
          placeholderTextColor={colors.mutedForeground}
          accessibilityLabel={label}
          {...props}
        />
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 6 },
  label: { fontSize: 12, fontWeight: '600', color: colors.foreground },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  prefix: {
    position: 'absolute', left: 12, zIndex: 1,
    fontSize: 14, fontWeight: '600', color: colors.mutedForeground,
  },
  input: {
    flex: 1,
    paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.secondary,
    color: colors.foreground, fontSize: 14,
  },
  inputWithPrefix: { paddingLeft: 36 },
  inputError: { borderColor: colors.destructive },
  error: { fontSize: 11, color: colors.destructive },
});
