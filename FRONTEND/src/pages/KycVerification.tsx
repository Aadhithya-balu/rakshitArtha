import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { MobileLayout } from '@/components/layout/MobileLayout';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { verifyKyc } from '@/services/auth-api';
import { radius, shadow } from '@/theme/tokens';

const DOC_TYPES = ['AADHAR', 'PAN', 'DRIVING_LICENSE'] as const;

export default function KycVerification() {
  const { user, updateUser } = useAuth();
  const { colors } = useTheme();
  const [docType, setDocType] = useState<(typeof DOC_TYPES)[number]>('AADHAR');
  const [docId, setDocId] = useState('');
  const [fullName, setFullName] = useState(user?.name || '');
  const [dob, setDob] = useState('');
  const [consentChecked, setConsentChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const validateDoc = (type: (typeof DOC_TYPES)[number], value: string) => {
    const v = value.trim().toUpperCase();
    if (type === 'AADHAR') return /^\d{12}$/.test(v);
    if (type === 'PAN') return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v);
    return v.length >= 10;
  };

  const isValidDob = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const dt = new Date(`${value}T00:00:00`);
    if (Number.isNaN(dt.getTime())) return false;
    const age = new Date().getFullYear() - dt.getFullYear();
    return age >= 18;
  };

  const styles = useMemo(() => StyleSheet.create({
    card: {
      marginHorizontal: 16,
      marginTop: 14,
      borderRadius: radius['2xl'],
      borderWidth: 1,
      borderColor: colors.cardBorder,
      backgroundColor: colors.card,
      padding: 14,
      ...shadow.sm,
    },
    title: { fontSize: 14, fontWeight: '700', color: colors.foreground, marginBottom: 8 },
    subtitle: { fontSize: 12, color: colors.mutedForeground, marginBottom: 12 },
    row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 12 },
    chip: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: colors.card,
    },
    chipActive: { borderColor: colors.primary, backgroundColor: `${colors.primary}22` },
    chipText: { fontSize: 12, fontWeight: '600', color: colors.foreground },
    chipTextActive: { color: colors.primary },
    label: { fontSize: 12, fontWeight: '600', color: colors.foreground, marginBottom: 6 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.xl,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: colors.foreground,
      backgroundColor: colors.secondary,
      fontSize: 14,
      marginBottom: 12,
    },
    submitBtn: {
      backgroundColor: colors.primary,
      borderRadius: radius.xl,
      paddingVertical: 12,
      alignItems: 'center',
      ...shadow.primary,
    },
    submitText: { color: '#fff', fontSize: 14, fontWeight: '700' },
    statusOk: { marginTop: 12, color: colors.success, fontSize: 12, fontWeight: '600' },
    statusWarn: { marginTop: 12, color: colors.warning, fontSize: 12, fontWeight: '600' },
  }), [colors]);

  const submitKyc = async () => {
    setMessage('');
    if (!fullName.trim() || fullName.trim().length < 2) {
      setMessage('Please enter your full legal name.');
      return;
    }

    if (!isValidDob(dob.trim())) {
      setMessage('Date of birth must be in YYYY-MM-DD format and age should be 18+ years.');
      return;
    }

    if (!validateDoc(docType, docId)) {
      setMessage(
        docType === 'AADHAR'
          ? 'Aadhar must be exactly 12 digits.'
          : docType === 'PAN'
            ? 'PAN format must be like ABCDE1234F.'
            : 'Driving license number looks invalid.'
      );
      return;
    }

    if (!consentChecked) {
      setMessage('Please confirm that this document belongs to you.');
      return;
    }

    if (!user?.backendUserId) {
      updateUser({ accountStatus: 'VERIFICATION_PENDING', kycVerified: false });
      setMessage('KYC submitted offline. It will be synced when backend ID is available.');
      return;
    }

    try {
      setLoading(true);
      await verifyKyc(user.backendUserId, docType, docId.trim());
      updateUser({ kycVerified: true, accountStatus: 'VERIFIED' });
      setMessage('KYC verified successfully.');
    } catch {
      updateUser({ kycVerified: false, accountStatus: 'VERIFICATION_PENDING' });
      setMessage('KYC submitted. Verification is in progress.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <MobileLayout title="KYC Verification" showBack>
      <View style={styles.card}>
        <Text style={styles.title}>Verify Your Identity</Text>
        <Text style={styles.subtitle}>
          Current status: {user?.kycVerified ? 'VERIFIED' : user?.accountStatus || 'VERIFICATION_PENDING'}
        </Text>

        <View style={styles.row}>
          {DOC_TYPES.map(type => (
            <TouchableOpacity key={type} onPress={() => setDocType(type)} style={[styles.chip, docType === type && styles.chipActive]}>
              <Text style={[styles.chipText, docType === type && styles.chipTextActive]}>{type}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Document Number</Text>
        <TextInput
          style={styles.input}
          value={fullName}
          onChangeText={setFullName}
          placeholder="Full legal name"
          placeholderTextColor={colors.mutedForeground}
        />

        <Text style={styles.label}>Date of Birth (YYYY-MM-DD)</Text>
        <TextInput
          style={styles.input}
          value={dob}
          onChangeText={setDob}
          placeholder="1998-08-21"
          placeholderTextColor={colors.mutedForeground}
        />

        <Text style={styles.label}>Document Number</Text>
        <TextInput
          style={styles.input}
          value={docId}
          onChangeText={setDocId}
          placeholder={docType === 'AADHAR' ? '12 digit Aadhar number' : docType === 'PAN' ? 'ABCDE1234F' : 'DL number'}
          placeholderTextColor={colors.mutedForeground}
          autoCapitalize="characters"
        />

        <TouchableOpacity
          onPress={() => setConsentChecked(v => !v)}
          style={[styles.chip, consentChecked && styles.chipActive, { marginBottom: 12, alignSelf: 'flex-start' }]}
        >
          <Text style={[styles.chipText, consentChecked && styles.chipTextActive]}>
            {consentChecked ? 'Identity consent confirmed' : 'I confirm this document belongs to me'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={submitKyc} style={styles.submitBtn} disabled={loading}>
          <Text style={styles.submitText}>{loading ? 'Verifying...' : 'Submit KYC'}</Text>
        </TouchableOpacity>

        {!!message && (
          <Text style={user?.kycVerified ? styles.statusOk : styles.statusWarn}>{message}</Text>
        )}
      </View>
    </MobileLayout>
  );
}
