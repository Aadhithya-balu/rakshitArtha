import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { useLocation } from 'wouter';
import { MobileLayout } from '@/components/layout/MobileLayout';
import { useAuth } from '@/context/AuthContext';
import { useTheme, ThemePreference } from '@/context/ThemeContext';
import { api } from '@/services/api';
import { usePolicy, useRiskSnapshot } from '@/hooks/use-api';
import { radius, shadow } from '@/theme/tokens';

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function parseHourToken(token: string): number | null {
  const normalized = token.trim().toUpperCase();
  const match = normalized.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const suffix = match[3];

  if (minute < 0 || minute > 59) return null;
  if (suffix) {
    if (hour < 1 || hour > 12) return null;
    if (suffix === 'PM' && hour < 12) hour += 12;
    if (suffix === 'AM' && hour === 12) hour = 0;
  } else if (hour === 24 && minute === 0) {
    hour = 0;
  } else if (hour < 0 || hour > 23) {
    return null;
  }

  return hour + (minute / 60);
}

function parseWorkingHoursRange(value: string) {
  if (!value || typeof value !== 'string') return null;
  const normalized = value.replace(/[–—]/g, '-').replace(/\bTO\b/gi, '-').trim();
  if (!normalized.includes('-')) return null;
  const [startRaw, endRaw] = normalized.split('-').map((part) => part.trim());
  if (!startRaw || !endRaw) return null;
  const start = parseHourToken(startRaw);
  const end = parseHourToken(endRaw);
  if (start == null || end == null) return null;

  const isOvernight = end <= start;
  const duration = isOvernight ? (24 - start) + end : end - start;
  if (duration <= 0 || duration > 16) return null;

  const shiftType = start >= 20 || start < 6 || end <= 6 ? 'Night Shift' : 'Day Shift';
  const shiftRiskMultiplier = shiftType === 'Night Shift' ? 1.2 : 1;
  const intervals = isOvernight
    ? [
        { start, end: 24 },
        { start: 0, end }
      ]
    : [{ start, end }];

  return {
    start,
    end,
    isOvernight,
    duration,
    shiftType,
    shiftRiskMultiplier,
    intervals,
    normalized: `${startRaw} - ${endRaw}`,
  };
}

