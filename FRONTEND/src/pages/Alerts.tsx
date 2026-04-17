import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { BellRing, Filter, CloudRain, Car, Wind, AlertTriangle, Info, MapPin } from 'lucide-react-native';
import { MobileLayout } from '@/components/layout/MobileLayout';
import { radius, shadow } from '@/theme/tokens';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useAlerts, useAutomationNotifications, useRiskSnapshot } from '@/hooks/use-api';
import { formatDateTime } from '@/utils/helpers';

type Severity = 'Critical' | 'High' | 'Medium' | 'Info';

function getSeverityStyle(severity: string, colors: any) {
  const severityStyle: Record<string, { bg: string; badge: string; icon: string; bar: string }> = {
    critical: { bg: `${colors.riskHigh}18`, badge: `${colors.riskHigh}33`, icon: `${colors.riskHigh}22`, bar: colors.riskHigh },
    high:     { bg: `${colors.primary}12`, badge: `${colors.primary}33`, icon: `${colors.primary}22`, bar: colors.primary },
    medium:   { bg: `${colors.warning}12`, badge: `${colors.warning}33`, icon: `${colors.warning}22`, bar: colors.warning },
    info:     { bg: 'rgba(59,130,246,0.08)', badge: 'rgba(59,130,246,0.2)', icon: 'rgba(59,130,246,0.15)', bar: '#93c5fd' },
  };
  return severityStyle[severity.toLowerCase()] || severityStyle.info;
}

function getIcon(title: string, severity: string) {
  const t = title.toLowerCase();
  if (t.includes('rain')) return CloudRain;
  if (t.includes('traffic')) return Car;
  if (t.includes('aqi') || t.includes('wind')) return Wind;
  if (severity.toLowerCase() === 'info') return Info;
  return AlertTriangle;
}

function severityTextColor(severity: string, colors: any) {
  switch (severity.toLowerCase()) {
    case 'critical': return colors.riskHigh;
    case 'high': return colors.primary;
    case 'medium': return colors.warning;
    default: return '#93c5fd';
  }
}

