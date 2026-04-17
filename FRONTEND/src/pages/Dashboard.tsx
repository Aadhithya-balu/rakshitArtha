import React, { useMemo, useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, TextInput, ScrollView, Alert } from 'react-native';
import { useLocation } from 'wouter';
import {
  Shield, MapPin, RefreshCw, Droplets, Wind, Car,
  Sparkles, Target, Calculator, Activity, ShieldAlert, CheckCircle2, Eye,
} from 'lucide-react-native';
import { MobileLayout } from '@/components/layout/MobileLayout';
import { radius, shadow } from '@/theme/tokens';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useRiskSnapshot, usePolicy, useClaims, useNearbyZones, usePlatformActivity, useSyncPlatformActivity, useWorkerProfile, useSimulatePayout } from '@/hooks/use-api';
import { greeting, formatCurrency } from '@/utils/helpers';

function getRiskLabel(s: number) { return s >= 70 ? 'HIGH' : s >= 40 ? 'MEDIUM' : 'LOW'; }
function riskColor(s: number | null, colors: any) {
  if (s === null) return colors.mutedForeground;
  if (s >= 70) return colors.riskHigh;
  if (s >= 40) return colors.riskMedium;
  return colors.riskLow;
}
function deriveTrustScore(profileScore: number | null | undefined, risk: number | null, claimCount: number) {
  if (typeof profileScore === 'number') return Math.max(0, Math.min(100, Math.round(profileScore)));
  const rp = risk == null ? 10 : Math.round(risk / 5);
  return Math.max(65, Math.min(98, 96 - rp - claimCount * 4));
}

