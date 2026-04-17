import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Linking,
} from 'react-native';
import {
  ShieldCheck, CheckCircle2, Star, CreditCard, History,
  Calendar, Hash, Zap, BadgeInfo, Download,
} from 'lucide-react-native';
import { MobileLayout } from '@/components/layout/MobileLayout';
import { radius, shadow } from '@/theme/tokens';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { usePolicy, useRiskSnapshot, useCreatePaymentOrder, useVerifyPayment } from '@/hooks/use-api';
import { api, PlanSelection } from '@/services/api';
import { formatCurrency, formatDate } from '@/utils/helpers';

const PLANS: Record<PlanSelection, {
  name: string; tag: string; basePremium: number; coverage: number;
  features: string[]; Icon: typeof ShieldCheck; color: string;
}> = {
  standard: {
    name: 'Standard Plan', tag: 'Dynamic Rs.24-48', basePremium: 30, coverage: 1200,
    features: ['Model-calculated premium', 'Monsoon + traffic cover', 'Auto claim pipeline'],
    Icon: ShieldCheck, color: '#93c5fd',
  },
  premium: {
    name: 'Premium Plan', tag: 'Dynamic Rs.36-50 max', basePremium: 45, coverage: 2000,
    features: ['Higher coverage', 'Priority automation', 'Advanced disruption coverage'],
    Icon: Star, color: '#f97316',
  },
};

function backendPlanToLocal(plan?: string | null): PlanSelection | null {
  if (!plan) return null;
  const n = plan.toUpperCase();
  if (n.includes('PREMIUM')) return 'premium';
  return 'standard';
}