export default function Alerts() {
  const { colors } = useTheme();
  const s = useMemo(() => createStyles(colors as any), [colors]);
  const { user } = useAuth();
  const id = { userId: user?.backendUserId, email: user?.email };
  const { data: backendAlerts = [], isLoading, refetch } = useAlerts(id);
  const { data: automationNotifications = [] } = useAutomationNotifications(id);
  const { data: risk } = useRiskSnapshot(id);

  const automationAlerts = useMemo(() => automationNotifications.map(item => ({
    id: `auto-${item.id}`,
    title: item.title || item.type || 'Automation Alert',
    description: item.message,
    severity: (item.severity === 'CRITICAL' ? 'Critical' : item.severity === 'HIGH' ? 'High' : item.severity === 'MEDIUM' ? 'Medium' : 'Info') as Severity,
    timestamp: item.deliveredAt,
    zone: item.zone,
  })), [automationNotifications]);

  const riskAdvisory = useMemo(() => {
    const score = risk?.overallRisk;
    if (typeof score !== 'number') return null;
    const r = Math.round(score);
    const zone = (risk as any)?.zone || (risk as any)?.riskZone || 'Your Zone';
    const timestamp = risk?.updatedAt || new Date().toISOString();
    if (r <= 35) return { id: 'risk-advisory-low', title: 'You are safe to work', description: `Current risk is low (${r}/100). Conditions look stable.`, severity: 'Info' as Severity, timestamp, zone };
    if (r <= 60) return { id: 'risk-advisory-medium', title: 'Moderate risk advisory', description: `Risk is moderate (${r}/100). Continue with caution.`, severity: 'Medium' as Severity, timestamp, zone };
    if (r <= 80) return { id: 'risk-advisory-high', title: 'High risk advisory', description: `Risk is high (${r}/100). Limit exposure and avoid high-risk routes.`, severity: 'High' as Severity, timestamp, zone };
    return { id: 'risk-advisory-critical', title: 'Critical risk advisory', description: `Risk is critical (${r}/100). Pause work and wait for safer conditions.`, severity: 'Critical' as Severity, timestamp, zone };
  }, [risk?.overallRisk, risk?.updatedAt]);

  const alerts = useMemo(
    () => riskAdvisory ? [riskAdvisory, ...automationAlerts, ...backendAlerts] : [...automationAlerts, ...backendAlerts],
    [riskAdvisory, automationAlerts, backendAlerts]
  );

  return (
    <MobileLayout title="Alerts">
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.title}>Live Alerts</Text>
          <Text style={s.subtitle}>Real-time parametric triggers in your zones.</Text>
        </View>
        <TouchableOpacity onPress={() => refetch()} style={s.filterBtn}>
          <Filter size={13} color={colors.foreground} />
          <Text style={s.filterText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {/* Active count badge */}
      <View style={s.countBadge}>
        <View style={s.pingWrap}>
          {alerts.length > 0 ? (
            <>
              <View style={s.pingOuter} />
              <View style={s.pingInner} />
            </>
          ) : (
            <View style={[s.pingInner, { backgroundColor: colors.mutedForeground }]} />
          )}
        </View>
        <Text style={s.countText}>
          {alerts.length > 0
            ? `${alerts.length} active alert${alerts.length !== 1 ? 's' : ''} in your zones`
            : 'No active alerts in your zones'}
        </Text>
      </View>

      {/* List */}
      <View style={s.list}>
        {isLoading && (
          <>{[1,2,3].map(i => <View key={i} style={s.skeleton} />)}</>
        )}

        {!isLoading && alerts.length === 0 && (
          <View style={s.empty}>
            <View style={s.emptyIcon}><BellRing size={32} color={colors.riskLow} /></View>
            <Text style={s.emptyTitle}>All Clear</Text>
            <Text style={s.emptySubtitle}>Conditions in your zones are currently normal.</Text>
          </View>
        )}

        {alerts.map(alert => {
          const st = getSeverityStyle(alert.severity, colors);
          const IconComp = getIcon(alert.title, alert.severity);
          const textColor = severityTextColor(alert.severity, colors);
          return (
            <View key={alert.id} style={[s.alertCard, { backgroundColor: st.bg, borderColor: `${textColor}33` }]}>
              {/* Severity bar */}
              <View style={[s.severityBar, { backgroundColor: st.bar }]} />
              <View style={s.alertBody}>
                <View style={[s.alertIcon, { backgroundColor: st.icon }]}>
                  <IconComp size={16} color={textColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={s.alertTop}>
                    <Text style={s.alertTitle} numberOfLines={1}>{alert.title}</Text>
                    <View style={[s.severityBadge, { backgroundColor: st.badge }]}>
                      <Text style={[s.severityText, { color: textColor }]}>{alert.severity.toUpperCase()}</Text>
                    </View>
                  </View>
                  <Text style={s.alertDesc}>{alert.description}</Text>
                  <View style={s.alertMeta}>
                    <View style={s.zonePill}>
                      <View style={s.zonePillInner}>
                        <MapPin size={11} color={colors.mutedForeground} />
                        <Text style={s.zoneText}>{alert.zone.replace(/\s*,\s*/g, ', ').replace(/\s+/g, ' ').trim()}</Text>
                      </View>
                    </View>
                    <Text style={s.alertTime}>{formatDateTime(alert.timestamp)}</Text>
                  </View>
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </MobileLayout>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingBottom: 8 },
  title: { fontSize: 20, fontWeight: '800', color: colors.foreground },
  subtitle: { fontSize: 12, color: colors.mutedForeground, marginTop: 2 },
  filterBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.xl, ...shadow.sm },
  filterText: { fontSize: 12, fontWeight: '600', color: colors.foreground },
  countBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 12, backgroundColor: `${colors.primary}12`, borderWidth: 1, borderColor: `${colors.primary}22`, borderRadius: radius.xl, paddingHorizontal: 12, paddingVertical: 8 },
  pingWrap: { width: 8, height: 8, position: 'relative', alignItems: 'center', justifyContent: 'center' },
  pingOuter: { position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: `${colors.primary}55` },
  pingInner: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary },
  countText: { fontSize: 12, fontWeight: '600', color: colors.primary },
  list: { paddingHorizontal: 16, paddingBottom: 16, gap: 10 },
  skeleton: { height: 96, backgroundColor: colors.card, borderRadius: radius['2xl'], borderWidth: 1, borderColor: colors.cardBorder },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: `${colors.riskLow}15`, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.foreground },
  emptySubtitle: { fontSize: 13, color: colors.mutedForeground, textAlign: 'center' },
  alertCard: { borderRadius: radius['2xl'], borderWidth: 1, overflow: 'hidden', ...shadow.sm },
  severityBar: { height: 3, width: '100%' },
  alertBody: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12 },
  alertIcon: { width: 36, height: 36, borderRadius: radius.xl, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  alertTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  alertTitle: { fontSize: 13, fontWeight: '700', color: colors.foreground, flex: 1, marginRight: 6 },
  severityBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 },
  severityText: { fontSize: 9, fontWeight: '700' },
  alertDesc: { fontSize: 11, color: colors.mutedForeground, lineHeight: 16, marginBottom: 6 },
  alertMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  zonePill: { backgroundColor: colors.secondary, borderRadius: 999, borderWidth: 1, borderColor: colors.cardBorder, paddingHorizontal: 8, paddingVertical: 3 },
  zonePillInner: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  zoneText: { fontSize: 10, fontWeight: '600', color: colors.mutedForeground },
  alertTime: { fontSize: 9, color: colors.mutedForeground },
});

