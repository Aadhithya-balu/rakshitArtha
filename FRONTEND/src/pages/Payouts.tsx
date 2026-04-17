import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useLocation } from 'wouter';
import { Clock, CheckCircle2, AlertCircle, TrendingUp, Wallet, Copy, Landmark, ArrowRight } from 'lucide-react-native';
import { MobileLayout } from '@/components/layout/MobileLayout';
import { radius, shadow } from '@/theme/tokens';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { formatCurrency, formatDateTime } from '@/utils/helpers';
import { useUserPayouts, usePayoutStats, usePaymentDetails } from '@/hooks/use-api';

function getStatusColor(status: string, colors: any) {
  switch (status.toUpperCase()) {
    case 'COMPLETED': return colors.success;
    case 'PROCESSING': return colors.warning;
    case 'PENDING': return colors.mutedForeground;
    case 'FAILED': return colors.riskHigh;
    default: return colors.foreground;
  }
}

function getStatusIcon(status: string) {
  switch (status.toUpperCase()) {
    case 'COMPLETED': return CheckCircle2;
    case 'PROCESSING': return Clock;
    case 'FAILED': return AlertCircle;
    default: return Wallet;
  }
}

export default function Payouts() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const identifier = { userId: user?.backendUserId, email: user?.email };

  const { data: payouts = [], isLoading: loadingPayouts } = useUserPayouts(user?.backendUserId);
  const { data: stats, isLoading: loadingStats } = usePayoutStats();
  const { data: paymentDetails, isLoading: loadingPayment } = usePaymentDetails(identifier);

  const styles = useMemo(() => createStyles(colors as any), [colors]);

  if (!user) {
    navigate('/');
    return null;
  }


  const handleCopyTransactionId = (txnId: string) => {
    Alert.alert('Transaction ID', txnId);
  };

  const recentPayouts = payouts.slice(0, 5);
  const latestPayout = recentPayouts[0] || null;
  const totalCompleted = stats?.completedAmount || 0;
  const totalPayouts = stats?.totalPayouts || 0;
  const successRate = stats?.successRate || '0%';
  const savedMethod = paymentDetails?.upiId
    ? `UPI: ${paymentDetails.upiId}`
    : paymentDetails?.accountNumber
      ? `Bank: ••••${paymentDetails.accountNumber.slice(-4)}`
      : 'No payment details saved';

  return (
    <MobileLayout title="Payout Tracking">
      <View style={styles.container}>
        <View style={styles.summaryGrid}>
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <View style={styles.cardHeader}>
              <TrendingUp size={20} color={colors.success} />
              <Text style={styles.cardLabel}>Total Payouts</Text>
            </View>
            <Text style={styles.cardValue}>{totalPayouts}</Text>
            <Text style={styles.cardSubText}>transactions processed</Text>
          </View>

          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <View style={styles.cardHeader}>
              <Wallet size={20} color={colors.primary} />
              <Text style={styles.cardLabel}>Completed</Text>
            </View>
            <Text style={styles.cardValue}>{formatCurrency(totalCompleted)}</Text>
            <Text style={styles.cardSubText}>success rate {successRate}</Text>
          </View>
        </View>

        <View style={[styles.sectionCard, { backgroundColor: colors.card }]}>
          <View style={styles.paymentHeader}>
            <View style={styles.paymentTitleRow}>
              <Landmark size={18} color={colors.primary} />
              <Text style={styles.sectionTitle}>Saved payment details</Text>
            </View>
            <TouchableOpacity style={styles.inlineButton} onPress={() => navigate('/dashboard/payment-details')}>
              <Text style={styles.inlineButtonText}>{paymentDetails ? 'Edit' : 'Add'}</Text>
              <ArrowRight size={14} color={colors.primary} />
            </TouchableOpacity>
          </View>

          {(loadingPayment || loadingStats) && <ActivityIndicator size="small" color={colors.primary} />}

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Method</Text>
            <Text style={styles.infoValue}>{savedMethod}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Verification</Text>
            <Text style={[styles.infoValue, { color: paymentDetails?.isVerified ? colors.success : colors.warning }]}>
              {paymentDetails?.isVerified ? 'Verified' : 'Pending'}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Last payout</Text>
            <Text style={styles.infoValue}>
              {latestPayout ? `${formatCurrency(Number(latestPayout.netAmount || 0))} (${latestPayout.status})` : 'No payouts yet'}
            </Text>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Payouts</Text>
          {loadingPayouts && <ActivityIndicator size="small" color={colors.primary} />}
        </View>

        {recentPayouts.length === 0 ? (
          <View style={styles.emptyState}>
            <Wallet size={48} color={colors.mutedForeground} />
            <Text style={styles.emptyText}>No payouts yet</Text>
            <Text style={styles.emptySubText}>Save payment details now so approved claims can be paid instantly.</Text>
            <TouchableOpacity style={styles.primaryButton} onPress={() => navigate('/dashboard/payment-details')}>
              <Text style={styles.primaryButtonText}>Add payment details</Text>
            </TouchableOpacity>
          </View>
        ) : (
          recentPayouts.map((payout: any) => {
            const StatusIcon = getStatusIcon(payout.status || 'PENDING');
            const statusColor = getStatusColor(payout.status || 'PENDING', colors);

            return (
              <View key={payout.payoutId} style={[styles.payoutCard, { borderLeftColor: statusColor }]}>
                <View style={styles.payoutHeader}>
                  <View style={styles.payoutTitleRow}>
                    <StatusIcon size={18} color={statusColor} />
                    <View style={styles.payoutTitleCol}>
                      <Text style={styles.payoutTitle}>{formatCurrency(Number(payout.netAmount || 0))}</Text>
                      <Text style={[styles.payoutStatus, { color: statusColor }]}>{String(payout.status || 'PENDING').toUpperCase()}</Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => handleCopyTransactionId(String(payout.payoutId))} style={styles.copyBtn}>
                    <Copy size={16} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>

                <View style={styles.payoutMeta}>
                  <View style={styles.metaItem}>
                    <Text style={styles.metaLabel}>Method</Text>
                    <Text style={styles.metaValue}>{payout.method || 'UPI'}</Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Text style={styles.metaLabel}>Claim ID</Text>
                    <Text style={styles.metaValue}>{String(payout.claimId || '').slice(0, 8)}...</Text>
                  </View>
                </View>

                <View style={styles.payoutDetails}>
                  <Text style={styles.detailsLabel}>Transaction ID</Text>
                  <Text style={styles.txnId}>{payout.payoutId}</Text>
                </View>

                {Array.isArray(payout.statusHistory) && payout.statusHistory.length > 0 && (
                  <View style={styles.timeline}>
                    {payout.statusHistory.map((entry: any, idx: number) => (
                      <View key={idx} style={styles.timelineItem}>
                        <Text style={styles.timelineStatus}>{entry.status}</Text>
                        <Text style={styles.timelineTime}>{formatDateTime(entry.timestamp)}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })
        )}

        <View style={[styles.sectionCard, { backgroundColor: colors.card }]}>
          <Text style={styles.sectionTitle}>Payout Methods</Text>
          <View style={styles.methodsList}>
            <View style={styles.method}><Text style={styles.methodName}>Bank Transfer</Text><Text style={styles.methodTime}>24-48 hours</Text></View>
            <View style={styles.method}><Text style={styles.methodName}>UPI</Text><Text style={styles.methodTime}>Instant (5-10 min)</Text></View>
            <View style={styles.method}><Text style={styles.methodName}>Verification</Text><Text style={styles.methodTime}>Manual flag enabled</Text></View>
          </View>
        </View>
      </View>
    </MobileLayout>
  );
}

function createStyles(colors: any) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      padding: 12,
      gap: 16,
    },
    summaryGrid: {
      flexDirection: 'row',
      gap: 12,
    },
    card: {
      flex: 1,
      padding: 14,
      borderRadius: radius.lg,
      ...shadow.sm,
    },
    cardHeader: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 12,
      alignItems: 'center',
    },
    cardLabel: {
      fontSize: 12,
      color: colors.mutedForeground,
      fontWeight: '600',
    },
    cardValue: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.foreground,
      marginBottom: 4,
    },
    cardSubText: {
      fontSize: 11,
      color: colors.mutedForeground,
    },
    sectionCard: {
      borderRadius: radius.xl,
      padding: 14,
      gap: 10,
      ...shadow.sm,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.foreground,
    },
    paymentHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
    },
    paymentTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    inlineButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    inlineButtonText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.primary,
    },
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12,
    },
    infoLabel: {
      color: colors.mutedForeground,
      fontSize: 12,
      fontWeight: '600',
    },
    infoValue: {
      flex: 1,
      textAlign: 'right',
      color: colors.foreground,
      fontSize: 12,
      fontWeight: '700',
    },
    emptyState: {
      backgroundColor: colors.card,
      borderRadius: radius.xl,
      padding: 28,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      ...shadow.sm,
    },
    emptyText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.foreground,
      marginTop: 4,
    },
    emptySubText: {
      fontSize: 13,
      color: colors.mutedForeground,
      textAlign: 'center',
      lineHeight: 18,
    },
    primaryButton: {
      marginTop: 4,
      backgroundColor: colors.primary,
      borderRadius: radius.lg,
      paddingVertical: 12,
      paddingHorizontal: 18,
    },
    primaryButtonText: {
      color: colors.primaryForeground,
      fontWeight: '800',
      fontSize: 13,
    },
    payoutCard: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      padding: 14,
      borderLeftWidth: 4,
      ...shadow.sm,
    },
    payoutHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    payoutTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
    },
    payoutTitleCol: {
      gap: 4,
    },
    payoutTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.foreground,
    },
    payoutStatus: {
      fontSize: 11,
      fontWeight: '600',
      textTransform: 'uppercase',
    },
    copyBtn: {
      padding: 8,
    },
    payoutMeta: {
      flexDirection: 'row',
      gap: 16,
      marginBottom: 12,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    metaItem: {
      flex: 1,
    },
    metaLabel: {
      fontSize: 11,
      color: colors.mutedForeground,
      fontWeight: '600',
      marginBottom: 4,
    },
    metaValue: {
      fontSize: 13,
      color: colors.foreground,
      fontWeight: '500',
    },
    payoutDetails: {
      marginBottom: 12,
    },
    detailsLabel: {
      fontSize: 11,
      color: colors.mutedForeground,
      fontWeight: '600',
      marginBottom: 6,
    },
    txnId: {
      fontSize: 12,
      color: colors.primary,
      fontFamily: 'monospace',
      fontWeight: '500',
    },
    timeline: {
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    timelineItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 6,
    },
    timelineStatus: {
      fontSize: 12,
      color: colors.foreground,
      fontWeight: '600',
    },
    timelineTime: {
      fontSize: 11,
      color: colors.mutedForeground,
    },
    methodsList: {
      marginTop: 4,
      gap: 10,
    },
    method: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 6,
    },
    methodName: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.foreground,
    },
    methodTime: {
      fontSize: 12,
      color: colors.mutedForeground,
    },
  });
}





