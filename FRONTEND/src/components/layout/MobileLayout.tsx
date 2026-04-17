import React, { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Animated, Pressable,
  StyleSheet, SafeAreaView, StatusBar, Image,
} from 'react-native';
import { useLocation } from 'wouter';
import { LayoutDashboard, FileText, Shield, Bell, Play, LogOut, ChevronLeft, MapPin, X, LineChart, Wallet } from 'lucide-react-native';
import { colors, radius, shadow } from '@/theme/tokens';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useAlerts, useAutomationNotifications, useRiskSnapshot } from '@/hooks/use-api';
import { formatDateTime } from '@/utils/helpers';

const workerTabs = [
  { href: '/dashboard',         label: 'Home',    Icon: LayoutDashboard },
  { href: '/dashboard/claims',  label: 'Claims',  Icon: FileText },
  { href: '/dashboard/policy',  label: 'Policy',  Icon: Shield },
  { href: '/dashboard/alerts',  label: 'Alerts',  Icon: Bell },
  { href: '/dashboard/demo',    label: 'Demo',    Icon: Play },
];

const insurerTabs = [
  { href: '/dashboard/insurer', label: 'Insurer', Icon: LineChart },
];

interface MobileLayoutProps {
  children: React.ReactNode;
  title?: string;
  showBack?: boolean;
}