function formatHour(decimalHour: number): string {
  const totalMinutes = Math.round(decimalHour * 60);
  const hour24 = Math.floor(totalMinutes / 60) % 24;
  const minute = totalMinutes % 60;
  const suffix = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function riskLabelFromScore(score: number | null) {
  if (score == null) return 'Unknown';
  if (score >= 70) return 'High';
  if (score >= 40) return 'Medium';
  return 'Low';
}

export default function Profile() {
  const { user, updateUser } = useAuth();
  const { colors, preference, setPreference, resolvedTheme } = useTheme();
  const [, navigate] = useLocation();
  const isInsurerAdmin = user?.role === 'INSURER_ADMIN';
  const identifier = { userId: user?.backendUserId, email: user?.email };
  const { data: policy } = usePolicy(identifier);
  const { data: riskSnapshot } = useRiskSnapshot(identifier);

  const [platform, setPlatform] = useState(user?.platform || '');
  const [workingHours, setWorkingHours] = useState(user?.workingHours || '');
  const [workingDays, setWorkingDays] = useState(user?.workingDays || '');
  const [avgDailyHours, setAvgDailyHours] = useState(user?.avgDailyHours || '');
  const [city, setCity] = useState(user?.city || '');
  const [deliveryZone, setDeliveryZone] = useState(user?.deliveryZone || '');
  const [zoneType, setZoneType] = useState(user?.zoneType || '');
  const [dailyIncome, setDailyIncome] = useState(user?.dailyIncome ? String(user.dailyIncome) : '');
  const [activityConsent, setActivityConsent] = useState(Boolean(user?.activityConsent));
  const [weatherCrossCheckConsent, setWeatherCrossCheckConsent] = useState(user?.weatherCrossCheckConsent !== false);
  const [saved, setSaved] = useState('');
  const [workingHoursError, setWorkingHoursError] = useState('');
  const [estimate, setEstimate] = useState<null | {
    estimatedLoss: number;
    payout: number;
    reason?: string;
    overlapHours?: number;
    overlapRatio?: number;
    grossEstimatedLoss?: number;
    shiftType?: string;
  }>(null);
  const [estimateLoading, setEstimateLoading] = useState(false);

  const parsedWorkingHours = useMemo(() => parseWorkingHoursRange(workingHours), [workingHours]);
  const dailyIncomeNumber = Number(dailyIncome || user?.dailyIncome || 0);
  const riskScore = riskSnapshot?.overallRisk ?? null;

  useEffect(() => {
    let cancelled = false;
    async function loadEstimate() {
      if (!identifier.userId || !parsedWorkingHours) {
        setEstimate(null);
        return;
      }

      setEstimateLoading(true);
      try {
        const data = await api.getProtectionEstimate(identifier, Math.max(dailyIncomeNumber, 0));
        if (!cancelled) {
          setEstimate({
            estimatedLoss: data.estimatedLoss,
            payout: data.payout,
            reason: data.reason,
            overlapHours: data.overlapHours,
            overlapRatio: data.overlapRatio,
            grossEstimatedLoss: data.grossEstimatedLoss,
            shiftType: data.shiftType,
          });
        }
      } catch {
        if (!cancelled) setEstimate(null);
      } finally {
        if (!cancelled) setEstimateLoading(false);
      }
    }

    loadEstimate();
    return () => {
      cancelled = true;
    };
  }, [dailyIncomeNumber, identifier.userId, parsedWorkingHours]);

  const estimatedLoss = estimate?.grossEstimatedLoss ?? estimate?.estimatedLoss ?? 0;
  const estimatedPayout = estimate?.payout ?? 0;
  const overlapRatio = estimate?.overlapRatio ?? 0;
  const impactReason = estimate?.reason || (overlapRatio <= 0 ? 'No disruption during working hours' : 'Estimated from current risk and working-hours overlap.');

  useEffect(() => {
    setPlatform(user?.platform || '');
    setWorkingHours(user?.workingHours || '');
    setWorkingDays(user?.workingDays || '');
    setAvgDailyHours(user?.avgDailyHours || '');
    setCity(user?.city || '');
    setDeliveryZone(user?.deliveryZone || '');
    setZoneType(user?.zoneType || '');
    setDailyIncome(user?.dailyIncome ? String(user.dailyIncome) : '');
    setActivityConsent(Boolean(user?.activityConsent));
    setWeatherCrossCheckConsent(user?.weatherCrossCheckConsent !== false);
  }, [user]);

  const styles = useMemo(() => StyleSheet.create({
    section: {
      marginHorizontal: 16,
      marginTop: 14,
      borderRadius: radius['2xl'],
      borderWidth: 1,
      borderColor: colors.cardBorder,
      backgroundColor: colors.card,
      padding: 14,
      ...shadow.sm,
    },
    sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.foreground, marginBottom: 10 },
    label: { fontSize: 12, fontWeight: '600', color: colors.foreground, marginBottom: 6, marginTop: 10 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.xl,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: colors.foreground,
      backgroundColor: colors.secondary,
      fontSize: 14,
    },
    row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    chip: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: colors.card,
    },
    chipActive: { borderColor: colors.primary, backgroundColor: `${colors.primary}22` },
    chipText: { color: colors.foreground, fontSize: 12, fontWeight: '600' },
    chipTextActive: { color: colors.primary },
    saveBtn: {
      marginTop: 14,
      backgroundColor: colors.primary,
      borderRadius: radius.xl,
      paddingVertical: 12,
      alignItems: 'center',
      ...shadow.primary,
    },
    saveText: { color: '#fff', fontSize: 14, fontWeight: '700' },
    success: { marginTop: 10, color: colors.success, fontSize: 12, fontWeight: '600' },
    helper: { marginTop: 6, color: colors.mutedForeground, fontSize: 11 },
    error: { marginTop: 6, color: colors.danger, fontSize: 12, fontWeight: '600' },
    impactCard: {
      marginTop: 12,
      borderRadius: radius.xl,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.secondary,
    },
    impactTitle: { color: colors.foreground, fontSize: 13, fontWeight: '700', marginBottom: 8 },
    impactRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
    impactKey: { color: colors.mutedForeground, fontSize: 12 },
    impactValue: { color: colors.foreground, fontSize: 12, fontWeight: '700' },
    kycBtn: {
      marginTop: 10,
      borderWidth: 1,
      borderColor: colors.primary,
      borderRadius: radius.xl,
      paddingVertical: 10,
      alignItems: 'center',
    },
    kycBtnText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  }), [colors]);

  const onSave = () => {
    if (workingHours.trim() && !parsedWorkingHours) {
      setWorkingHoursError('Use a valid range like 9 AM - 6 PM, 09:30-18:00, or 22:00 - 06:00.');
      return;
    }

    setWorkingHoursError('');
    updateUser({
      platform,
      workingHours,
      workingDays,
      avgDailyHours,
      city,
      deliveryZone,
      zoneType,
      dailyIncome: dailyIncome ? Number(dailyIncome) : undefined,
      activityConsent,
      weatherCrossCheckConsent,
    });
    setSaved('Profile updated successfully.');
  };

  const themeOptions: ThemePreference[] = ['system', 'light', 'dark'];

  return (
    <MobileLayout title="Profile" showBack>
      <ScrollView contentContainerStyle={{ paddingBottom: 16 }}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Theme Preference</Text>
          <View style={styles.row}>
            {themeOptions.map(t => (
              <TouchableOpacity key={t} onPress={() => setPreference(t)} style={[styles.chip, preference === t && styles.chipActive]}>
                <Text style={[styles.chipText, preference === t && styles.chipTextActive]}>{t.toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.helper}>Current theme: {resolvedTheme.toUpperCase()}</Text>
        </View>

        {!isInsurerAdmin && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Working Details</Text>

          <Text style={styles.label}>Platform</Text>
          <TextInput style={styles.input} value={platform} onChangeText={setPlatform} placeholder="Swiggy / Zomato" placeholderTextColor={colors.mutedForeground} />

          <Text style={styles.label}>Working Hours</Text>
          <TextInput style={styles.input} value={workingHours} onChangeText={setWorkingHours} placeholder="e.g. 2 PM - 10 PM" placeholderTextColor={colors.mutedForeground} />
          {!!workingHoursError && <Text style={styles.error}>{workingHoursError}</Text>}
          {!!parsedWorkingHours && (
            <Text style={styles.helper}>
              Working Hours: {formatHour(parsedWorkingHours.start)} - {formatHour(parsedWorkingHours.end)} ({parsedWorkingHours.duration.toFixed(1)} hrs) | Shift Type: {parsedWorkingHours.shiftType}
            </Text>
          )}

          <Text style={styles.label}>Working Days</Text>
          <TextInput style={styles.input} value={workingDays} onChangeText={setWorkingDays} placeholder="Weekdays / Full Week" placeholderTextColor={colors.mutedForeground} />

          <Text style={styles.label}>Average Daily Hours</Text>
          <TextInput style={styles.input} value={avgDailyHours} onChangeText={setAvgDailyHours} keyboardType="numeric" placeholder="e.g. 8" placeholderTextColor={colors.mutedForeground} />

          <Text style={styles.label}>City</Text>
          <TextInput style={styles.input} value={city} onChangeText={setCity} placeholder="e.g. Bengaluru" placeholderTextColor={colors.mutedForeground} />

          <Text style={styles.label}>Delivery Zone</Text>
          <TextInput style={styles.input} value={deliveryZone} onChangeText={setDeliveryZone} placeholder="e.g. Koramangala" placeholderTextColor={colors.mutedForeground} />

          <Text style={styles.label}>Zone Type</Text>
          <TextInput style={styles.input} value={zoneType} onChangeText={setZoneType} placeholder="Urban / Suburban / Rural" placeholderTextColor={colors.mutedForeground} />

          <Text style={styles.label}>Daily Income</Text>
          <TextInput style={styles.input} value={dailyIncome} onChangeText={setDailyIncome} keyboardType="numeric" placeholder="e.g. 1200" placeholderTextColor={colors.mutedForeground} />

          <Text style={styles.label}>Motion Activity Consent</Text>
          <View style={styles.row}>
            {[
              { label: 'Allow', value: true },
              { label: 'Not Now', value: false },
            ].map(option => (
              <TouchableOpacity key={option.label} onPress={() => setActivityConsent(option.value)} style={[styles.chip, activityConsent === option.value && styles.chipActive]}>
                <Text style={[styles.chipText, activityConsent === option.value && styles.chipTextActive]}>{option.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.helper}>Lets the app send accelerometer variance, idle ratio, and foreground app time to validate real work effort.</Text>

          <Text style={styles.label}>Trusted Weather Cross-Check</Text>
          <View style={styles.row}>
            {[
              { label: 'Enabled', value: true },
              { label: 'Disabled', value: false },
            ].map(option => (
              <TouchableOpacity key={option.label} onPress={() => setWeatherCrossCheckConsent(option.value)} style={[styles.chip, weatherCrossCheckConsent === option.value && styles.chipActive]}>
                <Text style={[styles.chipText, weatherCrossCheckConsent === option.value && styles.chipTextActive]}>{option.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.helper}>Uses multiple weather providers and official-source hooks before approving disruption payouts.</Text>

          {!!parsedWorkingHours && (
            <View style={styles.impactCard}>
              <Text style={styles.impactTitle}>Working Hours Risk Impact</Text>
              <View style={styles.impactRow}>
                <Text style={styles.impactKey}>Risk Level</Text>
                <Text style={styles.impactValue}>{riskLabelFromScore(riskScore)}</Text>
              </View>
              <View style={styles.impactRow}>
                <Text style={styles.impactKey}>Estimated Payout</Text>
                <Text style={styles.impactValue}>₹{estimatedPayout.toLocaleString()}</Text>
              </View>
              <View style={styles.impactRow}>
                <Text style={styles.impactKey}>Estimated Loss</Text>
                <Text style={styles.impactValue}>₹{estimatedLoss.toLocaleString()}</Text>
              </View>
              <View style={styles.impactRow}>
                <Text style={styles.impactKey}>Weekly Premium</Text>
                <Text style={styles.impactValue}>₹{Number(policy?.weeklyPremium || 0).toLocaleString()}</Text>
              </View>
              <View style={styles.impactRow}>
                <Text style={styles.impactKey}>Overlap</Text>
                <Text style={styles.impactValue}>{Number((overlapRatio * 100).toFixed(0))}%</Text>
              </View>
              <Text style={styles.helper}>{estimateLoading ? 'Refreshing estimate...' : impactReason}</Text>
            </View>
          )}

          <TouchableOpacity onPress={onSave} style={styles.saveBtn}>
            <Text style={styles.saveText}>Save Profile</Text>
          </TouchableOpacity>

          {!!saved && <Text style={styles.success}>{saved}</Text>}

          <TouchableOpacity onPress={() => navigate('/dashboard/kyc')} style={styles.kycBtn}>
            <Text style={styles.kycBtnText}>{user?.kycVerified ? 'View KYC Status' : 'Complete KYC Verification'}</Text>
          </TouchableOpacity>
        </View>
        )}

        {isInsurerAdmin && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Insurer Account</Text>

            <Text style={styles.label}>Name</Text>
            <TextInput style={styles.input} value={user?.name || ''} editable={false} />

            <Text style={styles.label}>Email</Text>
            <TextInput style={styles.input} value={user?.email || ''} editable={false} />

            <Text style={styles.label}>Role</Text>
            <TextInput style={styles.input} value={user?.role || 'INSURER_ADMIN'} editable={false} />

            <Text style={styles.label}>Account Status</Text>
            <TextInput style={styles.input} value={user?.accountStatus || 'ACTIVE'} editable={false} />

            <Text style={styles.helper}>All account details above are synced from backend profile data.</Text>
          </View>
        )}
      </ScrollView>
    </MobileLayout>
  );
}