export default function Policy() {
  const { colors } = useTheme();
  const s = useMemo(() => createStyles(colors as any), [colors]);
  const { user, updateUser } = useAuth();
  const id = { userId: user?.backendUserId, email: user?.email };
  const { data: policies = [], isLoading } = usePolicy(id);
  const { data: risk } = useRiskSnapshot(id);
  const createOrderMutation = useCreatePaymentOrder();
  const verifyMutation = useVerifyPayment();

  const activePaidPolicy = policies.find((p) => p.status === 'Active' && p.paymentStatus === 'Paid') || null;
  const latestPolicy = policies[0] || null;
  const policy = activePaidPolicy || latestPolicy;
  const effectivePlan = activePaidPolicy ? backendPlanToLocal(activePaidPolicy.plan) : null;
  const [selectedPlan, setSelectedPlan] = useState<PlanSelection>(effectivePlan || 'standard');
  const [activating, setActivating] = useState(false);
  const [activated, setActivated] = useState(false);
  const [planPremiums, setPlanPremiums] = useState<Record<PlanSelection, number | null>>({ standard: null, premium: null });

  useEffect(() => { if (effectivePlan) setSelectedPlan(effectivePlan); }, [effectivePlan]);

  useEffect(() => {
    if (!user?.backendUserId) return;
    let cancelled = false;
    Promise.all([
      api.getPremiumQuote({ userId: user.backendUserId, plan: 'standard', overallRisk: risk?.overallRisk }),
      api.getPremiumQuote({ userId: user.backendUserId, plan: 'premium', overallRisk: risk?.overallRisk }),
    ]).then(([sq, pq]) => {
      if (cancelled) return;
      setPlanPremiums({ standard: sq?.weeklyPremium || null, premium: pq?.weeklyPremium || null });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [risk?.overallRisk, user?.backendUserId]);

  const handleActivate = async () => {
    if (!user?.backendUserId) {
      Alert.alert('Not logged in', 'Please log in to activate a plan.');
      return;
    }

    setActivating(true);

    try {
      const order = await createOrderMutation.mutateAsync({
        identifier: id,
        selectedPlan,
        overallRisk: risk?.overallRisk,
      });

      if (order.checkoutUrl && order.paymentProvider === 'RAZORPAY') {
        await Linking.openURL(order.checkoutUrl);
        Alert.alert(
          'Complete Payment',
          'Razorpay checkout opened in your browser. Finish the payment there, then return to the app. Your policy activates only after the backend verifies the successful payment.'
        );
        setActivating(false);
        return;
      }

      Alert.alert(
        'Payment Required',
        `Plan: ${PLANS[selectedPlan].name}\nAmount: Rs.${order.lockedPayableAmount ?? Math.round(order.amount / 100)}\n\nOrder ID: ${order.orderId}\n\nDemo mode is enabled for this environment. Tap Confirm to simulate payment.`,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => setActivating(false) },
          {
            text: 'Confirm (Demo)',
            onPress: async () => {
              try {
                await verifyMutation.mutateAsync({
                  identifier: id,
                  payload: {
                    policyId: order.policyId,
                    razorpayOrderId: order.orderId,
                    razorpayPaymentId: `pay_demo_${Date.now()}`,
                    razorpaySignature: 'demo_signature',
                  },
                });
                updateUser({ activePlan: selectedPlan });
                setActivated(true);
                Alert.alert('Plan Activated', `${PLANS[selectedPlan].name} is now active.`);
                setTimeout(() => setActivated(false), 3000);
              } catch (e) {
                Alert.alert('Payment Failed', e instanceof Error ? e.message : 'Could not verify payment.');
              } finally {
                setActivating(false);
              }
            },
          },
        ]
      );
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not create payment order.');
      setActivating(false);
    }
  };

  const paymentStatus = latestPolicy?.paymentStatus || policy?.paymentStatus || 'Pending';
  const activePaymentStatus = activePaidPolicy?.paymentStatus || 'Pending';
  const chargePreview = policy?.weeklyPremium || planPremiums[selectedPlan] || PLANS[selectedPlan].basePremium;
  const paymentHistory = policy?.billingHistory?.length
    ? policy.billingHistory
    : effectivePlan ? [{ cycleStart: policy?.startDate, amount: policy?.amountPaid ?? policy?.weeklyPremium ?? chargePreview, status: paymentStatus, paidAt: policy?.lastPaymentAt }]
    : [];

  const statusColor = (status: string) => status === 'Paid' || status === 'Active' ? colors.riskLow : status === 'Failed' ? colors.riskHigh : colors.riskMedium;

  return (
    <MobileLayout title="Policy">
      <View style={s.header}>
        <Text style={s.title}>Your Policy</Text>
        <Text style={s.subtitle}>Amount charged is backend-locked to your selected plan.</Text>
      </View>

      {isLoading && <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />}

      <View style={s.section}>
        <Text style={s.sectionTitle}>Choose Your Plan</Text>
        {(Object.entries(PLANS) as [PlanSelection, typeof PLANS.standard][]).map(([key, plan]) => {
          const isSelected = selectedPlan === key;
          const isActive = Boolean(activePaidPolicy) && effectivePlan === key;
          const displayPremium = planPremiums[key] ?? plan.basePremium;
          const { Icon } = plan;
          return (
            <TouchableOpacity
              key={key}
              onPress={() => setSelectedPlan(key)}
              style={[s.planCard, isSelected && { borderColor: plan.color, backgroundColor: `${plan.color}10` }]}
            >
              <View style={s.planTop}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={[s.planIcon, { backgroundColor: `${plan.color}22` }]}><Icon size={16} color={plan.color} /></View>
                  <View>
                    <Text style={s.planName}>{plan.name}</Text>
                    <View style={[s.tagBadge, { backgroundColor: `${plan.color}22` }]}>
                      <Text style={[s.tagText, { color: plan.color }]}>{plan.tag}</Text>
                    </View>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={s.planPremium}>Rs.{displayPremium}<Text style={s.planPremiumSub}> {planPremiums[key] ? 'dynamic' : 'base'}</Text></Text>
                  <Text style={s.planCoverage}>Rs.{plan.coverage} coverage</Text>
                </View>
              </View>
              {plan.features.map((f) => (
                <View key={f} style={s.featureRow}>
                  <CheckCircle2 size={12} color={colors.riskLow} />
                  <Text style={s.featureText}>{f}</Text>
                </View>
              ))}
              {isActive && (
                <View style={s.activeBadge}>
                  <Text style={s.activeBadgeText}>Currently Active</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={s.section}>
        <View style={s.rowBetween}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <CreditCard size={14} color={colors.primary} />
            <Text style={s.sectionTitle}>Payment & Billing</Text>
          </View>
          <View style={[s.statusBadge, { backgroundColor: `${statusColor(paymentStatus)}22` }]}>
            <Text style={[s.statusText, { color: statusColor(paymentStatus) }]}>{paymentStatus}</Text>
          </View>
        </View>
        <View style={s.billingGrid}>
          <View style={s.billingCell}>
            <Text style={s.billingLabel}>Weekly Billing</Text>
            <Text style={s.billingValue}>{formatCurrency(chargePreview)}</Text>
          </View>
          <View style={s.billingCell}>
            <Text style={s.billingLabel}>Next Charge</Text>
            <Text style={s.billingValue}>{policy?.nextPaymentDue ? formatDate(policy.nextPaymentDue) : 'After activation'}</Text>
          </View>
        </View>
        <Text style={s.billingNote}>Razorpay checkout amount matches backend-locked payable amount for your plan.</Text>
      </View>

      {activated ? (
        <View style={s.activatedBtn}>
          <CheckCircle2 size={18} color={colors.riskLow} />
          <Text style={s.activatedText}>Plan Activated</Text>
        </View>
      ) : (
        <TouchableOpacity
          onPress={handleActivate}
          disabled={activating || createOrderMutation.isPending || (Boolean(activePaidPolicy) && effectivePlan === selectedPlan)}
          style={[s.activateBtn, (activating || (Boolean(activePaidPolicy) && effectivePlan === selectedPlan)) && s.activateBtnDisabled]}
        >
          {activating || createOrderMutation.isPending ? (
            <><Zap size={14} color="#fff" /><Text style={s.activateBtnText}>Opening Payment...</Text></>
          ) : Boolean(activePaidPolicy) && effectivePlan === selectedPlan ? (
            <><CheckCircle2 size={14} color={colors.mutedForeground} /><Text style={[s.activateBtnText, { color: colors.mutedForeground }]}>Already Active</Text></>
          ) : (
            <><BadgeInfo size={14} color="#fff" /><Text style={s.activateBtnText}>Pay & Activate {PLANS[selectedPlan].name}</Text></>
          )}
        </TouchableOpacity>
      )}

      {activePaidPolicy && effectivePlan && (
        <View style={s.section}>
          <View style={s.activePolicyHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <ShieldCheck size={14} color={colors.primary} />
              <Text style={s.sectionTitle}>Active Policy Details</Text>
            </View>
            <View style={[s.statusBadge, { backgroundColor: `${colors.riskLow}22` }]}>
              <Text style={[s.statusText, { color: colors.riskLow }]}>ACTIVE</Text>
            </View>
          </View>
          {[
            { Icon: Hash, label: 'Policy ID', value: policy?.id || 'Awaiting backend policy' },
            { Icon: Calendar, label: 'Start Date', value: policy ? formatDate(policy.startDate) : 'Not available yet' },
            { Icon: CreditCard, label: 'Last Payment', value: policy?.lastPaymentAt ? formatDate(policy.lastPaymentAt) : 'Awaiting first payment' },
          ].map((row) => (
            <View key={row.label} style={s.detailRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <row.Icon size={12} color={colors.mutedForeground} />
                <Text style={s.detailLabel}>{row.label}</Text>
              </View>
              <Text style={s.detailValue}>{row.value}</Text>
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity
        style={[s.downloadBtn, (!activePaidPolicy || activePaymentStatus !== 'Paid') && s.downloadBtnDisabled]}
        disabled={!activePaidPolicy || activePaymentStatus !== 'Paid'}
        onPress={() => Alert.alert('Policy Document', `Policy ID: ${activePaidPolicy?.id}\nPlan: ${activePaidPolicy?.plan}\nCoverage: Rs.${activePaidPolicy?.coverageAmount}\nStatus: ${activePaymentStatus}`)}
      >
        <Download size={14} color={(!activePaidPolicy || activePaymentStatus !== 'Paid') ? colors.mutedForeground : '#fff'} />
        <Text style={[s.downloadText, (!activePaidPolicy || activePaymentStatus !== 'Paid') && { color: colors.mutedForeground }]}>Download Policy Document</Text>
      </TouchableOpacity>

      <View style={[s.section, { marginBottom: 16 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <History size={14} color={colors.mutedForeground} />
          <Text style={s.sectionTitle}>Premium Payment History</Text>
        </View>
        {paymentHistory.length === 0 ? (
          <Text style={s.billingNote}>No payment recorded yet. Complete payment to activate weekly billing.</Text>
        ) : paymentHistory.map((entry, i) => (
          <View key={i} style={s.historyRow}>
            <View>
              <Text style={s.historyDate}>{entry.paidAt ? formatDate(entry.paidAt) : entry.cycleStart ? formatDate(entry.cycleStart) : 'Upcoming'}</Text>
              <Text style={s.billingNote}>Week {paymentHistory.length - i}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={s.historyAmount}>{formatCurrency(entry.amount ?? policy?.amountPaid ?? chargePreview)}</Text>
              <View style={[s.statusBadge, { backgroundColor: `${statusColor(entry.status || 'Pending')}22` }]}>
                <Text style={[s.statusText, { color: statusColor(entry.status || 'Pending') }]}>{entry.status || 'Pending'}</Text>
              </View>
            </View>
          </View>
        ))}
      </View>
    </MobileLayout>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  header: { padding: 16, paddingBottom: 8 },
  title: { fontSize: 20, fontWeight: '800', color: colors.foreground },
  subtitle: { fontSize: 12, color: colors.mutedForeground, marginTop: 2 },
  section: { marginHorizontal: 16, marginBottom: 12, backgroundColor: colors.card, borderRadius: radius['2xl'], borderWidth: 1, borderColor: colors.cardBorder, padding: 14, ...shadow.sm },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.foreground, marginBottom: 10 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  planCard: { borderWidth: 2, borderColor: colors.border, borderRadius: radius['2xl'], padding: 14, marginBottom: 10, backgroundColor: colors.card },
  planTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 },
  planIcon: { width: 36, height: 36, borderRadius: radius.xl, alignItems: 'center', justifyContent: 'center' },
  planName: { fontSize: 14, fontWeight: '800', color: colors.foreground },
  tagBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, marginTop: 3, alignSelf: 'flex-start' },
  tagText: { fontSize: 9, fontWeight: '700' },
  planPremium: { fontSize: 18, fontWeight: '800', color: colors.foreground },
  planPremiumSub: { fontSize: 10, fontWeight: '400', color: colors.mutedForeground },
  planCoverage: { fontSize: 10, color: colors.mutedForeground },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  featureText: { fontSize: 12, color: colors.foreground },
  activeBadge: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.cardBorder },
  activeBadgeText: { fontSize: 11, fontWeight: '700', color: colors.riskLow },
  billingGrid: { flexDirection: 'row', gap: 10, marginVertical: 10 },
  billingCell: { flex: 1, backgroundColor: colors.secondary, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.cardBorder, padding: 10 },
  billingLabel: { fontSize: 10, color: colors.mutedForeground },
  billingValue: { fontSize: 14, fontWeight: '800', color: colors.foreground, marginTop: 4 },
  billingNote: { fontSize: 10, color: colors.mutedForeground, lineHeight: 15 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  statusText: { fontSize: 10, fontWeight: '700' },
  activateBtn: { marginHorizontal: 16, marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, paddingVertical: 14, borderRadius: radius['2xl'], ...shadow.primary },
  activateBtnDisabled: { backgroundColor: colors.muted, ...shadow.sm },
  activateBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  activatedBtn: { marginHorizontal: 16, marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: `${colors.riskLow}15`, borderWidth: 2, borderColor: `${colors.riskLow}44`, paddingVertical: 14, borderRadius: radius['2xl'] },
  activatedText: { fontSize: 14, fontWeight: '700', color: colors.riskLow },
  activePolicyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  detailRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.cardBorder },
  detailLabel: { fontSize: 12, color: colors.mutedForeground },
  detailValue: { fontSize: 12, fontWeight: '600', color: colors.foreground },
  downloadBtn: { marginHorizontal: 16, marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, paddingVertical: 14, borderRadius: radius['2xl'], ...shadow.primary },
  downloadBtnDisabled: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, ...shadow.sm },
  downloadText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  historyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.cardBorder },
  historyDate: { fontSize: 13, fontWeight: '600', color: colors.foreground },
  historyAmount: { fontSize: 13, fontWeight: '700', color: colors.foreground },
});