export function MobileLayout({ children, title, showBack }: MobileLayoutProps) {
  const [location, navigate] = useLocation();
  const { user, logout } = useAuth();
  const { colors, resolvedTheme } = useTheme();
  const userIdentifier = { userId: user?.backendUserId, email: user?.email };
  const { data: navAlerts = [] } = useAlerts(userIdentifier);
  const { data: automationNotifications = [] } = useAutomationNotifications(userIdentifier);
  const { data: navRisk } = useRiskSnapshot(userIdentifier);
  const riskCount = typeof navRisk?.overallRisk === 'number' ? 1 : 0;
  const alertCount = navAlerts.length + automationNotifications.length + riskCount;
  const [banner, setBanner] = useState<null | { id: string; title: string; description: string; zone: string; severity: string; timestamp: string }>(null);
  const bannerAnim = useRef(new Animated.Value(0)).current;
  const seenIdsRef = useRef<Set<string>>(new Set());
  const primedRef = useRef(false);

  const baseTabs = user?.role === 'INSURER_ADMIN' ? insurerTabs : workerTabs;
  type Tab = typeof workerTabs[number] & { badge?: string };
  const tabs: Tab[] = baseTabs.map(t =>
    t.href === '/dashboard/alerts'
      ? { ...t, badge: alertCount > 0 ? String(alertCount) : undefined }
      : t
  );

  const activeTab = tabs.find(t => t.href === location);
  const pageTitle = title || activeTab?.label || 'RakshitArtha';

  const latestAlert = useMemo(() => {
    const baseAlerts = [
      ...automationNotifications.map(item => ({
        id: `auto-${item.id}`,
        title: item.title || item.type || 'Automation Alert',
        description: item.message,
        zone: item.zone || 'Your Zone',
        severity: item.severity || 'INFO',
        timestamp: item.deliveredAt,
      })),
      ...navAlerts.map(item => ({
        id: item.id,
        title: item.title,
        description: item.description,
        zone: item.zone,
        severity: item.severity,
        timestamp: item.timestamp,
      })),
    ];

    return baseAlerts.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0] || null;
  }, [automationNotifications, navAlerts]);

  useEffect(() => {
    if (!latestAlert) return;
    if (!primedRef.current) {
      primedRef.current = true;
      seenIdsRef.current = new Set([latestAlert.id]);
      return;
    }

    if (seenIdsRef.current.has(latestAlert.id)) return;
    seenIdsRef.current.add(latestAlert.id);
    setBanner(latestAlert);
    Animated.timing(bannerAnim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    const timer = setTimeout(() => {
      Animated.timing(bannerAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => setBanner(null));
    }, 4500);
    return () => clearTimeout(timer);
  }, [latestAlert, bannerAnim]);

  const initials = user?.name
    ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : 'RA';

  const go = (path: string) => {
    startTransition(() => navigate(path));
  };

  const styles = useMemo(() => StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, height: 56,
      backgroundColor: colors.sidebar,
      borderBottomWidth: 1, borderBottomColor: colors.sidebarBorder,
      ...shadow.md,
    },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    logoIcon: {
      width: 32, height: 32, borderRadius: radius.lg,
      backgroundColor: `${colors.primary}33`,
      alignItems: 'center', justifyContent: 'center',
    },
    headerTitle: { fontSize: 16, fontWeight: '700' },
    headerTitleWhite: { color: colors.sidebarForeground },
    headerTitleOrange: { color: colors.primary },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    avatar: {
      width: 32, height: 32, borderRadius: 16,
      backgroundColor: colors.primary,
      alignItems: 'center', justifyContent: 'center',
    },
    avatarText: { color: '#fff', fontSize: 11, fontWeight: '700' },
    iconBtn: { padding: 6, borderRadius: radius.lg },
    content: { flex: 1 },
    contentInner: { paddingBottom: 80 },
    tabBar: {
      flexDirection: 'row', alignItems: 'stretch',
      backgroundColor: colors.card,
      borderTopWidth: 1, borderTopColor: colors.cardBorder,
      ...shadow.md,
    },
    tab: {
      flex: 1, alignItems: 'center', justifyContent: 'center',
      paddingVertical: 10, gap: 2, position: 'relative',
    },
    tabIndicator: {
      position: 'absolute', top: 0, width: 32, height: 2,
      backgroundColor: colors.primary, borderBottomLeftRadius: 2, borderBottomRightRadius: 2,
    },
    tabLabel: { fontSize: 10, fontWeight: '600', color: `${colors.mutedForeground}99` },
    tabLabelActive: { color: colors.primary },
    tabBadge: {
      position: 'absolute', top: -4, right: -8,
      backgroundColor: colors.primary, borderRadius: 8,
      minWidth: 14, height: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2,
    },
    tabBadgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
    bannerWrap: {
      position: 'absolute',
      top: 64,
      left: 12,
      right: 12,
      zIndex: 50,
      elevation: 10,
    },
    bannerCard: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: `${colors.primary}33`,
      borderRadius: radius['2xl'],
      padding: 12,
      flexDirection: 'row',
      gap: 10,
      alignItems: 'flex-start',
      ...shadow.md,
    },
    bannerIcon: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: `${colors.primary}15`,
      alignItems: 'center',
      justifyContent: 'center',
    },
    bannerContent: { flex: 1, gap: 2 },
    bannerTitle: { color: colors.foreground, fontSize: 13, fontWeight: '800' },
    bannerDesc: { color: colors.mutedForeground, fontSize: 11, lineHeight: 15 },
    bannerMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
    bannerZone: { color: colors.mutedForeground, fontSize: 10, fontWeight: '600', flex: 1 },
    bannerTime: { color: colors.mutedForeground, fontSize: 9 },
  }), [colors]);

  const handleLogout = () => { logout(); navigate('/'); };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle={resolvedTheme === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={colors.sidebar} />

      {banner && (
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.bannerWrap,
            {
              opacity: bannerAnim,
              transform: [{ translateY: bannerAnim.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) }],
            },
          ]}
        >
          <View style={styles.bannerCard}>
            <View style={styles.bannerIcon}>
              <Bell size={18} color={colors.primary} />
            </View>
            <View style={styles.bannerContent}>
              <Text style={styles.bannerTitle} numberOfLines={1}>{banner.title}</Text>
              <Text style={styles.bannerDesc} numberOfLines={2}>{banner.description}</Text>
              <View style={styles.bannerMeta}>
                <MapPin size={10} color={colors.mutedForeground} />
                <Text style={styles.bannerZone} numberOfLines={1}>{banner.zone.replace(/\s*,\s*/g, ', ').replace(/\s+/g, ' ').trim()}</Text>
                <Text style={styles.bannerTime}>{formatDateTime(banner.timestamp)}</Text>
              </View>
            </View>
            <Pressable onPress={() => setBanner(null)} hitSlop={10} accessibilityLabel="Dismiss notification">
              <X size={16} color={colors.mutedForeground} />
            </Pressable>
          </View>
        </Animated.View>
      )}

      {/* Top header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {showBack ? (
            <TouchableOpacity
              onPress={() => go(user?.role === 'INSURER_ADMIN' ? '/dashboard/insurer' : '/dashboard')}
              style={styles.iconBtn}
              accessibilityLabel="Go back"
            >
              <ChevronLeft size={20} color={colors.sidebarForeground} />
            </TouchableOpacity>
          ) : (
            <Image
              source={require('../../../assets/logo.png')}
              style={styles.logoIcon}
              resizeMode="contain"
            />
          )}
          <Text style={styles.headerTitle}>
            {pageTitle === 'RakshitArtha' || pageTitle === 'Home'
              ? <Text><Text style={styles.headerTitleWhite}>Rakshit</Text><Text style={styles.headerTitleOrange}>Artha</Text></Text>
              : pageTitle}
          </Text>
        </View>
        <View style={styles.headerRight}>
          {user && (
            <TouchableOpacity onPress={() => go('/dashboard/profile')} style={styles.avatar} accessibilityLabel="Open profile">
              <Text style={styles.avatarText}>{initials}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={handleLogout} style={styles.iconBtn} accessibilityLabel="Sign out">
            <LogOut size={16} color={`${colors.sidebarForeground}99`} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Main content */}
      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner} showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>

      {/* Bottom tab bar */}
      <View style={styles.tabBar}>
        {tabs.map(tab => {
          const isActive = location === tab.href;
          const { Icon } = tab;
          return (
            <TouchableOpacity
              key={tab.href}
              onPress={() => go(tab.href)}
              style={styles.tab}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: isActive }}
            >
              {isActive && <View style={styles.tabIndicator} />}
              <View>
                <Icon size={20} color={isActive ? colors.primary : `${colors.mutedForeground}99`} />
                {tab.badge && !isActive && (
                  <View style={styles.tabBadge}>
                    <Text style={styles.tabBadgeText}>{tab.badge}</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
}


