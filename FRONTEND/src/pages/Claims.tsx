import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, TextInput, ScrollView } from 'react-native';
import { FileText, CheckCircle2, Clock, XCircle, Search, ShieldAlert, Eye } from 'lucide-react-native';
import { useLocation } from 'wouter';
import { MobileLayout } from '@/components/layout/MobileLayout';
import { radius, shadow } from '@/theme/tokens';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useClaims } from '@/hooks/use-api';
import { formatCurrency, formatDateTime } from '@/utils/helpers';

const statusConfig: Record<string, { color: string; Icon: typeof CheckCircle2 }> = {
  Approved: { color: '#22c55e', Icon: CheckCircle2 },
  Paid:     { color: '#22c55e', Icon: CheckCircle2 },
  Pending:  { color: '#f59e0b', Icon: Clock },
  Rejected: { color: '#ef4444', Icon: XCircle },
};

function getStatusCfg(status: string) {
  return statusConfig[status] || statusConfig.Pending;
}

export default function Claims() {
  const { colors } = useTheme();
  const s = useMemo(() => createStyles(colors as any), [colors]);
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const id = { userId: user?.backendUserId, email: user?.email };
  const { data: apiClaims = [], isLoading } = useClaims(id);
  const [query, setQuery] = useState('');

  const claims = apiClaims.filter(claim => claim.sourceType !== 'DEMO');

  const summary = {
    total: claims.length,
    paid: claims.filter(c => c.status === 'Approved' || c.status === 'Paid').length,
    pending: claims.filter(c => c.status === 'Pending').length,
    rejected: claims.filter(c => c.status === 'Rejected').length,
  };

  const filtered = claims.filter(c =>
    !query ||
    c.id.toLowerCase().includes(query.toLowerCase()) ||
    c.zone?.toLowerCase().includes(query.toLowerCase()) ||
    c.disruptionType?.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <MobileLayout title="Claims">
      <View style={s.header}>
        <Text style={s.title}>Claims History</Text>
        <Text style={s.subtitle}>100% automated payouts. Zero paperwork.</Text>
      </View>

      {/* Summary */}
      <View style={s.summaryRow}>
        {[
          { label: 'Total', value: summary.total, color: colors.foreground, bg: colors.card },
          { label: 'Paid', value: summary.paid, color: colors.riskLow, bg: `${colors.riskLow}15` },
          { label: 'Pending', value: summary.pending, color: colors.riskMedium, bg: `${colors.riskMedium}15` },
          { label: 'Rejected', value: summary.rejected, color: colors.riskHigh, bg: `${colors.riskHigh}15` },
        ].map(item => (
          <View key={item.label} style={[s.summaryCard, { backgroundColor: item.bg }]}>
            <Text style={[s.summaryValue, { color: item.color }]}>{item.value}</Text>
            <Text style={s.summaryLabel}>{item.label}</Text>
          </View>
        ))}
      </View>

      {/* Search */}
      <View style={s.searchRow}>
        <Search size={14} color={colors.mutedForeground} />
        <TextInput
          style={s.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search by ID, zone or type…"
          placeholderTextColor={colors.mutedForeground}
        />
      </View>

      {/* List */}
      <View style={s.list}>
        {isLoading && (
          <>{[1,2,3].map(i => <View key={i} style={s.skeleton} />)}</>
        )}
        {!isLoading && filtered.length === 0 && (
          <View style={s.empty}>
            <FileText size={40} color={colors.mutedForeground} />
            <Text style={s.emptyTitle}>No claims found</Text>
            <Text style={s.emptySubtitle}>Try a different search term</Text>
          </View>
        )}
        {!isLoading && filtered.map(claim => {
          const cfg = getStatusCfg(claim.status);
          const { Icon } = cfg;
          const ev = claim.triggerEvidence;
          return (
            <View key={claim.id} style={s.claimCard}>
              {/* Top row */}
              <View style={s.claimTop}>
                <View style={{ flex: 1 }}>
                  <Text style={s.claimId}>{claim.id}</Text>
                  <Text style={s.claimDate}>{formatDateTime(claim.date)}</Text>
                </View>
                <View style={[s.statusBadge, { backgroundColor: `${cfg.color}22` }]}>
                  <Icon size={11} color={cfg.color} />
                  <Text style={[s.statusText, { color: cfg.color }]}>{claim.status}</Text>
                </View>
              </View>

              {/* Middle row */}
              <View style={s.claimMid}>
                <View>
                  <Text style={s.claimType}>{claim.disruptionType}</Text>
                  <Text style={s.claimZone}>{claim.zone}</Text>
                </View>
                <Text style={[s.claimPayout, { color: claim.payout > 0 ? colors.foreground : colors.mutedForeground }]}>
                  {formatCurrency(claim.payout)}
                </Text>
              </View>

              {/* Fraud section */}
              <View style={s.fraudBox}>
                <View style={s.fraudTop}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <ShieldAlert size={14} color={(claim.fraudScore ?? 0) >= 60 ? colors.riskHigh : (claim.fraudScore ?? 0) >= 40 ? colors.riskMedium : colors.riskLow} />
                    <Text style={s.fraudTitle}>5-Layer Fraud Engine</Text>
                  </View>
                  <View style={[s.fraudBadge, { backgroundColor: (claim.fraudScore ?? 0) >= 60 ? `${colors.riskHigh}22` : (claim.fraudScore ?? 0) >= 40 ? `${colors.riskMedium}22` : `${colors.riskLow}22` }]}>
                    <Text style={[s.fraudScore, { color: (claim.fraudScore ?? 0) >= 60 ? colors.riskHigh : (claim.fraudScore ?? 0) >= 40 ? colors.riskMedium : colors.riskLow }]}>
                      {claim.fraudScore ?? 0}/100
                    </Text>
                  </View>
                </View>
                <Text style={s.fraudDesc}>{claim.fraudDescription || 'Behavioral physics, approximated platform truth, fraud ring, ML anomaly, and fair review lanes evaluated.'}</Text>
                {(claim.fraudReviewTier || claim.fraudNextAction) && (
                  <Text style={s.fraudDesc}>
                    Review lane: {claim.fraudReviewTier || 'GREEN'} · Next action: {(claim.fraudNextAction || 'AUTO_APPROVE').replace(/_/g, ' ')}
                  </Text>
                )}
                {claim.fraudFlags && claim.fraudFlags.length > 0 ? (
                  <View style={s.flagsRow}>
                    {claim.fraudFlags.slice(0, 3).map(f => (
                      <View key={f} style={s.flagChip}><Text style={s.flagText}>{f.replace(/_/g, ' ')}</Text></View>
                    ))}
                  </View>
                ) : (
                  <Text style={[s.fraudDesc, { color: colors.riskLow, marginTop: 4 }]}>Passed all layers for straight-through processing.</Text>
                )}
              </View>

              {/* Why this payout */}
              <View style={s.payoutBox}>
                <View style={s.payoutBoxTop}>
                  <Text style={s.fraudTitle}>Why this payout?</Text>
                  <Text style={s.fraudScore}>Risk {claim.riskScore ?? 0}/100</Text>
                </View>
                <Text style={s.fraudDesc}>{claim.approvalNotes || `Triggered by ${claim.disruptionType} in ${claim.zone}.`}</Text>
                {ev && (
                  <View style={s.evidenceGrid}>
                    {[
                      { label: 'Rainfall', value: `${ev.weatherData?.rainfall ?? 'NA'} mm` },
                      { label: 'AQI', value: String(ev.weatherData?.aqi ?? 'NA') },
                      { label: 'Temperature', value: `${ev.weatherData?.temperature ?? 'NA'}°C` },
                      { label: 'Deliveries', value: String(ev.activityData?.deliveriesCompleted ?? 'NA') },
                      { label: 'Severity', value: ev.payoutComputation?.triggerSeverity != null ? String(ev.payoutComputation.triggerSeverity) : 'NA' },
                      { label: 'Impact', value: ev.payoutComputation?.workerImpact != null ? String(ev.payoutComputation.workerImpact) : 'NA' },
                    ].map(e => (
                      <View key={e.label} style={s.evidenceCell}>
                        <Text style={s.evidenceCellLabel}>{e.label}</Text>
                        <Text style={s.evidenceCellValue}>{e.value}</Text>
                      </View>
                    ))}
                  </View>
                )}
                <View style={s.payoutMeta}>
                  <Text style={s.fraudDesc}>Method: {claim.payoutMethod || 'Pending'}</Text>
                  <Text style={s.fraudDesc}>{claim.payoutDate ? `Paid ${formatDateTime(claim.payoutDate)}` : 'Awaiting payout'}</Text>
                </View>
              </View>

              {/* View Workflow Button */}
              <TouchableOpacity 
                style={[s.workflowBtn, { backgroundColor: colors.primary }]}
                onPress={() => navigate(`/dashboard/workflow/${claim.id}`)}
              >
                <Eye size={14} color="#fff" />
                <Text style={s.workflowBtnText}>View Claim Workflow</Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
    </MobileLayout>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  header: { padding: 16, paddingBottom: 8 },
  title: { fontSize: 20, fontWeight: '800', color: colors.foreground },
  subtitle: { fontSize: 12, color: colors.mutedForeground, marginTop: 2 },
  summaryRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 6, marginBottom: 10 },
  summaryCard: { flex: 1, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.cardBorder, padding: 10, alignItems: 'center' },
  summaryValue: { fontSize: 18, fontWeight: '800' },
  summaryLabel: { fontSize: 9, color: colors.mutedForeground, marginTop: 2 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 10, backgroundColor: colors.secondary, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12 },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 13, color: colors.foreground },
  list: { paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
  skeleton: { height: 96, backgroundColor: colors.card, borderRadius: radius['2xl'], borderWidth: 1, borderColor: colors.cardBorder },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.foreground },
  emptySubtitle: { fontSize: 12, color: colors.mutedForeground },
  claimCard: { backgroundColor: colors.card, borderRadius: radius['2xl'], borderWidth: 1, borderColor: colors.cardBorder, padding: 14, ...shadow.sm, gap: 10 },
  claimTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  claimId: { fontSize: 12, fontWeight: '700', color: colors.foreground, fontVariant: ['tabular-nums'] },
  claimDate: { fontSize: 10, color: colors.mutedForeground, marginTop: 2 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  statusText: { fontSize: 10, fontWeight: '700' },
  claimMid: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.cardBorder },
  claimType: { fontSize: 13, fontWeight: '600', color: colors.foreground },
  claimZone: { fontSize: 11, color: colors.mutedForeground },
  claimPayout: { fontSize: 18, fontWeight: '800' },
  fraudBox: { backgroundColor: colors.secondary, borderRadius: radius.xl, padding: 12, gap: 6 },
  fraudTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fraudTitle: { fontSize: 12, fontWeight: '700', color: colors.foreground },
  fraudBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 },
  fraudScore: { fontSize: 10, fontWeight: '700', color: colors.foreground },
  fraudDesc: { fontSize: 10, color: colors.mutedForeground, lineHeight: 15 },
  flagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  flagChip: { backgroundColor: colors.card, borderRadius: 999, borderWidth: 1, borderColor: colors.cardBorder, paddingHorizontal: 8, paddingVertical: 3 },
  flagText: { fontSize: 9, color: colors.mutedForeground, fontWeight: '600' },
  payoutBox: { backgroundColor: colors.secondary, borderRadius: radius.xl, padding: 12, gap: 6 },
  payoutBoxTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  evidenceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  evidenceCell: { width: '47%', backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.cardBorder, padding: 8 },
  evidenceCellLabel: { fontSize: 10, fontWeight: '700', color: colors.foreground },
  evidenceCellValue: { fontSize: 11, color: colors.mutedForeground, marginTop: 2 },
  payoutMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  workflowBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 10, borderRadius: radius.lg, marginTop: 4 },
  workflowBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
});