export default function Dashboard() {
  const { colors } = useTheme();
  const s = useMemo(() => createStyles(colors as any), [colors]);
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const id = { userId: user?.backendUserId, email: user?.email };

  const { data: profile } = useWorkerProfile(id);
  const { data: risk, isLoading: riskLoading, isFetching: riskFetching, isError: riskError, refetch: refetchRisk } = useRiskSnapshot(id);
  const { data: policies = [] } = usePolicy(id);
  const { data: claims = [] } = useClaims(id);
  const { data: zones = [] } = useNearbyZones(id);
  const { data: platformActivity } = usePlatformActivity(id, profile?.platform || user?.platform);
  const syncPlatformActivity = useSyncPlatformActivity();
  const simulateMutation = useSimulatePayout();
  const bootstrapSyncRef = useRef<string | null>(null);

  const activePolicy = policies.find((p) => p.status === 'Active' && p.paymentStatus === 'Paid') || null;
  const hasEligiblePolicy = Boolean(activePolicy);
  const latestClaim = claims[0];
  const riskScore = risk?.overallRisk ?? null;
  const rainfall = risk?.rainfall ?? null;
  const aqi = risk?.aqi ?? null;
  const trafficIndex = risk?.trafficIndex ?? null;
  const address = risk?.address || [user?.city, user?.deliveryZone].filter(Boolean).join(', ') || 'your location';
  const trustScore = deriveTrustScore(profile?.trustScore, riskScore, claims.length);
  const dailyIncome = profile?.dailyIncome ?? user?.dailyIncome ?? null;
  const optimizedEarnings = dailyIncome != null && riskScore != null
    ? Math.round(dailyIncome * (riskScore >= 70 ? 0.82 : riskScore >= 40 ? 0.92 : 1.05))
    : null;
  const platformActiveOrders = platformActivity?.activeOrders ?? platformActivity?.rideOrOrderCount ?? 0;
  const platformWeeklyIncome = platformActivity?.weeklyIncome ?? platformActivity?.earnings ?? 0;
  const platformActivityFactor = platformActivity?.activityFactor ?? 0;
  const platformAvgOrdersPerHour = platformActivity?.avgOrdersPerHour ?? 0;
  const platformIdleHours = platformActivity?.idleDuration != null ? (platformActivity.idleDuration / 60).toFixed(1) : '0.0';

  const [simIncome, setSimIncome] = useState('');
  const [simResult, setSimResult] = useState<{ loss: number; payout: number } | null>(null);

  useEffect(() => { if (dailyIncome) setSimIncome(String(dailyIncome)); }, [dailyIncome]);

  const handleSimulate = async () => {
    if (!hasEligiblePolicy) {
      Alert.alert('Policy Required', 'Estimated disruption loss is available only after policy activation with completed Razorpay payment.');
      return;
    }
    if (!user?.activityConsent || !user?.weatherCrossCheckConsent) {
      Alert.alert('Consent Required', 'Enable motion activity consent and trusted weather cross-check before estimating protection.');
      return;
    }
    const income = Number(simIncome);
    if (!income) return;
    const res = await simulateMutation.mutateAsync({ identifier: id, dailyIncome: income });
    const isSafe = (riskScore != null && riskScore < 34) || (res.disruptionPercent ?? 0) <= 0.12;
    setSimResult({ loss: isSafe ? 0 : res.estimatedLoss, payout: isSafe ? 0 : res.payout });
  };

  const timeWindows = useMemo(() => {
    if (riskScore == null) return [];
    return [
      { time: '6:00 - 7:00 PM', score: Math.max(riskScore - 20, 5) },
      { time: '7:00 - 8:00 PM', score: riskScore },
      { time: '8:00 - 10:00 PM', score: Math.min(riskScore + 10, 95) },
    ].map(w => ({ ...w, label: w.score >= 70 ? 'HIGH RISK' : w.score >= 40 ? 'MODERATE' : 'SAFE' }));
  }, [riskScore]);

  const aiTips = riskScore == null
    ? ['Waiting for live backend risk snapshot.', 'Weather, AQI and route suggestions will appear after sync.']
    : [
        (rainfall ?? 0) > 40 ? `Heavy rainfall near ${address}. Prefer short-distance orders.` : `Rainfall manageable near ${address}. Longer runs are safer.`,
        (aqi ?? 0) > 180 ? `AQI is high at ${aqi}. Limit exposure on busy roads.` : `AQI at ${aqi}. Outdoor conditions stable.`,
        (trafficIndex ?? 0) > 2 ? `Traffic elevated at ${trafficIndex}/5. Consider switching zones.` : `Traffic moderate at ${trafficIndex}/5. Zone looks workable.`,
      ];

  const showSyncWarning = !riskScore || riskError;

  useEffect(() => {
    const backendUserId = id.userId;
    const platform = profile?.platform || user?.platform;

    if (!backendUserId || !platform) return;
    if (platformActivity?.activityStatus && platformActivity.activityStatus !== 'UNSYNCED') return;

    const syncKey = `${backendUserId}:${platform}`;
    if (bootstrapSyncRef.current === syncKey || syncPlatformActivity.isPending) return;
    bootstrapSyncRef.current = syncKey;

    syncPlatformActivity.mutate(
      { identifier: id, platform },
      {
        onSuccess: () => {
          bootstrapSyncRef.current = null;
        },
        onError: () => {
          bootstrapSyncRef.current = null;
        },
      }
    );
  }, [id, profile?.platform, user?.platform, platformActivity?.activityStatus, syncPlatformActivity, id.userId]);

  return (
    <MobileLayout title="Dashboard">
      {/* Greeting */}
      <View style={s.greetRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.greeting}>{greeting()}, {(profile?.name || user?.name || 'Worker').split(' ')[0]} 👋</Text>
          <Text style={s.subGreeting}>{address}</Text>
        </View>
          <View style={[s.monitorBadge, { backgroundColor: riskFetching ? `${colors.warning}22` : `${colors.riskLow}22` }]}> 
          <RefreshCw size={11} color={riskFetching ? colors.warning : colors.riskLow} style={riskFetching ? { transform: [{ rotate: '45deg' }] } : undefined} />
          <Text style={[s.monitorText, { color: riskFetching ? colors.warning : colors.riskLow }]}>
            {riskFetching ? 'Refreshing' : 'Monitoring On'}
          </Text>
        </View>
      </View>

      {/* Sync warning */}
      {showSyncWarning && (
        <View style={s.syncWarn}>
          <Text style={s.syncWarnTitle}>Live dashboard sync incomplete</Text>
          <Text style={s.syncWarnText}>View will update when backend profile and risk refresh respond for {user?.email}.</Text>
        </View>
      )}

      <TouchableOpacity
        style={[s.workflowTrackerBtn, s.workflowTrackerTopBtn]}
        onPress={() => navigate(latestClaim ? `/dashboard/workflow/${latestClaim.id}` : '/dashboard/claims')}
      >
        <Eye size={14} color="#fff" />
        <Text style={s.workflowTrackerBtnText}>
          {latestClaim ? 'Workflow & Claim Process Tracker' : 'Open Claims To View Workflow Tracker'}
        </Text>
      </TouchableOpacity>

      {!user?.kycVerified && (
        <TouchableOpacity style={s.kycCard} onPress={() => navigate('/dashboard/kyc')}>
          <View style={{ flex: 1 }}>
            <Text style={s.kycTitle}>KYC verification pending</Text>
            <Text style={s.kycText}>Complete KYC to unlock full protection and priority claims.</Text>
          </View>
          <Text style={s.kycAction}>Verify Now</Text>
        </TouchableOpacity>
      )}

      {/* 4 KPI cards */}
      <View style={s.kpiGrid}>
        <View style={s.kpiCard}>
          <View style={[s.kpiIcon, { backgroundColor: `${colors.primary}15` }]}><Target size={16} color={colors.primary} /></View>
          <Text style={s.kpiLabel}>Income</Text>
          <Text style={s.kpiValue}>{dailyIncome == null ? 'Syncing' : formatCurrency(dailyIncome)}</Text>
          <Text style={s.kpiSub}>per day</Text>
        </View>
        <View style={s.kpiCard}>
          <View style={[s.kpiIcon, { backgroundColor: 'rgba(59,130,246,0.12)' }]}><Sparkles size={16} color="#93c5fd" /></View>
          <Text style={s.kpiLabel}>Trust</Text>
          <Text style={[s.kpiValue, { color: '#93c5fd' }]}>{trustScore}%</Text>
          <Text style={s.kpiSub}>risk + claims</Text>
        </View>
        <View style={s.kpiCard}>
          <View style={[s.kpiIcon, { backgroundColor: `${colors.primary}15` }]}><Shield size={16} color={colors.primary} /></View>
          <Text style={s.kpiLabel}>Premium</Text>
          <Text style={[s.kpiValue, { color: colors.primary }]}>{activePolicy ? `₹${activePolicy.weeklyPremium}` : 'No policy'}</Text>
          <Text style={s.kpiSub}>{activePolicy ? 'per week · ACTIVE' : 'pay & activate policy'}</Text>
        </View>
        <TouchableOpacity style={s.kpiCard} onPress={() => navigate('/dashboard/policy')}>
          <View style={[s.kpiIcon, { backgroundColor: 'rgba(59,130,246,0.12)' }]}><Shield size={16} color="#93c5fd" /></View>
          <Text style={s.kpiLabel}>Coverage</Text>
          <Text style={s.kpiValue}>{activePolicy ? formatCurrency(activePolicy.coverageAmount) : '—'}</Text>
          <Text style={s.kpiSub}>max payout</Text>
        </TouchableOpacity>
      </View>

      <View style={[s.card, { borderColor: platformActivity?.activityStatus === 'IDLE' ? `${colors.warning}33` : `${colors.primary}33` }]}>
        <View style={s.rowBetween}>
          <View>
            <Text style={s.cardTitle}>Platform Activity</Text>
            <Text style={s.tiny}>Live sync from {platformActivity?.sourcePlatform || profile?.platform || user?.platform || 'platform'}</Text>
          </View>
          <View style={[s.badge, { backgroundColor: `${platformActivity?.activityStatus === 'IDLE' ? colors.warning : colors.riskLow}22` }]}>
            <Text style={[s.badgeText, { color: platformActivity?.activityStatus === 'IDLE' ? colors.warning : colors.riskLow }]}>{platformActivity?.activityStatus || 'UNSYNCED'}</Text>
          </View>
        </View>
        <View style={s.platformStatsRow}>
          <View style={s.platformStat}>
              <Text style={s.platformStatValue}>{platformActiveOrders}</Text>
            <Text style={s.platformStatLabel}>Active Orders</Text>
          </View>
          <View style={s.platformStatDivider} />
          <View style={s.platformStat}>
              <Text style={s.platformStatValue}>{formatCurrency(platformWeeklyIncome)}</Text>
            <Text style={s.platformStatLabel}>Weekly Earnings</Text>
          </View>
          <View style={s.platformStatDivider} />
          <View style={s.platformStat}>
              <Text style={s.platformStatValue}>{`${Math.round(platformActivityFactor * 100)}%`}</Text>
            <Text style={s.platformStatLabel}>Activity Factor</Text>
          </View>
        </View>
        <View style={[s.rowBetween, { marginTop: 8 }]}>
            <Text style={s.tiny}>Avg orders/hr: {platformAvgOrdersPerHour.toFixed(2)}</Text>
            <Text style={s.tiny}>Idle: {platformIdleHours}h</Text>
        </View>
      </View>

      {/* Risk Score */}
      <View style={s.card}>
        <View style={s.rowBetween}>
          <Text style={s.cardTitle}>Risk Score</Text>
          <View style={[s.badge, { backgroundColor: `${riskColor(riskScore, colors)}22` }]}> 
            <Text style={[s.badgeText, { color: riskColor(riskScore, colors) }]}>{riskScore == null ? 'SYNCING' : getRiskLabel(riskScore)}</Text>
          </View>
        </View>
        {riskLoading ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} /> : (
          <>
            <View style={s.riskBar}><View style={[s.riskFill, { width: `${Math.min(riskScore ?? 0, 100)}%` as any, backgroundColor: riskColor(riskScore, colors) }]} /></View>
            <View style={s.rowBetween}>
              <Text style={s.tiny}>Low Risk</Text>
              <Text style={[s.tiny, { fontWeight: '700' }]}>{riskScore != null ? (riskScore / 100).toFixed(2) : 'Syncing'}</Text>
              <Text style={s.tiny}>High Risk</Text>
            </View>
            <View style={[s.rowBetween, { marginTop: 6 }]}>
              <Text style={s.tiny}>Source: {risk?.dataSource || 'Not Synced'}</Text>
              <Text style={s.tiny}>{risk?.updatedAt ? `Updated ${new Date(risk.updatedAt).toLocaleTimeString()}` : 'Awaiting refresh'}</Text>
            </View>
          </>
        )}
      </View>

      {/* Latest claim */}
      {latestClaim && (
        <View style={[s.card, { backgroundColor: `${colors.riskLow}15`, borderColor: `${colors.riskLow}33` }]}>
          <View style={s.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={[s.cardTitle, { color: colors.riskLow }]}>Latest Claim Update</Text>
              <Text style={s.tiny}>{latestClaim.disruptionType} · {latestClaim.status} · {latestClaim.zone}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[s.kpiValue, { color: colors.riskLow }]}>{formatCurrency(latestClaim.payout)}</Text>
              <Text style={s.tiny}>auto payout</Text>
            </View>
          </View>
        </View>
      )}

      {/* Fraud status */}
      {latestClaim && (
        <View style={[s.card, {
          backgroundColor: (latestClaim.fraudScore ?? 0) >= 60 ? `${colors.riskHigh}15` : (latestClaim.fraudScore ?? 0) >= 40 ? `${colors.riskMedium}15` : colors.card,
          borderColor: (latestClaim.fraudScore ?? 0) >= 60 ? `${colors.riskHigh}33` : (latestClaim.fraudScore ?? 0) >= 40 ? `${colors.riskMedium}33` : colors.cardBorder,
        }]}>
          <View style={s.rowBetween}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
              <ShieldAlert size={16} color={(latestClaim.fraudScore ?? 0) >= 60 ? colors.riskHigh : (latestClaim.fraudScore ?? 0) >= 40 ? colors.riskMedium : colors.riskLow} />
              <View style={{ flex: 1 }}>
                <Text style={s.cardTitle}>Fraud Status</Text>
                <Text style={s.tiny}>{latestClaim.fraudDescription || 'Latest claim passed the fraud screening pipeline.'}</Text>
              </View>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={s.kpiValue}>{latestClaim.fraudScore ?? 0}/100</Text>
              <Text style={s.tiny}>6-layer check</Text>
            </View>
          </View>

          <TouchableOpacity
            style={s.workflowTrackerBtn}
            onPress={() => navigate(`/dashboard/workflow/${latestClaim.id}`)}
          >
            <Eye size={14} color="#fff" />
            <Text style={s.workflowTrackerBtnText}>Workflow & Claim Process Tracker</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Nearby Zones */}
      {zones.length > 0 && (
        <View style={s.card}>
          <View style={[s.rowBetween, { marginBottom: 10 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Activity size={14} color={colors.primary} />
              <Text style={s.cardTitle}>Nearby Zones</Text>
            </View>
            <Text style={s.tiny}>Within 10 km</Text>
          </View>
          {zones.map((z, i) => (
            <View key={i} style={s.zoneRow}>
              <View style={[s.zoneDot, { backgroundColor: riskColor(z.riskScore, colors) }]} />
              <View style={{ flex: 1 }}>
                <Text style={s.zoneName}>{z.zoneName}</Text>
                <Text style={s.tiny}>{z.distanceKm != null ? `${z.distanceKm.toFixed(2)} km away` : 'Distance unavailable'}</Text>
              </View>
              <View style={[s.badge, { backgroundColor: `${riskColor(z.riskScore, colors)}22` }]}> 
                <Text style={[s.badgeText, { color: riskColor(z.riskScore, colors) }]}>{z.riskLabel} ({z.riskScore})</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Smart Work Assistant */}
      <View style={[s.card, { borderColor: `${colors.primary}33` }]}>
        <View style={[s.assistantHeader, { backgroundColor: `${colors.primary}10` }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Sparkles size={14} color={colors.primary} />
            <Text style={s.cardTitle}>Smart Work Assistant</Text>
          </View>
          <View style={[s.badge, { backgroundColor: `${riskColor(riskScore, colors)}22` }]}> 
            <Text style={[s.badgeText, { color: riskColor(riskScore, colors) }]}>
              {riskScore == null ? 'SYNCING' : riskScore >= 70 ? 'HIGH RISK' : riskScore >= 40 ? 'MODERATE' : 'LOW RISK'}
            </Text>
          </View>
        </View>
        <View style={s.assistantBody}>
          <View style={s.aiQuote}>
            <Text style={s.aiQuoteText}>
              {riskScore == null ? '"Waiting for live weather and model sync"'
                : riskScore >= 70 ? '"Reduce exposure and protect income today"'
                : '"Use low-risk windows to improve earnings"'}
            </Text>
          </View>
          <Text style={s.sectionLabel}>TIME WINDOWS</Text>
          {timeWindows.length > 0 ? timeWindows.map(w => (
            <View key={w.time} style={[s.timeWindow, { backgroundColor: `${riskColor(w.score, colors)}10`, borderColor: `${riskColor(w.score, colors)}33` }]}> 
              <Text style={s.timeWindowTime}>{w.time}</Text>
              <View style={[s.badge, { backgroundColor: `${riskColor(w.score, colors)}22` }]}> 
                <Text style={[s.badgeText, { color: riskColor(w.score, colors) }]}>{w.label}</Text>
              </View>
            </View>
          )) : (
            <View style={s.emptyWindows}>
              <Text style={s.tiny}>Smart windows appear after backend sends live risk score.</Text>
            </View>
          )}
          <View style={s.aiTipsBox}>
            <Text style={s.sectionLabel}>AI SUGGESTIONS</Text>
            {aiTips.map((tip, i) => (
              <View key={i} style={s.aiTipRow}>
                <View style={s.aiTipDot} />
                <Text style={s.aiTipText}>{tip}</Text>
              </View>
            ))}
            <View style={s.optimizedRow}>
              <Text style={s.tiny}>Optimised Earnings</Text>
              <Text style={[s.kpiValue, { color: colors.primary }]}>{optimizedEarnings == null ? 'Waiting for sync' : formatCurrency(optimizedEarnings)}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Current Conditions */}
      <View style={s.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <Activity size={14} color={colors.primary} />
          <Text style={s.cardTitle}>Current Conditions</Text>
        </View>
        {[
          { Icon: Droplets, label: 'Rainfall', value: rainfall == null ? 'Waiting for live weather' : `${rainfall} mm`, color: '#93c5fd' },
          { Icon: Wind, label: 'AQI Level', value: aqi == null ? 'Waiting for live AQI' : `${aqi}${aqi > 200 ? ' (Very High)' : aqi > 150 ? ' (High)' : aqi > 100 ? ' (Moderate)' : ' (Good)'}`, color: colors.warning },
          { Icon: Car, label: 'Traffic Index', value: trafficIndex == null ? 'Waiting for traffic model' : `${trafficIndex} / 5`, color: colors.primary },
        ].map(c => (
          <View key={c.label} style={s.conditionRow}>
            <View style={[s.conditionIcon, { backgroundColor: `${c.color}22` }]}><c.Icon size={16} color={c.color} /></View>
            <Text style={s.conditionLabel}>{c.label}</Text>
            <Text style={s.conditionValue}>{c.value}</Text>
          </View>
        ))}
        <View style={s.statusPill}>
          <Text style={s.statusPillText}>
            {riskScore == null ? 'Status: Waiting for live backend snapshot'
              : riskScore >= 70 ? 'Status: High disruption risk'
              : riskScore >= 40 ? 'Status: Moderate disruption risk'
              : 'Status: Low disruption risk'}
          </Text>
        </View>
      </View>

      {/* Income Simulator */}
      <View style={[s.card, { marginBottom: 8 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <Calculator size={14} color={colors.primary} />
          <Text style={s.cardTitle}>Income Simulator</Text>
        </View>
        {!hasEligiblePolicy && (
          <View style={s.policyGateBox}>
            <Text style={s.policyGateTitle}>Estimate Locked</Text>
            <Text style={s.policyGateText}>Activate policy via completed Razorpay payment to run disruption-loss estimate.</Text>
          </View>
        )}
        <Text style={s.tiny}>Expected Daily Income</Text>
        <View style={s.simInputRow}>
          <Text style={s.simRs}>₹</Text>
          <TextInput
            style={s.simInput}
            value={simIncome}
            onChangeText={setSimIncome}
            keyboardType="numeric"
            placeholderTextColor={colors.mutedForeground}
            placeholder="e.g. 1200"
          />
        </View>
        <TouchableOpacity
          onPress={handleSimulate}
          disabled={simulateMutation.isPending || !simIncome || !hasEligiblePolicy || !user?.activityConsent || !user?.weatherCrossCheckConsent}
          style={[s.simBtn, (!simIncome || simulateMutation.isPending || !hasEligiblePolicy || !user?.activityConsent || !user?.weatherCrossCheckConsent) && { opacity: 0.6 }]}
        >
          <Text style={s.simBtnText}>{simulateMutation.isPending ? 'Calculating...' : 'Estimate Protection'}</Text>
        </TouchableOpacity>
        {simResult && (
          <View style={s.simResult}>
            {simResult.loss <= 0 ? (
              <Text style={[s.tiny, { color: colors.riskLow, textAlign: 'center' }]}>You are in safe condition. No disruption loss predicted.</Text>
            ) : (
              <>
                <View style={s.simRow}><Text style={s.tiny}>Estimated Disruption Loss</Text><Text style={[s.tiny, { color: colors.riskHigh, fontWeight: '700' }]}>-{formatCurrency(simResult.loss)}</Text></View>
                <View style={s.simRow}><Text style={s.tiny}>RakshitArtha Auto Payout</Text><Text style={[s.tiny, { color: colors.riskLow, fontWeight: '700' }]}>+{formatCurrency(simResult.payout)}</Text></View>
                <View style={[s.simRow, { borderTopWidth: 1, borderTopColor: colors.cardBorder, paddingTop: 8, marginTop: 4 }]}>
                  <Text style={[s.tiny, { fontWeight: '700', color: colors.foreground }]}>Net Saved Income</Text>
                  <Text style={[s.tiny, { fontWeight: '800', color: colors.primary }]}>{formatCurrency(Number(simIncome) - simResult.loss + simResult.payout)}</Text>
                </View>
              </>
            )}
          </View>
        )}
      </View>
    </MobileLayout>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  greetRow: { flexDirection: 'row', alignItems: 'center', padding: 16, paddingBottom: 8, gap: 8 },
  greeting: { fontSize: 18, fontWeight: '800', color: colors.foreground },
  subGreeting: { fontSize: 11, color: colors.mutedForeground, marginTop: 2 },
  monitorBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999 },
  monitorText: { fontSize: 10, fontWeight: '700' },
  platformStatsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  platformStat: { flex: 1, alignItems: 'center' },
  platformStatDivider: { width: 1, height: 34, backgroundColor: colors.cardBorder, marginHorizontal: 8 },
  platformStatValue: { fontSize: 15, fontWeight: '800', color: colors.foreground },
  platformStatLabel: { fontSize: 9, color: colors.mutedForeground, marginTop: 2, textAlign: 'center' },
  syncWarn: { marginHorizontal: 16, marginBottom: 8, backgroundColor: `${colors.warning}15`, borderRadius: radius.xl, borderWidth: 1, borderColor: `${colors.warning}33`, padding: 12 },
  syncWarnTitle: { fontSize: 12, fontWeight: '700', color: colors.warning },
  syncWarnText: { fontSize: 11, color: colors.mutedForeground, marginTop: 2 },
  kycCard: { marginHorizontal: 16, marginBottom: 10, borderRadius: radius.xl, borderWidth: 1, borderColor: `${colors.primary}55`, backgroundColor: `${colors.primary}15`, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  kycTitle: { fontSize: 12, fontWeight: '700', color: colors.foreground },
  kycText: { fontSize: 11, color: colors.mutedForeground, marginTop: 2 },
  kycAction: { fontSize: 12, fontWeight: '800', color: colors.primary },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 8, marginBottom: 8 },
  kpiCard: { width: '47%', backgroundColor: colors.card, borderRadius: radius['2xl'], borderWidth: 1, borderColor: colors.cardBorder, padding: 12, ...shadow.sm },
  kpiIcon: { width: 32, height: 32, borderRadius: radius.xl, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  kpiLabel: { fontSize: 9, fontWeight: '700', color: colors.mutedForeground, textTransform: 'uppercase', letterSpacing: 0.5 },
  kpiValue: { fontSize: 16, fontWeight: '800', color: colors.foreground, marginTop: 2 },
  kpiSub: { fontSize: 9, color: colors.mutedForeground, marginTop: 2 },
  card: { marginHorizontal: 16, marginBottom: 12, backgroundColor: colors.card, borderRadius: radius['2xl'], borderWidth: 1, borderColor: colors.cardBorder, padding: 14, ...shadow.sm },
  cardTitle: { fontSize: 13, fontWeight: '700', color: colors.foreground },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  riskBar: { height: 8, backgroundColor: colors.muted, borderRadius: 4, overflow: 'hidden', marginVertical: 8 },
  riskFill: { height: '100%', borderRadius: 4 },
  tiny: { fontSize: 10, color: colors.mutedForeground },
  zoneRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, borderTopWidth: 1, borderTopColor: colors.cardBorder },
  zoneDot: { width: 8, height: 8, borderRadius: 4 },
  zoneName: { fontSize: 13, fontWeight: '600', color: colors.foreground },

  workflowTrackerBtn: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: 10,
  },
  workflowTrackerTopBtn: {
    marginHorizontal: 16,
    marginBottom: 10,
  },
  workflowTrackerBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  assistantHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderRadius: radius.xl, marginBottom: 12 },
  assistantBody: { gap: 10 },
  aiQuote: { backgroundColor: `${colors.primary}15`, borderRadius: radius.xl, padding: 10, borderWidth: 1, borderColor: `${colors.primary}22` },
  aiQuoteText: { fontSize: 12, color: colors.primary, fontWeight: '600', fontStyle: 'italic' },
  sectionLabel: { fontSize: 9, fontWeight: '700', color: colors.mutedForeground, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  timeWindow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 10, borderRadius: radius.xl, borderWidth: 1, marginBottom: 4 },
  timeWindowTime: { fontSize: 13, fontWeight: '600', color: colors.foreground },
  emptyWindows: { padding: 12, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.cardBorder, borderStyle: 'dashed' },
  aiTipsBox: { backgroundColor: colors.sidebar, borderRadius: radius.xl, padding: 12, gap: 6 },
  aiTipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  aiTipDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary, marginTop: 4 },
  aiTipText: { fontSize: 11, color: 'rgba(255,255,255,0.8)', flex: 1, lineHeight: 16 },
  optimizedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', paddingTop: 8, marginTop: 4 },
  conditionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.cardBorder },
  conditionIcon: { width: 32, height: 32, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  conditionLabel: { flex: 1, fontSize: 13, fontWeight: '500', color: colors.foreground },
  conditionValue: { fontSize: 13, fontWeight: '700', color: colors.foreground },
  statusPill: { alignSelf: 'center', marginTop: 8, backgroundColor: `${colors.primary}15`, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: `${colors.primary}22` },
  statusPillText: { fontSize: 11, fontWeight: '600', color: colors.primary },
  simInputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, backgroundColor: colors.secondary, paddingHorizontal: 12, marginVertical: 8 },
  simRs: { fontSize: 14, fontWeight: '700', color: colors.mutedForeground, marginRight: 4 },
  simInput: { flex: 1, paddingVertical: 10, fontSize: 14, color: colors.foreground },
  simBtn: { backgroundColor: colors.primary, paddingVertical: 12, borderRadius: radius.xl, alignItems: 'center', ...shadow.primary },
  simBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  simResult: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.cardBorder, gap: 6 },
  simRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  policyGateBox: { marginBottom: 10, backgroundColor: `${colors.warning}15`, borderRadius: radius.xl, borderWidth: 1, borderColor: `${colors.warning}33`, padding: 10 },
  policyGateTitle: { fontSize: 12, fontWeight: '700', color: colors.warning },
  policyGateText: { fontSize: 11, color: colors.mutedForeground, marginTop: 2 },
});
