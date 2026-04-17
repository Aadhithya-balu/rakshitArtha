import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import {
  Shield, TrendingUp, Clock, CheckCircle2, AlertCircle, DollarSign,
  Heart, Calendar, BarChart3, RefreshCw
} from 'lucide-react-native';
import { MobileLayout } from '@/components/layout/MobileLayout';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { radius, shadow } from '@/theme/tokens';
import { formatCurrency } from '@/utils/helpers';

export default function WorkerDashboard() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors as any), [colors]);
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'coverage' | 'claims' | 'payouts'>('coverage');
  const [loading, setLoading] = useState(false);
  const [dashboardData, setDashboardData] = useState({
    coverage: {
      isActive: true,
      platform: 'Zomato',
      weeklyPremium: 5.50,
      coverageAmount: 1250,
      daysRemaining: 4,
      nextPaymentDate: '2026-04-20',
      earningsProtected: 1250,
      status: 'ACTIVE',
    },
    claims: [
      {
        id: 'CLM001',
        date: '2026-04-10',
        reason: 'Heavy Rain',
        status: 'APPROVED',
        amount: 1250,
        type: 'WEATHER',
      },
      {
        id: 'CLM002',
        date: '2026-04-05',
        reason: 'App Downtime',
        status: 'APPROVED',
        amount: 625,
        type: 'APP_DOWNTIME',
      },
    ],
    payouts: [
      {
        id: 'PAY001',
        claimId: 'CLM001',
        amount: 1250,
        date: '2026-04-11',
        status: 'COMPLETED',
        method: 'UPI',
      },
      {
        id: 'PAY002',
        claimId: 'CLM002',
        amount: 625,
        date: '2026-04-06',
        status: 'COMPLETED',
        method: 'Bank Transfer',
      },
    ],
    stats: {
      totalEarningsProtected: 1875,
      totalClaimsFiled: 2,
      claimsApproved: 2,
      claimsRejected: 0,
      avgClaimAmount: 937.50,
    },
  });

  const handleRefresh = async () => {
    setLoading(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));
    setLoading(false);
  };

  type TabType = 'coverage' | 'claims' | 'payouts';
  const tabs: { label: string; value: TabType }[] = [
    { label: 'Coverage', value: 'coverage' },
    { label: 'Claims', value: 'claims' },
    { label: 'Payouts', value: 'payouts' },
  ];

  return (
    <MobileLayout title="My Protection">
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>🛡️ Your Coverage</Text>
          <Text style={styles.subtitle}>Income Protection Status</Text>
        </View>

        {/* Coverage Status Card */}
        {dashboardData.coverage.isActive && (
          <View style={[styles.card, { borderLeftColor: colors.riskLow, borderLeftWidth: 4 }]}>
            <View style={styles.cardHeader}>
              <CheckCircle2 size={20} color={colors.riskLow} />
              <Text style={styles.cardTitle}>Active Coverage</Text>
              <TouchableOpacity onPress={handleRefresh} style={{ marginLeft: 'auto' }}>
                <RefreshCw size={16} color={colors.primary} />
              </TouchableOpacity>
            </View>

            <View style={styles.protectionAmount}>
              <Text style={styles.protectionLabel}>Earnings Protected This Week</Text>
              <Text style={styles.protectionValue}>₹{dashboardData.coverage.earningsProtected}</Text>
              <Text style={styles.protectionSub}>{dashboardData.coverage.platform} • {dashboardData.coverage.daysRemaining} days left</Text>
            </View>

            <View style={styles.coverageDetails}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Weekly Premium</Text>
                <Text style={styles.detailValue}>₹{dashboardData.coverage.weeklyPremium.toFixed(2)}</Text>
              </View>
              <View style={styles.detailDivider} />
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Coverage Per Event</Text>
                <Text style={styles.detailValue}>₹{dashboardData.coverage.coverageAmount}</Text>
              </View>
              <View style={styles.detailDivider} />
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Next Payment</Text>
                <Text style={styles.detailValue}>{new Date(dashboardData.coverage.nextPaymentDate).toLocaleDateString()}</Text>
              </View>
            </View>

            {/* Renewal Button */}
            <TouchableOpacity style={styles.renewButton}>
              <Calendar size={16} color={colors.primary} />
              <Text style={styles.renewButtonText}>Renew Coverage</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Tab Navigation */}
        <View style={styles.tabBar}>
          {tabs.map((tab) => (
            <TouchableOpacity
              key={tab.value}
              style={[styles.tab, activeTab === tab.value && styles.tabActive]}
              onPress={() => setActiveTab(tab.value)}
            >
              <Text style={[styles.tabLabel, activeTab === tab.value && styles.tabLabelActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {loading && <ActivityIndicator color={colors.primary} size="large" style={{ marginTop: 40 }} />}

          {/* COVERAGE TAB */}
          {activeTab === 'coverage' && !loading && (
            <View style={styles.tabContent}>
              {/* What's Covered */}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>What's Protected</Text>
                <View style={styles.coverageList}>
                  {[
                    { icon: '🌧️', title: 'Heavy Rain', desc: 'AQI > 50mm rainfall' },
                    { icon: '🌫️', title: 'Severe Pollution', desc: 'AQI > 400 (Severe)' },
                    { icon: '🚗', title: 'Traffic Chaos', desc: '75%+ congestion' },
                    { icon: '📱', title: 'App Downtime', desc: '> 30 minutes unavailable' },
                    { icon: '🏪', title: 'Market Closure', desc: 'Curfew or closure' },
                  ].map((item, idx) => (
                    <View key={idx} style={styles.coverageItem}>
                      <Text style={styles.coverageIcon}>{item.icon}</Text>
                      <View>
                        <Text style={styles.coverageTitle}>{item.title}</Text>
                        <Text style={styles.coverageDesc}>{item.desc}</Text>
                      </View>
                      <CheckCircle2 size={16} color={colors.riskLow} />
                    </View>
                  ))}
                </View>
              </View>

              {/* Key Benefits */}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Key Benefits</Text>
                <View style={styles.benefitsList}>
                  {[
                    '✓ Zero-paperwork claims',
                    '✓ Instant approval (< 1 minute)',
                    '✓ Payout within 24 hours',
                    '✓ No deductible',
                    '✓ Weekly billing (no long contracts)',
                  ].map((benefit, idx) => (
                    <Text key={idx} style={styles.benefitItem}>
                      {benefit}
                    </Text>
                  ))}
                </View>
              </View>
            </View>
          )}

          {/* CLAIMS TAB */}
          {activeTab === 'claims' && !loading && (
            <View style={styles.tabContent}>
              {dashboardData.claims.length > 0 ? (
                dashboardData.claims.map((claim) => (
                  <View key={claim.id} style={styles.claimCard}>
                    <View style={styles.claimHeader}>
                      <View>
                        <Text style={styles.claimReason}>{claim.reason}</Text>
                        <Text style={styles.claimDate}>{new Date(claim.date).toLocaleDateString()}</Text>
                      </View>
                      <Text style={[styles.claimAmount, { color: claim.status === 'APPROVED' ? colors.riskLow : colors.warning }]}>
                        ₹{claim.amount}
                      </Text>
                    </View>

                    <View style={styles.claimStatus}>
                      {claim.status === 'APPROVED' ? (
                        <View style={styles.statusBadge}>
                          <CheckCircle2 size={14} color={colors.riskLow} />
                          <Text style={[styles.statusText, { color: colors.riskLow }]}>Approved</Text>
                        </View>
                      ) : (
                        <View style={styles.statusBadge}>
                          <Clock size={14} color={colors.primary} />
                          <Text style={[styles.statusText, { color: colors.primary }]}>Processing</Text>
                        </View>
                      )}
                    </View>
                  </View>
                ))
              ) : (
                <View style={styles.emptyState}>
                  <AlertCircle size={48} color={colors.mutedForeground} />
                  <Text style={styles.emptyStateText}>No claims filed yet</Text>
                  <Text style={styles.emptyStateSubtext}>When a disruption occurs, your claim will appear here</Text>
                </View>
              )}
            </View>
          )}

          {/* PAYOUTS TAB */}
          {activeTab === 'payouts' && !loading && (
            <View style={styles.tabContent}>
              {/* Summary Stats */}
              <View style={styles.statsGrid}>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>Total Protected</Text>
                  <Text style={styles.statValue}>₹{dashboardData.stats.totalEarningsProtected}</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>Approved Claims</Text>
                  <Text style={styles.statValue}>{dashboardData.stats.claimsApproved}</Text>
                </View>
              </View>

              {/* Payout History */}
              {dashboardData.payouts.length > 0 ? (
                dashboardData.payouts.map((payout) => (
                  <View key={payout.id} style={styles.payoutCard}>
                    <View style={styles.payoutHeader}>
                      <View>
                        <Text style={styles.payoutAmount}>₹{payout.amount}</Text>
                        <Text style={styles.payoutDate}>{new Date(payout.date).toLocaleDateString()}</Text>
                      </View>
                      <View style={styles.payoutStatus}>
                        <CheckCircle2 size={18} color={colors.riskLow} />
                        <Text style={[styles.payoutStatusText, { color: colors.riskLow }]}>Received</Text>
                      </View>
                    </View>
                    <Text style={styles.payoutMethod}>Paid via {payout.method}</Text>
                  </View>
                ))
              ) : (
                <View style={styles.emptyState}>
                  <DollarSign size={48} color={colors.mutedForeground} />
                  <Text style={styles.emptyStateText}>No payouts yet</Text>
                  <Text style={styles.emptyStateSubtext}>Approved claims will be paid within 24 hours</Text>
                </View>
              )}
            </View>
          )}
        </ScrollView>
      </View>
    </MobileLayout>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: { flex: 1, padding: 16, gap: 12, backgroundColor: colors.background },
    header: { marginBottom: 12 },
    title: { fontSize: 24, fontWeight: '800', color: colors.foreground },
    subtitle: { fontSize: 13, color: colors.mutedForeground, marginTop: 4 },

    // Cards
    card: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      borderRadius: radius['2xl'],
      padding: 16,
      gap: 12,
      ...shadow.sm,
      marginBottom: 12,
    },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    cardTitle: { fontSize: 15, fontWeight: '700', color: colors.foreground },

    // Coverage Details
    protectionAmount: { paddingVertical: 12, gap: 4 },
    protectionLabel: { fontSize: 12, color: colors.mutedForeground },
    protectionValue: { fontSize: 28, fontWeight: '900', color: colors.foreground },
    protectionSub: { fontSize: 11, color: colors.mutedForeground },

    coverageDetails: { gap: 0 },
    detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 },
    detailLabel: { fontSize: 12, color: colors.mutedForeground },
    detailValue: { fontSize: 13, fontWeight: '700', color: colors.foreground },
    detailDivider: { height: 1, backgroundColor: colors.cardBorder },

    // Renewal Button
    renewButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: `${colors.primary}15`,
      paddingVertical: 10,
      borderRadius: radius.lg,
      marginTop: 8,
    },
    renewButtonText: { fontSize: 13, fontWeight: '700', color: colors.primary },

    // Tabs
    tabBar: { flexDirection: 'row', gap: 8, marginBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
    tab: { paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
    tabActive: { borderBottomColor: colors.primary },
    tabLabel: { fontSize: 12, fontWeight: '600', color: colors.mutedForeground },
    tabLabelActive: { color: colors.foreground },

    content: { flex: 1 },
    tabContent: { gap: 12, paddingBottom: 20 },

    // Coverage List
    coverageList: { gap: 10 },
    coverageItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
    coverageIcon: { fontSize: 20 },
    coverageTitle: { fontSize: 13, fontWeight: '700', color: colors.foreground },
    coverageDesc: { fontSize: 11, color: colors.mutedForeground },

    // Benefits
    benefitsList: { gap: 8 },
    benefitItem: { fontSize: 12, color: colors.foreground, fontWeight: '600', lineHeight: 18 },

    // Claims
    claimCard: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      borderRadius: radius.lg,
      padding: 12,
      gap: 10,
    },
    claimHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    claimReason: { fontSize: 13, fontWeight: '700', color: colors.foreground },
    claimDate: { fontSize: 11, color: colors.mutedForeground },
    claimAmount: { fontSize: 16, fontWeight: '800' },
    claimStatus: { flexDirection: 'row', gap: 8 },
    statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    statusText: { fontSize: 11, fontWeight: '600' },

    // Payouts
    statsGrid: { flexDirection: 'row', gap: 12, marginBottom: 12 },
    statCard: {
      flex: 1,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      borderRadius: radius.lg,
      padding: 12,
      alignItems: 'center',
      gap: 4,
    },
    statLabel: { fontSize: 11, color: colors.mutedForeground },
    statValue: { fontSize: 18, fontWeight: '800', color: colors.primary },

    payoutCard: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      borderRadius: radius.lg,
      padding: 12,
      gap: 8,
    },
    payoutHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    payoutAmount: { fontSize: 16, fontWeight: '800', color: colors.foreground },
    payoutDate: { fontSize: 11, color: colors.mutedForeground },
    payoutStatus: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    payoutStatusText: { fontSize: 11, fontWeight: '700' },
    payoutMethod: { fontSize: 11, color: colors.mutedForeground },

    // Empty State
    emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 12 },
    emptyStateText: { fontSize: 16, fontWeight: '700', color: colors.foreground },
    emptyStateSubtext: { fontSize: 12, color: colors.mutedForeground, textAlign: 'center' },
  });
