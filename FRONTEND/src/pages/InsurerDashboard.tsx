import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Animated } from 'react-native';
import {
  Wallet, AlertTriangle, TrendingUp, Users, Cloud,
  CheckCircle2, XCircle, Clock, Activity, Zap, RefreshCw, Wifi, WifiOff
} from 'lucide-react-native';
import { MobileLayout } from '@/components/layout/MobileLayout';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { useRealtimeDashboard } from '@/hooks/useRealtimeDashboard';
import { api } from '@/services/api';
import { radius, shadow } from '@/theme/tokens';
import { formatCurrency } from '@/utils/helpers';

type DashboardTab = 'overview' | 'predictive';

export default function InsurerDashboard() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors as any), [colors]);
  const { user } = useAuth();
  const {
    portfolio,
    finance,
    predictive,
    platform,
    isLoading,
    connectionStatus,
    lastUpdated,
    refresh,
  } = useRealtimeDashboard({
    userId: user?.backendUserId,
    email: user?.email,
    pollInterval: 5000,
    enableAutoRefresh: true,
    enabled: user?.role === 'INSURER_ADMIN',
  });
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [refreshing, setRefreshing] = useState(false);
  const rotateAnim = useMemo(() => new Animated.Value(0), []);
  const didBootstrapSync = useRef(false);

  // Rotation animation for refresh button
  const spinRefresh = () => {
    rotateAnim.setValue(0);
    Animated.timing(rotateAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  };

  const rotateInterpolation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const handleRefresh = async () => {
    spinRefresh();
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const hasAnyDashboardData = Boolean(portfolio || finance || predictive);
  const portfolioData = portfolio ?? {
    totalPolicies: 0,
    activePolicies: 0,
    totalClaims: 0,
    approvedClaims: 0,
    rejectedClaims: 0,
  };
  const financeData = finance ?? {
    premiumsCollected: 0,
    payouts: 0,
  };
  const predictiveData = predictive ?? {
    avgRecentRisk: 0,
    avgRainfall: 0,
    predictedWeatherClaimsNextWeek: 0,
    projectedFinancialImpactInr: 0,
  };
  const platformData = platform ?? {
    bySource: [],
    activeWorkers: 0,
    idleWorkers: 0,
  };

  if (user?.role !== 'INSURER_ADMIN') {
    return (
      <MobileLayout title="Insurer Dashboard">
        <View style={styles.container}>
          <Text style={styles.warn}>Insurer dashboard is restricted to insurer admin accounts.</Text>
        </View>
      </MobileLayout>
    );
  }

  const displayedTabs: DashboardTab[] = ['overview', 'predictive'];

  useEffect(() => {
    if (!displayedTabs.length) return;
    if (!displayedTabs.includes(activeTab)) {
      setActiveTab(displayedTabs[0]);
    }
  }, [activeTab, displayedTabs]);

  useEffect(() => {
    if (user?.role !== 'INSURER_ADMIN') return;
    if (didBootstrapSync.current) return;
    if (platformData.bySource.length > 0) return;

    didBootstrapSync.current = true;
    Promise.allSettled(['SWIGGY', 'ZOMATO', 'UBER'].map((platformName) => api.syncPlatformBulk(platformName)))
      .then(() => refresh())
      .catch(() => {
        // Keep dashboard resilient when platform integrations are unavailable.
      });
  }, [platformData.bySource.length, refresh, user?.role]);

  // Format last updated time
  const getLastUpdatedText = () => {
    if (!lastUpdated) return 'Never';
    const now = new Date();
    const diff = Math.floor((now.getTime() - new Date(lastUpdated).getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  };

  return (
    <MobileLayout title="Insurer Platform">
      <View style={styles.container}>
        {/* Status Bar with Connection & Last Updated */}
        <View style={styles.statusBar}>
          <View style={styles.statusLeft}>
            {connectionStatus === 'connected' ? (
              <Wifi size={14} color={colors.riskLow} />
            ) : (
              <WifiOff size={14} color={colors.warning} />
            )}
            <Text style={[styles.statusText, { color: connectionStatus === 'connected' ? colors.riskLow : colors.warning }]}>
              {connectionStatus === 'connected' ? 'Live' : 'Offline'}
            </Text>
            <Text style={styles.statusTime}>• Updated {getLastUpdatedText()}</Text>
          </View>
          <TouchableOpacity
            style={[styles.refreshButton, { opacity: refreshing ? 0.5 : 1 }]}
            onPress={handleRefresh}
            disabled={refreshing}
          >
            <Animated.View style={{ transform: [{ rotate: rotateInterpolation }] }}>
              <RefreshCw size={16} color={colors.primary} />
            </Animated.View>
          </TouchableOpacity>
        </View>

        <View style={styles.header}>
          <Text style={styles.title}>📊 Insurer Management Console</Text>
          <Text style={styles.subtitle}>Governance, portfolio visualization, and operational oversight</Text>
        </View>

        {/* Tab Navigation */}
        {displayedTabs.length > 0 && (
          <View style={styles.tabBar}>
            {displayedTabs.map((tab) => (
              <TouchableOpacity
                key={tab}
                style={[styles.tab, activeTab === tab && styles.tabActive]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[styles.tabLabel, activeTab === tab && styles.tabLabelActive]}>
                  {tab === 'overview' ? 'Overview' : 'Weather Forecast'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {isLoading && !hasAnyDashboardData && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color={colors.primary} size="large" />
              <Text style={styles.loadingText}>Fetching live data...</Text>
            </View>
          )}

          {!isLoading && !hasAnyDashboardData && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>No dashboard data available</Text>
              <Text style={styles.noDataText}>No insurer metrics were returned by backend yet.</Text>
            </View>
          )}

          {hasAnyDashboardData && (
            <>
              {/* OVERVIEW TAB */}
              {activeTab === 'overview' && (
                <View style={styles.tabContent}>
                  {/* KPIs Grid - Only Real Data */}
                  {isLoading && (
                    <View style={styles.loadingOverlay}>
                      <ActivityIndicator color={colors.primary} size="small" />
                      <Text style={styles.loadingOverlayText}>Updating...</Text>
                    </View>
                  )}
                  <View style={styles.kpiGrid}>
                    <View style={[styles.kpiCard, { borderLeftColor: colors.primary, borderLeftWidth: 4 }]}>
                      <Text style={styles.kpiLabel}>Total Claims</Text>
                      <Text style={styles.kpiValue}>{portfolioData.totalClaims}</Text>
                    </View>

                    <View style={[styles.kpiCard, { borderLeftColor: colors.riskLow, borderLeftWidth: 4 }]}>
                      <Text style={styles.kpiLabel}>Active Policies</Text>
                      <Text style={styles.kpiValue}>{portfolioData.activePolicies}</Text>
                    </View>

                    <View style={[styles.kpiCard, { borderLeftColor: colors.riskMedium, borderLeftWidth: 4 }]}>
                      <Text style={styles.kpiLabel}>Total Payouts</Text>
                      <Text style={styles.kpiValue}>{formatCurrency(financeData.payouts)}</Text>
                    </View>

                    <View style={[styles.kpiCard, { borderLeftColor: colors.warning, borderLeftWidth: 4 }]}>
                      <Text style={styles.kpiLabel}>Total Policies</Text>
                      <Text style={styles.kpiValue}>{portfolioData.totalPolicies}</Text>
                    </View>
                  </View>

                  {/* Platform Activity Summary */}
                  <View style={styles.card}>
                    <View style={styles.cardHeader}>
                      <Activity size={18} color={colors.primary} />
                      <Text style={styles.cardTitle}>Platform Activity Summary</Text>
                    </View>

                    <View style={styles.statsRow}>
                      <View style={styles.stat}>
                        <Text style={styles.statValue}>{platformData.activeWorkers}</Text>
                        <Text style={styles.statLabel}>Active Workers</Text>
                      </View>
                      <View style={styles.divider} />
                      <View style={styles.stat}>
                        <Text style={styles.statValue}>{platformData.idleWorkers}</Text>
                        <Text style={styles.statLabel}>Idle Workers</Text>
                      </View>
                      <View style={styles.divider} />
                      <View style={styles.stat}>
                        <Text style={styles.statValue}>{platformData.bySource.length}</Text>
                        <Text style={styles.statLabel}>Connected Platforms</Text>
                      </View>
                    </View>

                    {platformData.bySource.length > 0 && (
                      <View style={{ marginTop: 12 }}>
                        {platformData.bySource.map((item) => (
                          <View key={item.sourcePlatform} style={styles.metricRow}>
                            <Text style={styles.metricLabel}>{item.sourcePlatform}</Text>
                            <Text style={styles.metricValue}>
                              {item.activeCount} active · {item.idleCount} idle · {Math.round(item.avgActivityFactor * 100)}%
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>

                  {/* Active Workers Card */}
                  <View style={styles.card}>
                    <View style={styles.cardHeader}>
                      <Users size={18} color={colors.primary} />
                      <Text style={styles.cardTitle}>Active Workers Insured</Text>
                    </View>
                    <View style={styles.statsRow}>
                      <View style={styles.stat}>
                        <Text style={styles.statValue}>{portfolioData.activePolicies}</Text>
                        <Text style={styles.statLabel}>Active Policies</Text>
                      </View>
                      <View style={styles.divider} />
                      <View style={styles.stat}>
                        <Text style={styles.statValue}>{portfolioData.totalPolicies}</Text>
                        <Text style={styles.statLabel}>Total Policies</Text>
                      </View>
                      <View style={styles.divider} />
                      <View style={styles.stat}>
                        <Text style={styles.statValue}>
                          {portfolioData.totalPolicies > 0 
                            ? ((portfolioData.activePolicies / portfolioData.totalPolicies) * 100).toFixed(1) 
                            : '0'}%
                        </Text>
                        <Text style={styles.statLabel}>Coverage Active</Text>
                      </View>
                    </View>
                  </View>

                  {/* Finance Summary Card */}
                  <View style={styles.card}>
                    <View style={styles.cardHeader}>
                      <Wallet size={18} color={colors.primary} />
                      <Text style={styles.cardTitle}>Financial Summary</Text>
                    </View>

                    <View style={styles.analyticsMetrics}>
                      <View style={styles.metricRow}>
                        <Text style={styles.metricLabel}>Premium Collected</Text>
                        <Text style={styles.metricValue}>{formatCurrency(financeData.premiumsCollected)}</Text>
                      </View>
                      <View style={styles.metricDivider} />
                      <View style={styles.metricRow}>
                        <Text style={styles.metricLabel}>Total Payouts</Text>
                        <Text style={styles.metricValue}>{formatCurrency(financeData.payouts)}</Text>
                      </View>
                    </View>
                  </View>

                  {/* Claims Breakdown */}
                  <View style={styles.card}>
                    <View style={styles.cardHeader}>
                      <AlertTriangle size={18} color={colors.primary} />
                      <Text style={styles.cardTitle}>Claims Overview</Text>
                    </View>

                    <View style={styles.claimsStats}>
                      <View style={styles.claimStatBox}>
                        <CheckCircle2 size={20} color={colors.riskLow} />
                        <Text style={styles.claimStatValue}>{portfolioData.approvedClaims}</Text>
                        <Text style={styles.claimStatLabel}>Approved</Text>
                      </View>
                      <View style={styles.claimStatBox}>
                        <Clock size={20} color={colors.primary} />
                        <Text style={styles.claimStatValue}>
                          {portfolioData.totalClaims - portfolioData.approvedClaims - portfolioData.rejectedClaims}
                        </Text>
                        <Text style={styles.claimStatLabel}>Pending</Text>
                      </View>
                      <View style={styles.claimStatBox}>
                        <XCircle size={20} color={colors.warning} />
                        <Text style={styles.claimStatValue}>{portfolioData.rejectedClaims}</Text>
                        <Text style={styles.claimStatLabel}>Rejected</Text>
                      </View>
                    </View>
                  </View>
                </View>
              )}

              {/* PREDICTIVE WEATHER/DISRUPTION ANALYTICS TAB */}
              {activeTab === 'predictive' && (
                <View style={styles.tabContent}>
                  {/* Next Week Forecast */}
                  <View style={[styles.card, { backgroundColor: `${colors.primary}08` }]}>
                    <View style={styles.cardHeader}>
                      <Cloud size={18} color={colors.primary} />
                      <Text style={styles.cardTitle}>Next Week Weather Forecast</Text>
                    </View>

                    <View style={styles.forecastContainer}>
                      <View style={styles.forecastItem}>
                        <Zap size={24} color="#FF9800" />
                        <Text style={styles.forecastValue}>{predictiveData.predictedWeatherClaimsNextWeek}</Text>
                        <Text style={styles.forecastLabel}>Expected Weather Claims</Text>
                      </View>
                      <View style={styles.forecastItem}>
                        <AlertTriangle size={24} color={colors.warning} />
                        <Text style={styles.forecastValue}>{predictiveData.avgRainfall.toFixed(0)}</Text>
                        <Text style={styles.forecastLabel}>Avg Rainfall (mm)</Text>
                      </View>
                      <View style={styles.forecastItem}>
                        <Activity size={24} color={colors.primary} />
                        <Text style={styles.forecastValue}>{predictiveData.avgRecentRisk.toFixed(0)}</Text>
                        <Text style={styles.forecastLabel}>Risk Score</Text>
                      </View>
                    </View>
                  </View>

                  {/* Predictive Analytics Details */}
                  <View style={styles.card}>
                    <View style={styles.cardHeader}>
                      <TrendingUp size={18} color={colors.primary} />
                      <Text style={styles.cardTitle}>AI Predictive Analytics</Text>
                    </View>

                    <View style={styles.analyticsMetrics}>
                      <View style={styles.metricRow}>
                        <Text style={styles.metricLabel}>Avg Recent Risk Score</Text>
                        <Text style={styles.metricValue}>{predictiveData.avgRecentRisk.toFixed(1)}</Text>
                      </View>
                      <View style={styles.metricDivider} />
                      <View style={styles.metricRow}>
                        <Text style={styles.metricLabel}>Predicted Weather Claims</Text>
                        <Text style={styles.metricValue}>{predictiveData.predictedWeatherClaimsNextWeek} claims</Text>
                      </View>
                      <View style={styles.metricDivider} />
                      <View style={styles.metricRow}>
                        <Text style={styles.metricLabel}>Average Rainfall Expected</Text>
                        <Text style={styles.metricValue}>{predictiveData.avgRainfall.toFixed(1)} mm</Text>
                      </View>
                    </View>
                  </View>

                  {/* Financial Impact Projection */}
                  <View style={styles.card}>
                    <View style={styles.cardHeader}>
                      <TrendingUp size={18} color={colors.primary} />
                      <Text style={styles.cardTitle}>Projected Financial Impact</Text>
                    </View>

                    <View style={styles.analyticsMetrics}>
                      <View style={styles.metricRow}>
                        <Text style={styles.metricLabel}>Projected Claims Next Week</Text>
                        <Text style={[styles.metricValue, { color: colors.warning }]}>
                          {predictiveData.predictedWeatherClaimsNextWeek} claims
                        </Text>
                      </View>
                      <View style={styles.metricDivider} />
                      <View style={styles.metricRow}>
                        <Text style={styles.metricLabel}>Est. Payout Impact</Text>
                        <Text style={[styles.metricValue, { color: colors.warning }]}>
                          {formatCurrency(predictiveData.projectedFinancialImpactInr ?? 0)}
                        </Text>
                      </View>
                      <View style={styles.metricDivider} />
                      <View style={styles.metricRow}>
                        <Text style={styles.metricLabel}>Recommendation</Text>
                        <Text style={styles.metricValue}>
                          {predictiveData.predictedWeatherClaimsNextWeek > 5 ? '📢 Increase reserves' : '✓ Maintain current reserves'}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              )}
            </>
          )}
        </ScrollView>
      </View>
    </MobileLayout>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12, backgroundColor: colors.background },
  
  // Real-time Status Bar
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: `${colors.primary}08`,
    borderRadius: radius.lg,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  statusLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusText: { fontSize: 12, fontWeight: '700' },
  statusTime: { fontSize: 11, color: colors.mutedForeground },
  refreshButton: {
    padding: 6,
    borderRadius: radius.md,
    backgroundColor: `${colors.primary}15`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  
  // Loading States
  loadingContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 12 },
  loadingText: { fontSize: 13, color: colors.mutedForeground, fontWeight: '600' },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: `${colors.primary}12`,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: radius.md,
    zIndex: 10,
  },
  loadingOverlayText: { fontSize: 11, color: colors.primary, fontWeight: '600' },
  
  header: { marginBottom: 12 },
  title: { fontSize: 24, fontWeight: '800', color: colors.foreground },
  subtitle: { fontSize: 13, color: colors.mutedForeground, marginTop: 4 },

  // Tab Bar
  tabBar: { flexDirection: 'row', gap: 8, marginBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  tab: { paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: colors.primary },
  tabLabel: { fontSize: 12, fontWeight: '600', color: colors.mutedForeground },
  tabLabelActive: { color: colors.foreground },
  content: { flex: 1 },
  tabContent: { gap: 12, paddingBottom: 20 },

  // KPI Cards
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  kpiCard: {
    width: '48%',
    backgroundColor: colors.card,
    borderRadius: radius['xl'],
    padding: 12,
    ...shadow.sm,
  },
  kpiLabel: { fontSize: 11, color: colors.mutedForeground, fontWeight: '600' },
  kpiValue: { fontSize: 20, fontWeight: '800', color: colors.foreground, marginVertical: 4 },
  kpiSub: { fontSize: 10, color: colors.mutedForeground },

  // Cards
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius['2xl'],
    padding: 16,
    gap: 12,
    ...shadow.sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.foreground, flex: 1 },
  cardSub: { fontSize: 12, color: colors.mutedForeground, marginTop: -8 },

  // Stats
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stat: { flex: 1, gap: 4 },
  statValue: { fontSize: 18, fontWeight: '800', color: colors.primary },
  statLabel: { fontSize: 11, color: colors.mutedForeground },
  divider: { width: 1, height: 40, backgroundColor: colors.cardBorder },

  // Claims
  claimsStats: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  claimStatBox: { flex: 1, alignItems: 'center', gap: 4, padding: 10, backgroundColor: `${colors.primary}08`, borderRadius: radius.lg },
  claimStatValue: { fontSize: 16, fontWeight: '800', color: colors.primary },
  claimStatLabel: { fontSize: 10, color: colors.mutedForeground },

  // Loss Ratio Analysis
  lossRatioContainer: { flexDirection: 'row', gap: 16, alignItems: 'center', paddingVertical: 12 },
  lossRatioCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: `${colors.primary}15`,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.primary,
  },
  lossRatioValue: { fontSize: 32, fontWeight: '900' },
  lossRatioInfo: { flex: 1, gap: 4 },
  lossRatioLabel: { fontSize: 14, fontWeight: '700', color: colors.foreground },
  lossRatioDesc: { fontSize: 12, color: colors.mutedForeground, lineHeight: 18 },

  // Forecast Container
  forecastContainer: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 12 },
  forecastItem: { alignItems: 'center', gap: 8 },
  forecastValue: { fontSize: 20, fontWeight: '800', color: colors.foreground },
  forecastLabel: { fontSize: 11, color: colors.mutedForeground, maxWidth: 80, textAlign: 'center' },

  // Analytics
  analyticsMetrics: { gap: 0 },
  metricRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  metricLabel: { fontSize: 12, color: colors.mutedForeground },
  metricValue: { fontSize: 14, fontWeight: '700', color: colors.foreground },
  metricDivider: { height: 1, backgroundColor: colors.cardBorder },

  noDataText: { fontSize: 12, color: colors.mutedForeground, marginTop: 12, fontStyle: 'italic' },
  warn: { color: colors.warning, fontWeight: '600', fontSize: 13, marginTop: 14 },
});
