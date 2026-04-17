import React, { useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, StatusBar, Modal, Image,
} from 'react-native';
import { useLocation } from 'wouter';
import {
  Zap, Activity, ArrowRight, CheckCircle2, Play,
  Menu, X, Phone, Mail, MapPin,
  Twitter, Instagram, Linkedin, Shield,
} from 'lucide-react-native';
import { radius, shadow } from '@/theme/tokens';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { AuthModal } from '@/components/AuthModal';

export default function Home() {
  const { colors, resolvedTheme } = useTheme();
  const styles = useMemo(() => createStyles(colors as any), [colors]);
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<'choose' | 'register-1'>('choose');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [sectionY, setSectionY] = useState<Record<string, number>>({});
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const scrollRef = useRef<ScrollView>(null);

  const handleSignIn = () => {
    setAuthMode('choose');
    setShowAuth(true);
    setMobileMenu(false);
  };

  const handleGetStarted = () => {
    if (isAuthenticated) navigate('/dashboard');
    else { setAuthMode('register-1'); setShowAuth(true); setMobileMenu(false); }
  };

  const goProtected = (path: string) => {
    if (isAuthenticated) navigate(path);
    else { setAuthMode('choose'); setShowAuth(true); setMobileMenu(false); }
  };

  const scrollToSection = (key: string) => {
    const y = sectionY[key];
    if (typeof y === 'number') {
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 70), animated: true });
    }
    setMobileMenu(false);
  };

  const captureSectionY = (key: string) => (e: any) => {
    const y = e?.nativeEvent?.layout?.y;
    if (typeof y === 'number') {
      setSectionY(prev => ({ ...prev, [key]: y }));
    }
  };

  const navLinks = [
    { label: 'How It Works', key: 'how' },
    { label: 'Features', key: 'features' },
    { label: 'Benefits', key: 'benefits' },
    { label: 'Platforms', key: 'platforms' },
  ];

  const features = [
    { Icon: Activity, color: colors.primary, bg: `${colors.primary}22`, title: 'AI Risk Analysis', desc: 'Our engine analyzes weather, AQI & traffic in your specific zone to price risk fairly per week.' },
    { Icon: Zap, color: '#93c5fd', bg: 'rgba(59,130,246,0.15)', title: 'Automatic Claims', desc: 'No forms to fill. Parametric threshold breach instantly generates and approves your claim.' },
    { Icon: Shield, color: '#86efac', bg: 'rgba(34,197,94,0.15)', title: 'Instant Payouts', desc: 'Once verified against your platform data, funds are credited to your wallet in under 2 minutes.' },
  ];

  const benefits = [
    { title: '₹20–40/week premium', desc: 'Affordable weekly plan based on your risk zone.' },
    { title: 'Zero manual claims', desc: 'Parametric trigger — no paperwork, ever.' },
    { title: 'Zone-level accuracy', desc: 'Risk assessed per your specific delivery zones.' },
    { title: 'Real-time monitoring', desc: 'Weather, AQI & traffic tracked 24/7.' },
    { title: 'Smart scheduling', desc: 'AI tells you the safest hours to maximize income.' },
    { title: 'Instant wallet credit', desc: 'Payout hits your account within 2 minutes.' },
  ];

  const steps = [
    { step: '1', title: 'Connect your gig platform account', desc: 'Link Swiggy, Zomato, or your preferred delivery partner app.' },
    { step: '2', title: 'Select working zones & hours', desc: 'We assess risk based on your specific delivery areas.' },
    { step: '3', title: 'Get protected instantly', desc: 'Cover activates immediately. Payouts are automatic.' },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle={resolvedTheme === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={colors.sidebar} />

      {/* Sticky Nav */}
      <View style={styles.nav}>
        <View style={styles.navInner}>
          <View style={styles.logoRow}>
            <Image
              source={require('../../assets/logo.png')}
              style={styles.logoIcon}
              resizeMode="contain"
            />
            <Text style={styles.logoText}>
              <Text style={{ color: '#fff' }}>Rakshit</Text>
              <Text style={{ color: colors.primary }}>Artha</Text>
            </Text>
          </View>
          <View style={styles.navActions}>
            <TouchableOpacity onPress={handleSignIn} style={styles.signInBtn}>
              <Text style={styles.signInText}>Sign In</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleGetStarted} style={styles.ctaBtn}>
              <Text style={styles.ctaBtnText}>Get Started</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setMobileMenu(p => !p)} style={styles.menuBtn}>
              {mobileMenu ? <X size={20} color="#fff" /> : <Menu size={20} color="#fff" />}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Mobile menu modal */}
      <Modal visible={mobileMenu} transparent animationType="slide" onRequestClose={() => setMobileMenu(false)}>
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setMobileMenu(false)}>
          <View style={styles.menuDrawer}>
            {navLinks.map(l => (
              <TouchableOpacity key={l.label} onPress={() => scrollToSection(l.key)} style={styles.menuItem}>
                <Text style={styles.menuItemText}>{l.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={handleSignIn} style={styles.menuSignIn}>
              <Text style={styles.menuSignInText}>Sign In</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleGetStarted} style={styles.menuCTA}>
              <Text style={styles.menuCTAText}>Get Started Free</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.heroOrb1} />
          <View style={styles.heroOrb2} />
          <View style={styles.heroBadge}>
            <Zap size={12} color={colors.primary} />
            <Text style={styles.heroBadgeText}>AI-Powered Parametric Insurance</Text>
          </View>
          <Text style={styles.heroTitle}>
            Income Protection for{'\n'}
            <Text style={styles.heroTitleAccent}>Food Delivery Workers</Text>
          </Text>
          <Text style={styles.heroSubtitle}>
            Never lose earnings to bad weather, high AQI, or traffic disruptions again.
            RakshitArtha pays out <Text style={{ color: 'rgba(255,255,255,0.8)', fontWeight: '700' }}>automatically</Text> when disruptions happen — zero manual claims.
          </Text>
          <View style={styles.heroCTAs}>
            <TouchableOpacity onPress={handleGetStarted} style={styles.primaryCTA}>
              <Text style={styles.primaryCTAText}>Get Started Free</Text>
              <ArrowRight size={16} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => goProtected('/dashboard/demo')} style={styles.secondaryCTA}>
              <Play size={14} color={colors.primary} />
              <Text style={styles.secondaryCTAText}>Watch Demo</Text>
            </TouchableOpacity>
          </View>
          {/* Trust badges */}
          <View style={styles.trustRow}>
            {['50+ workers covered', 'Zero manual claims', '< 2 min payout', '₹24/week as avg premium'].map(b => (
              <View key={b} style={styles.trustBadge}>
                <CheckCircle2 size={12} color={colors.primary} />
                <Text style={styles.trustText}>{b}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Auto-triggered claim card */}
        <View style={styles.claimCardWrap}>
          <View style={styles.claimCard}>
            <View style={styles.claimIcon}>
              <CheckCircle2 size={20} color={colors.success} />
            </View>
            <View style={styles.claimInfo}>
              <Text style={styles.claimMeta}>Heavy Rain · Zone 4B · Swiggy</Text>
              <Text style={styles.claimTitle}>Claim Auto-Triggered</Text>
            </View>
            <View style={styles.claimAmount}>
              <Text style={styles.claimAmountLabel}>Payout</Text>
              <Text style={styles.claimAmountValue}>₹350</Text>
            </View>
          </View>
        </View>

        {/* Platforms */}
        <View style={styles.section} onLayout={captureSectionY('platforms')}>
          <Text style={styles.sectionLabel}>SUPPORTED PLATFORMS</Text>
          <View style={styles.platformRow}>
            {[{ name: 'Swiggy', emoji: '🧡' }, { name: 'Zomato', emoji: '🔴' }].map(p => (
              <View key={p.name} style={styles.platformChip}>
                <Text style={styles.platformEmoji}>{p.emoji}</Text>
                <Text style={styles.platformName}>{p.name}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Features */}
        <View style={[styles.section, styles.featuresBg]} onLayout={captureSectionY('features')}>
          <Text style={styles.sectionTitle}>Why Choose RakshitArtha?</Text>
          <Text style={styles.sectionSubtitle}>Traditional insurance is built for cars, not gig workers. We reimagined protection using real-time data.</Text>
          {features.map(f => (
            <View key={f.title} style={styles.featureCard}>
              <View style={[styles.featureIcon, { backgroundColor: f.bg }]}>
                <f.Icon size={22} color={f.color} />
              </View>
              <Text style={styles.featureTitle}>{f.title}</Text>
              <Text style={styles.featureDesc}>{f.desc}</Text>
            </View>
          ))}
        </View>

        {/* How it works */}
        <View style={styles.section} onLayout={captureSectionY('how')}>
          <Text style={styles.sectionTitle}>
            Parametric protection, <Text style={{ color: colors.primary }}>simplified.</Text>
          </Text>
          <Text style={styles.sectionSubtitle}>Unlike traditional insurance, parametric pays automatically when a predefined event occurs — no proof of loss required.</Text>
          <View style={styles.timeline}>
            <View style={styles.timelineLine} />
            {steps.map((s, i) => (
              <View key={i} style={styles.timelineStep}>
                <View style={styles.timelineDot}>
                  <Text style={styles.timelineDotText}>{s.step}</Text>
                </View>
                <View style={styles.timelineContent}>
                  <Text style={styles.timelineTitle}>{s.title}</Text>
                  <Text style={styles.timelineDesc}>{s.desc}</Text>
                </View>
              </View>
            ))}
          </View>
          <TouchableOpacity onPress={handleGetStarted} style={[styles.primaryCTA, { alignSelf: 'center', marginTop: 24 }]}>
            <Text style={styles.primaryCTAText}>Get Protected Now</Text>
            <ArrowRight size={16} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Benefits */}
        <View style={[styles.section, { backgroundColor: colors.sidebar }]} onLayout={captureSectionY('benefits')}>
          <Text style={[styles.sectionTitle, { color: '#fff' }]}>Built for Gig Workers</Text>
          <Text style={[styles.sectionSubtitle, { color: 'rgba(255,255,255,0.5)' }]}>Every feature designed around how you actually work — daily, in zones, on apps.</Text>
          <View style={styles.benefitsGrid}>
            {benefits.map(b => (
              <View key={b.title} style={styles.benefitCard}>
                <CheckCircle2 size={14} color={colors.primary} style={{ marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.benefitTitle}>{b.title}</Text>
                  <Text style={styles.benefitDesc}>{b.desc}</Text>
                </View>
              </View>
            ))}
          </View>
          <TouchableOpacity onPress={handleGetStarted} style={[styles.primaryCTA, { alignSelf: 'center', marginTop: 24 }]}>
            <Text style={styles.primaryCTAText}>Create Free Account</Text>
            <ArrowRight size={16} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.footerLogoRow}>
            <Shield size={16} color={colors.primary} />
            <Text style={styles.footerLogo}>
              <Text style={{ color: '#fff' }}>Rakshit</Text>
              <Text style={{ color: colors.primary }}>Artha</Text>
            </Text>
          </View>
          <Text style={styles.footerTagline}>AI-powered parametric insurance for food delivery workers. Protecting your income, automatically.</Text>
          <View style={styles.footerSocial}>
            {[Twitter, Instagram, Linkedin].map((Icon, i) => (
              <View key={i} style={styles.socialBtn}>
                <Icon size={14} color="rgba(255,255,255,0.5)" />
              </View>
            ))}
          </View>
          <View style={styles.footerContact}>
            <View style={styles.footerContactRow}>
              <Mail size={12} color={colors.primary} />
              <Text style={styles.footerContactText}>support@rakshitartha.in</Text>
            </View>
            <View style={styles.footerContactRow}>
              <Phone size={12} color={colors.primary} />
              <Text style={styles.footerContactText}>9894165334</Text>
            </View>
            <View style={styles.footerContactRow}>
              <MapPin size={12} color={colors.primary} />
              <Text style={styles.footerContactText}>Coimbatore ,Tamilnadu, India</Text>
            </View>
          </View>
          <Text style={styles.footerCopy}>© 2026 RakshitArtha Platform. All rights reserved.</Text>
        </View>
      </ScrollView>

      {showAuth && <AuthModal initialMode={authMode} onClose={() => setShowAuth(false)} />}
    </SafeAreaView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  nav: { backgroundColor: colors.sidebar, ...shadow.md, zIndex: 40 },
  navInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 56 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoIcon: { width: 32, height: 32, borderRadius: radius.lg, backgroundColor: `${colors.primary}33`, alignItems: 'center', justifyContent: 'center' },
  logoText: { fontSize: 18, fontWeight: '800' },
  navActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  signInBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  signInText: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '500' },
  ctaBtn: { backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.xl, ...shadow.primary },
  ctaBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  menuBtn: { padding: 8, borderRadius: radius.lg },
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  menuDrawer: { backgroundColor: colors.sidebar, padding: 20, paddingTop: 60, gap: 4 },
  menuItem: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  menuItemText: { color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: '500' },
  menuSignIn: { marginTop: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', borderRadius: radius.xl, paddingVertical: 12, alignItems: 'center' },
  menuSignInText: { color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: '600' },
  menuCTA: { backgroundColor: colors.primary, borderRadius: radius.xl, paddingVertical: 14, alignItems: 'center', marginTop: 8, ...shadow.primary },
  menuCTAText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  hero: { backgroundColor: colors.sidebar, paddingHorizontal: 20, paddingTop: 48, paddingBottom: 48, alignItems: 'center', overflow: 'hidden' },
  heroOrb1: { position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: 100, backgroundColor: `${colors.primary}33` },
  heroOrb2: { position: 'absolute', bottom: -20, left: -20, width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(59,130,246,0.1)' },
  heroBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: `${colors.primary}33`, borderWidth: 1, borderColor: `${colors.primary}55`, marginBottom: 20 },
  heroBadgeText: { color: colors.primary, fontSize: 11, fontWeight: '700' },
  heroTitle: { fontSize: 32, fontWeight: '800', color: '#fff', textAlign: 'center', lineHeight: 40, marginBottom: 16 },
  heroTitleAccent: { color: colors.primary },
  heroSubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.6)', textAlign: 'center', lineHeight: 22, marginBottom: 28, maxWidth: 320 },
  heroCTAs: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', justifyContent: 'center' },
  primaryCTA: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 14, borderRadius: radius['2xl'], ...shadow.primary },
  primaryCTAText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondaryCTA: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 24, paddingVertical: 14, borderRadius: radius['2xl'] },
  secondaryCTAText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  trustRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12, marginTop: 28 },
  trustBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  trustText: { color: 'rgba(255,255,255,0.5)', fontSize: 11 },
  claimCardWrap: { marginHorizontal: 16, marginTop: -20, marginBottom: 24, zIndex: 10 },
  claimCard: { backgroundColor: colors.card, borderRadius: radius['2xl'], borderWidth: 1, borderColor: colors.cardBorder, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, ...shadow.md },
  claimIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(34,197,94,0.2)', alignItems: 'center', justifyContent: 'center' },
  claimInfo: { flex: 1 },
  claimMeta: { fontSize: 11, fontWeight: '600', color: colors.mutedForeground },
  claimTitle: { fontSize: 13, fontWeight: '700', color: colors.foreground },
  claimAmount: { alignItems: 'flex-end' },
  claimAmountLabel: { fontSize: 10, color: colors.mutedForeground },
  claimAmountValue: { fontSize: 20, fontWeight: '800', color: colors.foreground },
  section: { paddingHorizontal: 20, paddingVertical: 32 },
  sectionLabel: { textAlign: 'center', fontSize: 10, fontWeight: '700', color: colors.mutedForeground, letterSpacing: 2, marginBottom: 16 },
  sectionTitle: { fontSize: 22, fontWeight: '800', color: colors.foreground, textAlign: 'center', marginBottom: 8 },
  sectionSubtitle: { fontSize: 13, color: colors.mutedForeground, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  featuresBg: { backgroundColor: colors.background, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.cardBorder },
  featureCard: { backgroundColor: colors.card, borderRadius: radius['2xl'], borderWidth: 1, borderColor: colors.cardBorder, padding: 20, marginBottom: 12 },
  featureIcon: { width: 48, height: 48, borderRadius: radius['2xl'], alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  featureTitle: { fontSize: 15, fontWeight: '700', color: colors.foreground, marginBottom: 6 },
  featureDesc: { fontSize: 13, color: colors.mutedForeground, lineHeight: 20 },
  platformRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
  platformChip: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  platformEmoji: { fontSize: 16 },
  platformName: { fontSize: 13, fontWeight: '600', color: colors.foreground },
  timeline: { paddingLeft: 32, position: 'relative' },
  timelineLine: { position: 'absolute', left: 15, top: 14, bottom: 14, width: 2, backgroundColor: colors.cardBorder },
  timelineStep: { flexDirection: 'row', alignItems: 'flex-start', gap: 16, marginBottom: 28 },
  timelineDot: { position: 'absolute', left: -32, width: 28, height: 28, borderRadius: 14, backgroundColor: `${colors.primary}22`, borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  timelineDotText: { fontSize: 11, fontWeight: '700', color: colors.primary },
  timelineContent: { flex: 1 },
  timelineTitle: { fontSize: 13, fontWeight: '700', color: colors.foreground },
  timelineDesc: { fontSize: 11, color: colors.mutedForeground, marginTop: 2 },
  benefitsGrid: { gap: 10 },
  benefitCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: radius.xl, borderWidth: 1, borderColor: colors.cardBorder, padding: 14 },
  benefitTitle: { fontSize: 13, fontWeight: '700', color: '#fff' },
  benefitDesc: { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
  footer: { backgroundColor: '#0d1117', padding: 24, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
  footerLogoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  footerLogo: { fontSize: 18, fontWeight: '800' },
  footerTagline: { fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 18, marginBottom: 16 },
  footerSocial: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  socialBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center', justifyContent: 'center' },
  footerContact: { gap: 10, marginBottom: 20 },
  footerContactRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  footerContactText: { fontSize: 12, color: 'rgba(255,255,255,0.4)' },
  footerCopy: { fontSize: 11, color: 'rgba(255,255,255,0.25)', textAlign: 'center' },
});
