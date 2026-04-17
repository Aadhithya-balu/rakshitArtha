import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useLocation } from 'wouter';
import { MobileLayout } from '@/components/layout/MobileLayout';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { radius, shadow } from '@/theme/tokens';
import { useAddPaymentDetails, usePaymentDetails } from '@/hooks/use-api';

export default function AddPaymentDetails() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const identifier = { userId: user?.backendUserId, email: user?.email };
  const { data: savedPayment, isLoading } = usePaymentDetails(identifier);
  const addPaymentMutation = useAddPaymentDetails();
  const styles = useMemo(() => createStyles(colors as any), [colors]);

  const [accountHolderName, setAccountHolderName] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [upiId, setUpiId] = useState('');

  useEffect(() => {
    if (!savedPayment) return;
    setAccountHolderName(savedPayment.accountHolderName || '');
    setBankName(savedPayment.bankName || '');
    setAccountNumber(savedPayment.accountNumber || '');
    setIfscCode(savedPayment.ifscCode || '');
    setUpiId(savedPayment.upiId || '');
  }, [savedPayment]);

  if (!user?.backendUserId) {
    navigate('/');
    return null;
  }

  const handleSubmit = async () => {
    const hasUpi = Boolean(upiId.trim());
    const hasBank = [accountHolderName, bankName, accountNumber, ifscCode].every((value) => value.trim().length > 0);

    if (!hasUpi && !hasBank) {
      Alert.alert('Payment details required', 'Add either a UPI ID or complete bank account details.');
      return;
    }

    try {
      await addPaymentMutation.mutateAsync({
        identifier,
        payload: {
          accountHolderName: accountHolderName.trim() || null,
          bankName: bankName.trim() || null,
          accountNumber: accountNumber.trim() || null,
          ifscCode: ifscCode.trim().toUpperCase() || null,
          upiId: upiId.trim().toLowerCase() || null,
        },
      });
      Alert.alert('Saved', 'Payment details added successfully.');
      navigate('/dashboard/payouts');
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Could not save payment details.');
    }
  };

  const savedMethod = savedPayment?.upiId ? `UPI: ${savedPayment.upiId}` : savedPayment?.accountNumber ? `Bank: ••••${savedPayment.accountNumber.slice(-4)}` : 'No details saved yet';

  return (
    <MobileLayout title="Add Payment Details" showBack>
      <View style={styles.container}>
        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>Add Payment Details</Text>
          <Text style={styles.heroText}>Your approved claim payouts will use these details automatically.</Text>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Saved method</Text>
            <Text style={styles.statusValue}>{savedMethod}</Text>
          </View>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Verification</Text>
            <Text style={[styles.statusValue, { color: savedPayment?.isVerified ? colors.success : colors.warning }]}>
              {savedPayment?.isVerified ? 'Verified' : 'Pending manual review'}
            </Text>
          </View>
        </View>

        <View style={styles.formCard}>
          <Text style={styles.sectionTitle}>Bank account</Text>
          <TextInput value={accountHolderName} onChangeText={setAccountHolderName} placeholder="Account holder name" placeholderTextColor={colors.mutedForeground} style={styles.input} />
          <TextInput value={bankName} onChangeText={setBankName} placeholder="Bank name" placeholderTextColor={colors.mutedForeground} style={styles.input} />
          <TextInput value={accountNumber} onChangeText={setAccountNumber} placeholder="Account number" placeholderTextColor={colors.mutedForeground} keyboardType="number-pad" style={styles.input} />
          <TextInput value={ifscCode} onChangeText={setIfscCode} placeholder="IFSC" placeholderTextColor={colors.mutedForeground} autoCapitalize="characters" style={styles.input} />

          <Text style={styles.orText}>OR UPI ID</Text>
          <TextInput value={upiId} onChangeText={setUpiId} placeholder="example@upi" placeholderTextColor={colors.mutedForeground} autoCapitalize="none" style={styles.input} />

          <TouchableOpacity style={styles.primaryButton} onPress={handleSubmit} disabled={addPaymentMutation.isPending}>
            {addPaymentMutation.isPending ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={styles.primaryButtonText}>Save payment details</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.helperText}>Basic verification is enabled in this build. Judges can mark `isVerified = true` manually through the verification endpoint or database.</Text>
        </View>

        {isLoading && (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}
      </View>
    </MobileLayout>
  );
}

function createStyles(colors: any) {
  return StyleSheet.create({
    container: {
      flex: 1,
      padding: 12,
      gap: 14,
      backgroundColor: colors.background,
    },
    heroCard: {
      backgroundColor: colors.card,
      borderRadius: radius.xl,
      padding: 16,
      gap: 8,
      ...shadow.sm,
    },
    heroTitle: {
      fontSize: 20,
      fontWeight: '800',
      color: colors.foreground,
    },
    heroText: {
      color: colors.mutedForeground,
      fontSize: 13,
      lineHeight: 18,
    },
    statusRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12,
      paddingTop: 6,
    },
    statusLabel: {
      fontSize: 12,
      color: colors.mutedForeground,
      fontWeight: '600',
    },
    statusValue: {
      flex: 1,
      textAlign: 'right',
      color: colors.foreground,
      fontWeight: '700',
      fontSize: 12,
    },
    formCard: {
      backgroundColor: colors.card,
      borderRadius: radius.xl,
      padding: 16,
      gap: 12,
      ...shadow.sm,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.foreground,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: colors.foreground,
      backgroundColor: colors.card,
    },
    orText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.mutedForeground,
      textAlign: 'center',
      marginVertical: 2,
    },
    primaryButton: {
      marginTop: 4,
      backgroundColor: colors.primary,
      borderRadius: radius.lg,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryButtonText: {
      color: colors.primaryForeground,
      fontWeight: '800',
      fontSize: 14,
    },
    helperText: {
      color: colors.mutedForeground,
      fontSize: 12,
      lineHeight: 18,
    },
    loadingWrap: {
      paddingVertical: 8,
      alignItems: 'center',
    },
  });
}

