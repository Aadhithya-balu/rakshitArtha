import React, { useMemo, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, ScrollView,
  TextInput, StyleSheet, KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import { useLocation } from 'wouter';
import {
  X, ArrowRight, ArrowLeft,
  User, Briefcase, MapPin, Eye, EyeOff, CheckCircle2,
} from 'lucide-react-native';
import { radius, shadow } from '@/theme/tokens';
import { useAuth, UserProfile } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { fetchBackendProfileByEmail, insurerAdminLogin, syncUserToBackend } from '@/services/auth-api';

type Mode = 'choose' | 'login' | 'insurer-login' | 'register-1' | 'register-2' | 'register-3' | 'income' | 'success';

const PLATFORMS = [
  { id: 'Swiggy', label: 'Swiggy', emoji: '🧡' },
  { id: 'Zomato', label: 'Zomato', emoji: '🔴' },
  { id: 'Delivery Partner', label: 'Delivery Partner', emoji: '🟢' },
];
const WORKING_DAYS = [
  { id: 'Weekdays (Mon–Fri)', label: 'Weekdays' },
  { id: 'Weekends (Sat–Sun)', label: 'Weekends' },
  { id: 'Full Week', label: 'Full Week' },
];
const ZONE_TYPES = ['Urban', 'Suburban', 'Rural'];

const MOCK_RISK_PROFILES = [
  {
    id: 'low',
    title: 'Low Risk',
    subtitle: 'Stable zone and strong activity',
    email: 'mock.low@rakshitartha.test',
    password: 'MockRisk1',
    profile: {
      name: 'Mock Low Risk',
      phone: '9876500001',
      platform: 'Swiggy',
      workingHours: '10 AM - 8 PM',
      workingDays: 'Full Week',
      avgDailyHours: '9',
      city: 'Bengaluru',
      deliveryZone: 'Indiranagar Zone',
      zoneType: 'Urban',
      dailyIncome: 1800,
    },
  },
  {
    id: 'medium',
    title: 'Medium Risk',
    subtitle: 'Balanced workload pattern',
    email: 'mock.medium@rakshitartha.test',
    password: 'MockRisk1',
    profile: {
      name: 'Mock Medium Risk',
      phone: '9876500002',
      platform: 'Zomato',
      workingHours: '1 PM - 10 PM',
      workingDays: 'Weekdays (Mon-Fri)',
      avgDailyHours: '8',
      city: 'Mumbai',
      deliveryZone: 'Andheri Zone',
      zoneType: 'Suburban',
      dailyIncome: 1300,
    },
  },
  {
    id: 'high',
    title: 'High Risk',
    subtitle: 'High exposure and volatile activity',
    email: 'mock.high@rakshitartha.test',
    password: 'MockRisk1',
    profile: {
      name: 'Mock High Risk',
      phone: '9876500003',
      platform: 'Delivery Partner',
      workingHours: '6 PM - 3 AM',
      workingDays: 'Weekends (Sat-Sun)',
      avgDailyHours: '10',
      city: 'Chennai',
      deliveryZone: 'OMR Zone',
      zoneType: 'Urban',
      dailyIncome: 850,
    },
  },
] as const;

export function AuthModal({ onClose, initialMode = 'choose' }: { onClose: () => void; initialMode?: 'choose' | 'register-1' }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors as any), [colors]);
  const { login, register, registerExternal, updateUser, isNewUser } = useAuth();
  const [, navigate] = useLocation();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loginData, setLoginData] = useState({ email: '', password: '' });
  const [reg1, setReg1] = useState({ name: '', phone: '', email: '', password: '', confirmPassword: '' });
  const [reg2, setReg2] = useState({ platform: '', workingHours: '', workingDays: '', avgDailyHours: '' });
  const [reg3, setReg3] = useState({ city: '', deliveryZone: '', zoneType: '' });
  const [dailyIncome, setDailyIncome] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loadingEmail, setLoadingEmail] = useState(false);

  const normalizeEmail = (email: string) => email.trim().toLowerCase();
  const isValidEmail = (email: string) => /^[\w-.]+@([\w-]+\.)+[\w-]{2,}$/.test(email);
  const isValidPhone = (phone: string) => /^\d{10}$/.test(phone.replace(/\D/g, '').slice(-10));

  const modeTitle: Record<Mode, string> = {
    choose: 'Welcome', login: 'Sign In',
    'insurer-login': 'Insurer Admin Login',
    'register-1': 'Basic Details', 'register-2': 'Work Details',
    'register-3': 'Location', income: 'Daily Income', success: 'All Set!',
  };

  const handleBack = () => {
    setError('');
    if (mode === 'login' || mode === 'insurer-login' || mode === 'register-1') setMode('choose');
    else if (mode === 'register-2') setMode('register-1');
    else if (mode === 'register-3') setMode('register-2');
    else if (mode === 'income') setMode('choose');
  };

  const handleCheckEmail = async () => {
    try {
      setError('');
      setLoadingEmail(true);
      const normalizedEmail = normalizeEmail(loginData.email);
      if (!normalizedEmail) { setError('Please enter your email.'); setLoadingEmail(false); return; }
      if (!isValidEmail(normalizedEmail)) { setError('Please enter a valid email.'); setLoadingEmail(false); return; }
      setLoginData(p => ({ ...p, email: normalizedEmail }));

      // Check both local cache and backend so existing backend users are routed to login.
      if (!isNewUser(normalizedEmail)) {
        setMode('login');
        setLoadingEmail(false);
        return;
      }

      const backendProfile = await fetchBackendProfileByEmail(normalizedEmail);
      if (backendProfile) {
        setMode('login');
        setLoadingEmail(false);
        return;
      }

      setReg1(p => ({ ...p, email: normalizedEmail }));
      setMode('register-1');
      setLoadingEmail(false);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unable to validate email right now. Please try again.';
      setError(message);
      console.error('[AuthModal] Email check error:', e);
      setLoadingEmail(false);
    }
  };

  const handleCreateAccount = () => {
    setError('');
    const normalizedEmail = normalizeEmail(loginData.email);
    setReg1(p => ({ ...p, email: normalizedEmail }));
    setMode('register-1');
  };

  const handleMockAccess = async (presetId: (typeof MOCK_RISK_PROFILES)[number]['id']) => {
    const preset = MOCK_RISK_PROFILES.find((item) => item.id === presetId);
    if (!preset || submitting) return;

    setError('');
    setSubmitting(true);

    const normalizedEmail = normalizeEmail(preset.email);
    setLoginData({ email: normalizedEmail, password: preset.password });

    const existing = login(normalizedEmail, preset.password);
    if (existing) {
      onClose();
      navigate('/dashboard');
      setSubmitting(false);
      return;
    }

    const profile: UserProfile = {
      name: preset.profile.name,
      phone: preset.profile.phone,
      email: normalizedEmail,
      platform: preset.profile.platform,
      role: 'WORKER',
      jobType: '',
      workingHours: preset.profile.workingHours,
      workingDays: preset.profile.workingDays,
      avgDailyHours: preset.profile.avgDailyHours,
      city: preset.profile.city,
      deliveryZone: preset.profile.deliveryZone,
      zoneType: preset.profile.zoneType,
      preferredAreas: '',
      dailyIncome: preset.profile.dailyIncome,
      kycVerified: false,
      accountStatus: 'VERIFICATION_PENDING',
      activityConsent: true,
      weatherCrossCheckConsent: true,
    };

    register(profile, preset.password);
    onClose();
    navigate('/dashboard');

    try {
      const syncResult = await syncUserToBackend({
        name: profile.name,
        email: profile.email,
        phone: profile.phone,
        location: `${profile.city}, ${profile.deliveryZone}`,
        city: profile.city,
        deliveryZone: profile.deliveryZone,
        zoneType: profile.zoneType,
        platform: profile.platform,
        dailyIncome: profile.dailyIncome,
        workingHours: profile.workingHours,
        workingDays: profile.workingDays,
        avgDailyHours: profile.avgDailyHours,
      });

      updateUser({
        backendUserId: syncResult.backendUserId,
        kycVerified: syncResult.kycVerified,
        accountStatus: syncResult.accountStatus,
      });
    } catch {
      // Keep local mock login usable even if backend sync is temporarily unavailable.
    } finally {
      setSubmitting(false);
    }
  };



  const handleLogin = () => {
    setError('');
    const normalizedEmail = normalizeEmail(loginData.email);
    if (!normalizedEmail || !loginData.password) { setError('Fill in all fields.'); return; }
    if (!isValidEmail(normalizedEmail)) { setError('Please enter a valid email.'); return; }

    if (mode === 'insurer-login') {
      insurerAdminLogin(normalizedEmail, loginData.password)
        .then((admin) => {
          const adminProfile: UserProfile = {
            name: admin.name,
            phone: '',
            email: admin.email,
            platform: 'OTHER',
            role: 'INSURER_ADMIN',
            jobType: '',
            workingHours: '',
            workingDays: '',
            avgDailyHours: '',
            city: '',
            deliveryZone: '',
            zoneType: '',
            preferredAreas: '',
            backendUserId: admin.backendUserId,
            kycVerified: true,
            accountStatus: admin.accountStatus,
          };
          register(adminProfile, loginData.password);
          onClose();
          navigate('/dashboard/insurer');
        })
        .catch(() => {
          setError('Invalid insurer admin credentials.');
        });
      return;
    }

    const loggedInProfile = login(normalizedEmail, loginData.password);
    if (loggedInProfile) {
      onClose();
      navigate(loggedInProfile.role === 'INSURER_ADMIN' ? '/dashboard/insurer' : '/dashboard');
      return;
    }

    // If account exists in backend but not local cache, sync it into local auth.
    fetchBackendProfileByEmail(normalizedEmail)
      .then((backendProfile) => {
        if (!backendProfile?._id) {
          setError('Incorrect email or password.');
          return;
        }

        if (backendProfile.role === 'INSURER_ADMIN') {
          setError('Insurer admins must use Insurer Admin Login.');
          setMode('insurer-login');
          return;
        }

        const syncedProfile: UserProfile = {
          name: backendProfile.name || 'User',
          phone: backendProfile.phone || '',
          email: normalizedEmail,
          platform: backendProfile.platform || 'Other',
          role: backendProfile.role || 'WORKER',
          jobType: '',
          workingHours: '',
          workingDays: '',
          avgDailyHours: '',
          city: '',
          deliveryZone: '',
          zoneType: '',
          preferredAreas: '',
          dailyIncome: backendProfile.dailyIncome ?? undefined,
          backendUserId: backendProfile._id,
          kycVerified: Boolean(backendProfile.kyc?.verified),
          accountStatus: backendProfile.accountStatus || 'VERIFICATION_PENDING',
        };

        register(syncedProfile, loginData.password);
        onClose();
        navigate('/dashboard');
      })
      .catch(() => {
        setError('Incorrect email or password.');
      });
  };

  const handleReg1Next = () => {
    setError('');
    if (!reg1.name || !reg1.phone || !reg1.email || !reg1.password || !reg1.confirmPassword) { setError('Fill in all fields.'); return; }
    if (!isValidEmail(normalizeEmail(reg1.email))) { setError('Please enter a valid email.'); return; }
    if (!isValidPhone(reg1.phone)) { setError('Phone must be 10 digits.'); return; }
    if (reg1.password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (!/[A-Z]/.test(reg1.password) || !/[0-9]/.test(reg1.password)) { setError('Password must include at least one uppercase letter and one number.'); return; }
    if (reg1.password !== reg1.confirmPassword) { setError('Passwords do not match.'); return; }
    setMode('register-2');
  };

  const handleReg2Next = () => {
    setError('');
    if (!reg2.platform || !reg2.workingHours || !reg2.workingDays || !reg2.avgDailyHours) { setError('Fill in all fields.'); return; }
    const dailyHours = Number(reg2.avgDailyHours);
    if (!Number.isFinite(dailyHours) || dailyHours <= 0 || dailyHours > 24) { setError('Average daily hours must be between 1 and 24.'); return; }
    setMode('register-3');
  };

  const handleReg3Submit = async () => {
    setError('');
    if (!reg3.city || !reg3.deliveryZone || !reg3.zoneType) { setError('Fill in all fields.'); return; }
    if (submitting) return;
    setSubmitting(true);

    const profile: UserProfile = {
      name: reg1.name, phone: reg1.phone, email: reg1.email,
      platform: reg2.platform, role: 'WORKER', jobType: '',
      workingHours: reg2.workingHours, workingDays: reg2.workingDays, avgDailyHours: reg2.avgDailyHours,
      city: reg3.city, deliveryZone: reg3.deliveryZone, zoneType: reg3.zoneType, preferredAreas: '',
      dailyIncome: dailyIncome ? Number(dailyIncome) : undefined,
      kycVerified: false, accountStatus: 'VERIFICATION_PENDING',
    };

    // Optimistic local account creation for immediate UX response.
    register(profile, reg1.password);
    onClose();
    navigate('/dashboard');

    try {
      const syncResult = await syncUserToBackend({
        name: reg1.name, email: reg1.email, phone: reg1.phone,
        location: `${reg3.city}, ${reg3.deliveryZone}`,
        city: reg3.city,
        deliveryZone: reg3.deliveryZone,
        zoneType: reg3.zoneType,
        platform: reg2.platform,
        dailyIncome: dailyIncome ? Number(dailyIncome) : undefined,
        workingHours: reg2.workingHours, workingDays: reg2.workingDays, avgDailyHours: reg2.avgDailyHours,
      });

      updateUser({
        backendUserId: syncResult.backendUserId,
        kycVerified: syncResult.kycVerified,
        accountStatus: syncResult.accountStatus,
      });
    } catch {
      // Keep local account active even when backend is temporarily unavailable.
    } finally {
      setSubmitting(false);
    }
  };

  const stepDots = (current: number) => (
    <View style={styles.dots}>
      {[1, 2, 3].map(i => (
        <View key={i} style={[styles.dot, i <= current && styles.dotActive]} />
      ))}
    </View>
  );

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            {mode !== 'choose' && mode !== 'success' ? (
              <TouchableOpacity onPress={handleBack} style={styles.iconBtn} accessibilityLabel="Go back">
                <ArrowLeft size={20} color="#fff" />
              </TouchableOpacity>
            ) : (
              <View style={styles.logoRow}>
                <Image
                  source={require('../../assets/logo.png')}
                  style={styles.logoIcon}
                  resizeMode="contain"
                />
                <Text style={styles.logoText}>Rakshit<Text style={{ color: colors.primary }}>Artha</Text></Text>
              </View>
            )}
            <Text style={styles.headerTitle}>{modeTitle[mode]}</Text>
            {mode !== 'success' ? (
              <TouchableOpacity onPress={onClose} style={styles.iconBtn} accessibilityLabel="Close">
                <X size={20} color="rgba(255,255,255,0.7)" />
              </TouchableOpacity>
            ) : <View style={{ width: 36 }} />}
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyInner} keyboardShouldPersistTaps="handled">
            {error ? <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View> : null}

            {/* CHOOSE */}
            {mode === 'choose' && (
              <View style={styles.form}>
                <Text style={styles.formTitle}>Welcome!</Text>
                <Text style={styles.formSubtitle}>Enter your email to sign in or create a new account.</Text>
                <Text style={styles.label}>Email Address</Text>
                <TextInput
                  style={styles.input} placeholder="yourname@email.com"
                  placeholderTextColor={colors.mutedForeground}
                  value={loginData.email} onChangeText={v => setLoginData(p => ({ ...p, email: v }))}
                  keyboardType="email-address" autoCapitalize="none"
                />
                <TouchableOpacity onPress={handleCheckEmail} disabled={loadingEmail} style={[styles.submitBtn, loadingEmail && { opacity: 0.6 }]}>
                  <Text style={styles.submitBtnText}>{loadingEmail ? 'Checking email...' : 'Continue'}</Text>
                  {!loadingEmail && <ArrowRight size={16} color="#fff" />}
                </TouchableOpacity>
                <TouchableOpacity onPress={handleCreateAccount} style={styles.linkBtn}>
                  <Text style={styles.linkBtnText}>New here? Create a new account</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setMode('insurer-login'); setError(''); }} style={styles.linkBtn}>
                  <Text style={styles.linkBtnText}>Insurer admin login</Text>
                </TouchableOpacity>

                <View style={styles.mockSection}>
                  <Text style={styles.mockTitle}>Mock Test Logins</Text>
                  {MOCK_RISK_PROFILES.map((preset) => (
                    <TouchableOpacity
                      key={preset.id}
                      style={styles.mockCard}
                      onPress={() => void handleMockAccess(preset.id)}
                      disabled={submitting}
                    >
                      <View>
                        <Text style={styles.mockCardTitle}>{preset.title}</Text>
                        <Text style={styles.mockCardSubtitle}>{preset.subtitle}</Text>
                      </View>
                      <Text style={styles.mockCardAction}>{submitting ? 'Please wait' : 'Use'}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* LOGIN */}
            {(mode === 'login' || mode === 'insurer-login') && (
              <View style={styles.form}>
                <Text style={styles.formTitle}>{mode === 'insurer-login' ? 'Insurer Admin Login' : 'Sign In'}</Text>
                <Text style={styles.formSubtitle}>{mode === 'insurer-login' ? 'Insurer accounts are created only in backend by admin.' : 'Welcome back! Enter your password.'}</Text>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  style={[styles.input, mode !== 'insurer-login' && styles.inputReadOnly]}
                  value={loginData.email}
                  onChangeText={v => mode === 'insurer-login' && setLoginData(p => ({ ...p, email: v }))}
                  editable={mode === 'insurer-login'}
                  placeholder={mode === 'insurer-login' ? 'insurer.admin@rakshitartha.in' : undefined}
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <Text style={styles.label}>Password</Text>
                <View style={styles.pwRow}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]} placeholder="Your password"
                    placeholderTextColor={colors.mutedForeground}
                    value={loginData.password} onChangeText={v => setLoginData(p => ({ ...p, password: v }))}
                    secureTextEntry={!showPw}
                  />
                  <TouchableOpacity onPress={() => setShowPw(p => !p)} style={styles.eyeBtn}>
                    {showPw ? <EyeOff size={16} color={colors.mutedForeground} /> : <Eye size={16} color={colors.mutedForeground} />}
                  </TouchableOpacity>
                </View>
                <TouchableOpacity onPress={handleLogin} style={styles.submitBtn}>
                  <Text style={styles.submitBtnText}>{mode === 'insurer-login' ? 'Login as Insurer Admin' : 'Sign In'}</Text>
                  <ArrowRight size={16} color="#fff" />
                </TouchableOpacity>
                {mode !== 'insurer-login' && (
                  <TouchableOpacity onPress={handleCreateAccount} style={styles.linkBtn}>
                    <Text style={styles.linkBtnText}>Need an account? Sign up</Text>
                  </TouchableOpacity>
                )}

                {mode !== 'insurer-login' && (
                  <View style={styles.mockSection}>
                    <Text style={styles.mockTitle}>Quick Verification Logins</Text>
                    {MOCK_RISK_PROFILES.map((preset) => (
                      <TouchableOpacity
                        key={`login-${preset.id}`}
                        style={styles.mockCard}
                        onPress={() => void handleMockAccess(preset.id)}
                        disabled={submitting}
                      >
                        <View>
                          <Text style={styles.mockCardTitle}>{preset.title}</Text>
                          <Text style={styles.mockCardSubtitle}>{preset.email}</Text>
                        </View>
                        <Text style={styles.mockCardAction}>{submitting ? 'Please wait' : 'Use'}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* REGISTER STEP 1 */}
            {mode === 'register-1' && (
              <View style={styles.form}>
                {stepDots(1)}
                <View style={styles.stepHeader}>
                  <View style={styles.stepIcon}><User size={20} color={colors.primary} /></View>
                  <View><Text style={styles.formTitle}>Basic Details</Text><Text style={styles.stepNum}>Step 1 of 3</Text></View>
                </View>
                {[
                  { label: 'Full Name *', key: 'name', placeholder: 'e.g. Rahul Kumar' },
                  { label: 'Email Address *', key: 'email', placeholder: 'yourname@email.com' },
                  { label: 'Phone Number *', key: 'phone', placeholder: '9876543210' },
                  { label: 'Password *', key: 'password', placeholder: 'Min. 6 characters', secure: true },
                  { label: 'Confirm Password *', key: 'confirmPassword', placeholder: 'Repeat password', secure: true },
                ].map(f => (
                  <View key={f.key}>
                    <Text style={styles.label}>{f.label}</Text>
                    <TextInput
                      style={styles.input} placeholder={f.placeholder}
                      placeholderTextColor={colors.mutedForeground}
                      value={reg1[f.key as keyof typeof reg1]}
                      onChangeText={v => setReg1(p => ({ ...p, [f.key]: v }))}
                      secureTextEntry={f.secure && !showPw}
                      keyboardType={f.key === 'email' ? 'email-address' : f.key === 'phone' ? 'phone-pad' : 'default'}
                      autoCapitalize="none"
                    />
                  </View>
                ))}
                <TouchableOpacity onPress={handleReg1Next} style={styles.submitBtn}>
                  <Text style={styles.submitBtnText}>Next — Work Details</Text>
                  <ArrowRight size={16} color="#fff" />
                </TouchableOpacity>
              </View>
            )}

            {/* REGISTER STEP 2 */}
            {mode === 'register-2' && (
              <View style={styles.form}>
                {stepDots(2)}
                <View style={styles.stepHeader}>
                  <View style={styles.stepIcon}><Briefcase size={20} color={colors.primary} /></View>
                  <View><Text style={styles.formTitle}>Work Details</Text><Text style={styles.stepNum}>Step 2 of 3</Text></View>
                </View>
                <Text style={styles.label}>Platform *</Text>
                <View style={styles.chipRow}>
                  {PLATFORMS.map(pl => (
                    <TouchableOpacity
                      key={pl.id} onPress={() => setReg2(p => ({ ...p, platform: pl.id }))}
                      style={[styles.chip, reg2.platform === pl.id && styles.chipActive]}
                    >
                      <Text style={styles.chipEmoji}>{pl.emoji}</Text>
                      <Text style={[styles.chipText, reg2.platform === pl.id && styles.chipTextActive]}>{pl.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.label}>Working Hours *</Text>
                <TextInput style={styles.input} placeholder="e.g. 2 PM – 10 PM" placeholderTextColor={colors.mutedForeground} value={reg2.workingHours} onChangeText={v => setReg2(p => ({ ...p, workingHours: v }))} />
                <Text style={styles.label}>Working Days *</Text>
                <View style={styles.chipRow}>
                  {WORKING_DAYS.map(d => (
                    <TouchableOpacity key={d.id} onPress={() => setReg2(p => ({ ...p, workingDays: d.id }))} style={[styles.chip, reg2.workingDays === d.id && styles.chipActive]}>
                      <Text style={[styles.chipText, reg2.workingDays === d.id && styles.chipTextActive]}>{d.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.label}>Avg Daily Hours *</Text>
                <TextInput style={styles.input} placeholder="e.g. 8" placeholderTextColor={colors.mutedForeground} value={reg2.avgDailyHours} onChangeText={v => setReg2(p => ({ ...p, avgDailyHours: v }))} keyboardType="numeric" />
                <TouchableOpacity onPress={handleReg2Next} style={styles.submitBtn}>
                  <Text style={styles.submitBtnText}>Next — Location</Text>
                  <ArrowRight size={16} color="#fff" />
                </TouchableOpacity>
              </View>
            )}

            {/* REGISTER STEP 3 */}
            {mode === 'register-3' && (
              <View style={styles.form}>
                {stepDots(3)}
                <View style={styles.stepHeader}>
                  <View style={styles.stepIcon}><MapPin size={20} color={colors.primary} /></View>
                  <View><Text style={styles.formTitle}>Location Details</Text><Text style={styles.stepNum}>Step 3 of 3</Text></View>
                </View>
                <Text style={styles.label}>City *</Text>
                <TextInput style={styles.input} placeholder="e.g. Bengaluru" placeholderTextColor={colors.mutedForeground} value={reg3.city} onChangeText={v => setReg3(p => ({ ...p, city: v }))} />
                <Text style={styles.label}>Delivery Zone *</Text>
                <TextInput style={styles.input} placeholder="e.g. Koramangala Zone 4B" placeholderTextColor={colors.mutedForeground} value={reg3.deliveryZone} onChangeText={v => setReg3(p => ({ ...p, deliveryZone: v }))} />
                <Text style={styles.label}>Zone Type *</Text>
                <View style={styles.chipRow}>
                  {ZONE_TYPES.map(z => (
                    <TouchableOpacity key={z} onPress={() => setReg3(p => ({ ...p, zoneType: z }))} style={[styles.chip, reg3.zoneType === z && styles.chipActive]}>
                      <Text style={[styles.chipText, reg3.zoneType === z && styles.chipTextActive]}>{z}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.label}>Daily Income (₹)</Text>
                <TextInput style={styles.input} placeholder="e.g. 1200" placeholderTextColor={colors.mutedForeground} value={dailyIncome} onChangeText={setDailyIncome} keyboardType="numeric" />
                <TouchableOpacity onPress={handleReg3Submit} style={[styles.submitBtn, submitting && { opacity: 0.7 }]} disabled={submitting}>
                  <Text style={styles.submitBtnText}>{submitting ? 'Creating...' : 'Create My Account'}</Text>
                  <CheckCircle2 size={16} color="#fff" />
                </TouchableOpacity>
              </View>
            )}

            {/* SUCCESS */}
            {mode === 'success' && (
              <View style={styles.successContainer}>
                <View style={styles.successIcon}>
                  <CheckCircle2 size={48} color={colors.success} />
                </View>
                <Text style={styles.successTitle}>You're all set! 🎉</Text>
                <Text style={styles.successSubtitle}>Welcome to RakshitArtha, {reg1.name || 'Worker'}!</Text>
                <Text style={styles.successNote}>Your income protection is now active.</Text>
                <View style={styles.progressBar}>
                  <View style={styles.progressFill} />
                </View>
                <Text style={styles.redirectText}>Redirecting to dashboard…</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  sheet: { width: '100%', maxWidth: 520, height: '90%', minHeight: 420, backgroundColor: colors.card, borderRadius: radius['2xl'], overflow: 'hidden', ...shadow.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 60, backgroundColor: colors.sidebar },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoIcon: { width: 28, height: 28, borderRadius: radius.lg, backgroundColor: `${colors.primary}33`, alignItems: 'center', justifyContent: 'center' },
  logoText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  headerTitle: { fontSize: 14, fontWeight: '700', color: '#fff' },
  iconBtn: { padding: 8, borderRadius: radius.lg },
  body: { flex: 1, minHeight: 0 },
  bodyInner: { padding: 20, paddingBottom: 32 },
  errorBox: { backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', borderRadius: radius.xl, padding: 12, marginBottom: 16 },
  errorText: { color: colors.destructive, fontSize: 13, fontWeight: '500' },
  form: { gap: 14 },
  formTitle: { fontSize: 22, fontWeight: '800', color: colors.foreground },
  formSubtitle: { fontSize: 13, color: colors.mutedForeground },
  label: { fontSize: 13, fontWeight: '600', color: colors.foreground },
  input: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.secondary, color: colors.foreground, fontSize: 14 },
  inputReadOnly: { opacity: 0.6 },
  pwRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyeBtn: { padding: 12 },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, paddingVertical: 14, borderRadius: radius['2xl'], marginTop: 8, ...shadow.primary },
  submitBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  linkBtn: { alignItems: 'center', paddingVertical: 4 },
  linkBtnText: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  dots: { flexDirection: 'row', gap: 8 },
  dot: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.muted },
  dotActive: { backgroundColor: colors.primary },
  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepIcon: { width: 40, height: 40, borderRadius: radius.xl, backgroundColor: `${colors.primary}22`, alignItems: 'center', justifyContent: 'center' },
  stepNum: { fontSize: 11, color: colors.mutedForeground },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.xl, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.card, flexDirection: 'row', alignItems: 'center', gap: 6 },
  chipActive: { borderColor: colors.primary, backgroundColor: `${colors.primary}22` },
  chipEmoji: { fontSize: 14 },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.foreground },
  chipTextActive: { color: colors.primary },
  successContainer: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  successIcon: { width: 96, height: 96, borderRadius: 48, backgroundColor: 'rgba(34,197,94,0.15)', alignItems: 'center', justifyContent: 'center' },
  successTitle: { fontSize: 24, fontWeight: '800', color: colors.foreground },
  successSubtitle: { fontSize: 14, color: colors.mutedForeground },
  successNote: { fontSize: 13, color: colors.mutedForeground },
  progressBar: { width: '80%', height: 6, backgroundColor: colors.muted, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', width: '100%', backgroundColor: colors.primary, borderRadius: 3 },
  redirectText: { fontSize: 12, color: colors.mutedForeground },
  mockSection: {
    marginTop: 8,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: 10,
    backgroundColor: `${colors.primary}08`,
  },
  mockTitle: { fontSize: 12, fontWeight: '700', color: colors.foreground },
  mockCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
  },
  mockCardTitle: { fontSize: 13, fontWeight: '700', color: colors.foreground },
  mockCardSubtitle: { fontSize: 11, color: colors.mutedForeground },
  mockCardAction: { fontSize: 12, fontWeight: '700', color: colors.primary },
});
