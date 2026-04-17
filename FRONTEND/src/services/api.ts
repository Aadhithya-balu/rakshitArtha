import { NativeModules } from 'react-native';
export interface WorkerProfile {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  platform: string;
  dailyIncome: number | null;
  workingHours?: string;
  workingDays?: string;
  avgDailyHours?: string;
  city?: string;
  deliveryZone?: string;
  zoneType: string;
  trustScore: number | null;
  backendUserId: string;
  location?: string;
}

export interface Policy {
  id: string;
  plan: string;
  weeklyPremium: number;
  coverageAmount: number;
  lockedPayableAmount?: number;
  status: string;
  expiryDate: string;
  startDate: string;
  riskFactor?: number;
  paymentStatus?: string;
  nextPaymentDue?: string;
  lastPaymentAt?: string;
  amountPaid?: number;
  sourceType?: 'LIVE' | 'DEMO';
  billingHistory?: {
    cycleStart?: string;
    cycleEnd?: string;
    amount?: number;
    status?: string;
    razorpayOrderId?: string;
    razorpayPaymentId?: string;
    paidAt?: string;
  }[];
}

export interface PaymentOrder {
  policyId: string;
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
  weeklyPremium: number;
  coverageAmount: number;
  lockedPayableAmount?: number;
  nextPaymentDue: string;
  paymentProvider?: string;
  checkoutUrl?: string;
}

export interface PaymentDetails {
  id?: string;
  userId: string;
  accountHolderName?: string | null;
  bankName?: string | null;
  accountNumber?: string | null;
  ifscCode?: string | null;
  upiId?: string | null;
  isVerified?: boolean;
  verifiedAt?: string | null;
  verificationMethod?: string | null;
  updatedAt?: string;
}

export interface PayoutStats {
  totalPayouts: number;
  totalAmount: number;
  completedPayouts: number;
  completedAmount: number;
  pendingPayouts: number;
  processingPayouts: number;
  failedPayouts: number;
  successRate: string;
}

export interface Claim {
  id: string;
  disruptionType: string;
  status: string;
  payout: number;
  zone: string;
  date: string;
  fraudScore?: number;
  fraudFlags?: string[];
  fraudDescription?: string;
  fraudReviewTier?: 'GREEN' | 'YELLOW' | 'RED';
  fraudNextAction?: 'AUTO_APPROVE' | 'ASK_CONTEXT' | 'MANUAL_REVIEW';
  riskScore?: number;
  approvalNotes?: string;
  payoutMethod?: string;
  payoutDate?: string;
  rejectionReason?: string;
  sourceType?: 'LIVE' | 'DEMO';
  fraudLayerEvidence?: Record<string, { triggered?: boolean; score?: number; reason?: string; reviewTier?: string; nextAction?: string }>;
  triggerEvidence?: {
    weatherData?: { rainfall?: number; aqi?: number; temperature?: number };
    activityData?: { deliveriesCompleted?: number };
    payoutComputation?: {
      triggerSeverity?: number;
      workerImpact?: number;
      personalizationMultiplier?: number;
      authenticityMultiplier?: number;
      estimatedLoss?: number;
    };
  };
}

export interface Alert {
  id: string;
  title: string;
  description: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Info';
  timestamp: string;
  zone: string;
}

export interface RiskSnapshot {
  overallRisk: number | null;
  environmentalRisk: number | null;
  locationRisk: number | null;
  activityRisk: number | null;
  rainfall: number | null;
  aqi: number | null;
  temperature: number | null;
  trafficIndex: number | null;
  zone: string | null;
  riskZone: string | null;
  address: string | null;
  dataSource: string | null;
  updatedAt: string | null;
}

export interface PlatformActivityState {
  sourcePlatform: string;
  platformUserId: string | null;
  userId: string | null;
  activityStatus: string;
  activeOrders: number;
  earnings: number;
  weeklyIncome: number;
  weeklyHours: number;
  rideOrOrderCount: number;
  idleDuration: number | null;
  avgOrdersPerHour: number;
  earningsTrend: number;
  activityFactor: number;
  isFullyActive: boolean;
  syncStatus: string;
  syncTimestamp: string | null;
  lastUpdated: string | null;
  source?: string;
  location?: {
    city?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    label?: string | null;
  } | null;
}

export interface AutomationNotification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  severity: string;
  zone: string;
  delivered: boolean;
  deliveredAt: string;
  data?: Record<string, unknown>;
}

export interface NearbyZone {
  zoneName: string;
  placeId: string | null;
  distanceKm: number | null;
  riskScore: number;
  riskLabel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
}

export interface ProtectionEstimate {
  estimatedLoss: number;
  payout: number;
  disruptionPercent: number;
  weeklyPremium?: number;
  coverageAmount?: number;
  grossEstimatedLoss?: number;
  overlapHours?: number;
  overlapRatio?: number;
  reason?: string;
  shiftType?: string;
  auditTrace?: {
    shift?: string | null;
    disruption?: string | null;
    overlapHours?: number;
    overlapRatio?: number;
  };
}

export interface InsurerDashboard {
  portfolio: {
    totalPolicies: number;
    activePolicies: number;
    totalClaims: number;
    approvedClaims: number;
    rejectedClaims: number;
    approvalRate: number;
    approvalRatePercent?: number;
  };
  finance: {
    premiumsCollected: number;
    payouts: number;
    lossRatio: number;
    lossRatioPercent?: number;
  };
  predictive: {
    avgRecentRisk: number;
    avgRainfall: number;
    predictedWeatherClaimsNextWeek: number;
    projectedFinancialImpactInr?: number;
  };
  platform?: {
    bySource: Array<{
      sourcePlatform: string;
      totalSyncs: number;
      activeCount: number;
      idleCount: number;
      avgActivityFactor: number;
      avgEarnings: number;
      latestSyncAt: string | null;
    }>;
    activeWorkers: number;
    idleWorkers: number;
  };
}

export interface DemoSimulationResult {
  approved: boolean;
  rejectionReason: string | null;
  claimAmount: number;
  fraudScore: number;
  incomeLossPercent: number;
  workflow: {
    policyPaymentVerified: { passed: boolean; reason: string };
    disruptionDetected: { passed: boolean; reason: string };
    incomeLossValidated: { passed: boolean; reason: string };
    fraudLayers: Record<string, { triggered: boolean; score: number; reason: string }>;
    fraudDecision?: { passed: boolean; score: number; reason: string; reviewTier?: string; nextAction?: string };
    reviewTier?: string;
    nextAction?: string;
    payoutCalculated: { passed: boolean; amount: number; reason: string };
    payoutSent: { passed: boolean; reason: string };
    notificationSent: { passed: boolean; reason: string };
  };
  automation?: {
    claimCreated?: boolean;
    claimId?: string;
    payoutStatus?: string;
    transactionId?: string | null;
    autoPayoutTriggered?: boolean;
    motionConsentRequired?: boolean;
  };
}

export interface DemoWorkflowStep {
  stepKey: string;
  title: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED';
  message: string;
  timestamp: string;
}

export interface DemoWorkflowResult {
  runId: string;
  userId: string;
  claimId: string;
  payoutId: string;
  claimAmount: number;
  payoutAmount: number;
  steps: DemoWorkflowStep[];
  notification: {
    title: string;
    message: string;
    severity: string;
    sentAt: string;
  };
  workflowStatus: 'COMPLETED';
  insurerDashboardImpact: {
    totalClaimsIncrement: number;
    totalPayoutIncrement: number;
  };
}

export interface DemoResetResult {
  removedRuns: number;
  removedClaims: number;
  removedPayouts: number;
}

export type PlanSelection = 'standard' | 'premium';
type UserIdentifier = { userId?: string; email?: string };

const INSURANCE_PORT = 5000;
const AUTOMATION_PORT = 3000;

function getConfiguredApiHost(): string | null {
  const envHost = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    ?.process?.env?.EXPO_PUBLIC_API_HOST;
  const host = envHost?.trim();
  return host ? host.replace(/^https?:\/\//i, '') : null;
}

function getMetroHost(): string | null {
  const scriptURL = NativeModules?.SourceCode?.scriptURL as string | undefined;
  if (!scriptURL) return null;
  const match = scriptURL.match(/^https?:\/\/([^/:]+)(?::\d+)?\//i);
  return match?.[1] || null;
}

function buildBases(port: number): string[] {
  const metroHost = getMetroHost();
  const configuredHost = getConfiguredApiHost();

  const candidates = [
    // ✅ FIXED (with port)
    `http://13.205.17.56:${port}`,

    metroHost ? `http://${metroHost}:${port}` : null,
    configuredHost ? `http://${configuredHost}:${port}` : null,
    `http://10.0.2.2:${port}`,
    `http://localhost:${port}`,
    `http://127.0.0.1:${port}`,
  ].filter(Boolean) as string[];

 
  // Keep order stable but avoid duplicate attempts.
  return [...new Set(candidates)];
}

async function fetchWithFallback(bases: string[], path: string, init?: RequestInit): Promise<Response> {
  let lastErr: unknown;
  for (const base of bases) {
    try {
      const res = await fetch(`${base}${path}`, init);
      if ([502, 503, 504].includes(res.status)) continue;
      return res;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('All API bases unreachable');
}

const fetchInsurance = (path: string, init?: RequestInit) => fetchWithFallback(buildBases(INSURANCE_PORT), path, init);
const fetchAutomation = (path: string, init?: RequestInit) => fetchWithFallback(buildBases(AUTOMATION_PORT), path, init);

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  const raw = await res.text();
  let body: unknown = null;
  if (raw) { try { body = JSON.parse(raw); } catch { body = { message: raw }; } }
  if (!res.ok) {
    const b = body as Record<string, unknown>;
    throw new Error((b?.message as string) || (b?.error as string) || 'API request failed');
  }
  return (body ?? {}) as Record<string, unknown>;
}

function toTitleCase(v: string) {
  return v.toLowerCase().split('_').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

// Profile cache to avoid redundant fetches
const profileCache = new Map<string, WorkerProfile>();

export function clearWorkerProfileCache(identifier?: UserIdentifier) {
  if (!identifier) {
    profileCache.clear();
    return;
  }

  if (identifier.userId) profileCache.delete(identifier.userId);
  if (identifier.email) profileCache.delete(identifier.email);
}

async function resolveProfile(identifier: UserIdentifier): Promise<WorkerProfile> {
  const key = identifier.userId || identifier.email || 'default';
  if (profileCache.has(key)) return profileCache.get(key)!;

  const path = identifier.userId
    ? `/auth/profile/${identifier.userId}`
    : `/auth/profile-by-email/${encodeURIComponent(identifier.email!)}`;

  let json: Record<string, unknown>;
  try {
    const res = await fetchInsurance(path);
    json = await parseJson(res);
  } catch (err) {
    // Fallback: if userId failed, try email
    if (identifier.userId && identifier.email) {
      const res = await fetchInsurance(`/auth/profile-by-email/${encodeURIComponent(identifier.email)}`);
      json = await parseJson(res);
    } else throw err;
  }

  const u = json.data as Record<string, unknown>;
  const rp = u.riskProfile as Record<string, unknown> | undefined;
  const profile: WorkerProfile = {
    id: u._id as string,
    backendUserId: u._id as string,
    name: u.name as string,
    email: u.email as string | undefined,
    phone: u.phone as string | undefined,
    platform: u.platform as string,
    dailyIncome: typeof u.dailyIncome === 'number' ? u.dailyIncome : null,
    workingHours: u.workingHours as string | undefined,
    workingDays: u.workingDays as string | undefined,
    avgDailyHours: u.avgDailyHours as string | undefined,
    city: u.city as string | undefined,
    deliveryZone: u.deliveryZone as string | undefined,
    zoneType: (u.zoneType as string) || 'Urban',
    trustScore: typeof rp?.reputationScore === 'number' ? rp.reputationScore as number : null,
    location: (u.location as string | undefined) || [u.city, u.deliveryZone].filter(Boolean).join(', ') || undefined,
  };

  profileCache.set(key, profile);
  profileCache.set(profile.backendUserId, profile);
  if (profile.email) profileCache.set(profile.email, profile);
  return profile;
}

function mapPolicy(x: Record<string, unknown>): Policy {
  return {
    id: x._id as string,
    plan: x.plan as string,
    weeklyPremium: x.weeklyPremium as number,
    coverageAmount: x.coverageAmount as number,
    lockedPayableAmount: x.lockedPayableAmount as number | undefined,
    status: toTitleCase(x.status as string),
    expiryDate: x.expiryDate as string,
    startDate: x.startDate as string,
    riskFactor: x.riskFactor as number | undefined,
    paymentStatus: x.paymentStatus ? toTitleCase(x.paymentStatus as string) : undefined,
    nextPaymentDue: x.nextPaymentDue as string | undefined,
    lastPaymentAt: x.lastPaymentAt as string | undefined,
    amountPaid: x.amountPaid as number | undefined,
    sourceType: x.sourceType as Policy['sourceType'] | undefined,
    billingHistory: Array.isArray(x.billingHistory)
      ? (x.billingHistory as Record<string, unknown>[]).map(e => ({
          cycleStart: e.cycleStart as string | undefined,
          cycleEnd: e.cycleEnd as string | undefined,
          amount: e.amount as number | undefined,
          status: e.status ? toTitleCase(e.status as string) : undefined,
          razorpayOrderId: e.razorpayOrderId as string | undefined,
          razorpayPaymentId: e.razorpayPaymentId as string | undefined,
          paidAt: e.paidAt as string | undefined,
        }))
      : [],
  };
}

function mapClaim(x: Record<string, unknown>): Claim {
  const ev = x.triggerEvidence as Record<string, unknown> | undefined;
  const ld = ev?.locationData as Record<string, unknown> | undefined;
  return {
    id: x._id as string,
    disruptionType: toTitleCase(x.claimType as string),
    status: x.status === 'SUBMITTED' ? 'Pending' : toTitleCase(x.status as string),
    payout: (x.payoutAmount as number) || (x.approvedAmount as number) || 0,
    zone: (ld?.address as string) || (ld?.zone as string) || 'Unknown Zone',
    date: x.createdAt as string,
    fraudScore: x.fraudScore as number | undefined,
    fraudFlags: (x.fraudFlags as string[]) || [],
    fraudDescription: x.fraudFlagDescription as string | undefined,
    fraudReviewTier: x.fraudReviewTier as Claim['fraudReviewTier'] | undefined,
    fraudNextAction: x.fraudNextAction as Claim['fraudNextAction'] | undefined,
    fraudLayerEvidence: x.fraudLayerEvidence as Claim['fraudLayerEvidence'] | undefined,
    riskScore: x.riskScore as number | undefined,
    approvalNotes: x.approvalNotes as string | undefined,
    payoutMethod: x.payoutMethod as string | undefined,
    payoutDate: x.payoutDate as string | undefined,
    rejectionReason: x.rejectionReason as string | undefined,
    sourceType: x.sourceType as Claim['sourceType'] | undefined,
    triggerEvidence: ev as Claim['triggerEvidence'],
  };
}

function mapPaymentDetails(x: Record<string, unknown> | null | undefined): PaymentDetails | null {
  if (!x) return null;
  return {
    id: x._id as string | undefined,
    userId: x.userId as string,
    accountHolderName: (x.accountHolderName as string | undefined) || null,
    bankName: (x.bankName as string | undefined) || null,
    accountNumber: (x.accountNumber as string | undefined) || null,
    ifscCode: (x.ifscCode as string | undefined) || null,
    upiId: (x.upiId as string | undefined) || null,
    isVerified: Boolean(x.isVerified),
    verifiedAt: (x.verifiedAt as string | undefined) || null,
    verificationMethod: (x.verificationMethod as string | undefined) || null,
    updatedAt: (x.updatedAt as string | undefined) || undefined,
  };
}

function mapRiskSnapshot(d: Record<string, unknown>): RiskSnapshot {
  const rm = (d.riskMetrics as Record<string, unknown>) || {};
  const wd = (d.weatherData as Record<string, unknown>) || {};
  const ad = (d.activityData as Record<string, unknown>) || {};
  const ld = (d.locationData as Record<string, unknown>) || {};
  return {
    overallRisk: typeof rm.overallRisk === 'number' ? rm.overallRisk : null,
    environmentalRisk: typeof rm.environmentalRisk === 'number' ? rm.environmentalRisk : null,
    locationRisk: typeof rm.locationRisk === 'number' ? rm.locationRisk : null,
    activityRisk: typeof rm.activityRisk === 'number' ? rm.activityRisk : null,
    rainfall: typeof wd.rainfall === 'number' ? wd.rainfall : null,
    aqi: typeof wd.aqi === 'number' ? wd.aqi : null,
    temperature: typeof wd.temperature === 'number' ? wd.temperature : null,
    trafficIndex: typeof ad.routeBlockages === 'number' ? ad.routeBlockages : null,
    zone: (ld.zone as string) || null,
    riskZone: (ld.riskZone as string) || null,
    address: (ld.address as string) || null,
    dataSource: (d.dataSource as string) || null,
    updatedAt: (d.timestamp as string) || (d.updatedAt as string) || null,
  };
}

const mapSelectedPlan = (plan: PlanSelection) => plan === 'premium' ? 'GIG_PREMIUM' : 'GIG_STANDARD';
const toRiskFactor = (r?: number | null) => typeof r === 'number' ? Math.max(0.5, Math.min(2, Number((r / 50).toFixed(2)))) : 1;

export const api = {
  getWorkerProfile: (id: UserIdentifier) => resolveProfile(id),

  getClaimCompleteStatus: async (claimId: string): Promise<Record<string, unknown>> => {
    const res = await fetchInsurance(`/claim/${encodeURIComponent(claimId)}/complete-status`);
    const json = await parseJson(res);
    return (json.data as Record<string, unknown>) || {};
  },

  getPolicy: async (id: UserIdentifier): Promise<Policy[]> => {
    const p = await resolveProfile(id);
    const res = await fetchInsurance(`/policy/user/${p.backendUserId}`);
    const json = await parseJson(res);
    return ((json.data as unknown[]) || []).map(x => mapPolicy(x as Record<string, unknown>));
  },

  getClaims: async (id: UserIdentifier): Promise<Claim[]> => {
    const p = await resolveProfile(id);
    const res = await fetchInsurance(`/claim/user/${p.backendUserId}/claims`);
    const json = await parseJson(res);
    return ((json.data as unknown[]) || []).map(x => mapClaim(x as Record<string, unknown>));
  },

  getRiskSnapshot: async (id: UserIdentifier): Promise<RiskSnapshot> => {
    const path = id.userId
      ? `/risk/user/${id.userId}/refresh`
      : `/risk/email/${encodeURIComponent(id.email!)}/refresh`;
    const res = await fetchInsurance(path, { method: 'POST' });
    const json = await parseJson(res);
    return mapRiskSnapshot(json.data as Record<string, unknown>);
  },

  getAlerts: async (id: UserIdentifier): Promise<Alert[]> => {
    const path = id.userId
      ? `/risk/user/${id.userId}/alerts`
      : `/risk/email/${encodeURIComponent(id.email!)}/alerts`;
    const res = await fetchInsurance(path);
    const json = await parseJson(res);
    const alerts = (((json.data as Record<string, unknown>)?.alerts as unknown[]) || []);
    return alerts.map((a: unknown) => {
      const x = a as Record<string, unknown>;
      return {
        id: (x.id as string) || `alert-${Date.now()}`,
        title: (x.title as string) || 'Risk Alert',
        description: (x.description as string) || 'No description.',
        severity: (x.severity as Alert['severity']) || 'Info',
        timestamp: (x.timestamp as string) || new Date().toISOString(),
        zone: (x.zone as string) || 'Your Zone',
      };
    });
  },

  getAutomationNotifications: async (id?: UserIdentifier): Promise<AutomationNotification[]> => {
    const suffix = id?.userId ? `?userId=${encodeURIComponent(id.userId)}` : '';
    const res = await fetchAutomation(`/api/v1/automation/notifications${suffix}`);
    const json = await parseJson(res);
    const records = (((json.data as unknown[]) || []) as Record<string, unknown>[]);
    return records.map((item) => ({
      id: item.id as string,
      userId: item.userId as string,
      type: item.type as string,
      title: item.title as string,
      message: item.message as string,
      severity: (item.severity as string) || 'INFO',
      zone: (item.zone as string) || 'Your Zone',
      delivered: Boolean(item.delivered),
      deliveredAt: item.deliveredAt as string,
      data: item.data as Record<string, unknown> | undefined,
    }));
  },

  getNearbyZones: async (id: UserIdentifier): Promise<NearbyZone[]> => {
    const path = id.userId
      ? `/risk/user/${id.userId}/nearby-zones`
      : `/risk/email/${encodeURIComponent(id.email!)}/nearby-zones`;
    const res = await fetchInsurance(path);
    const json = await parseJson(res);
    return ((json.data as Record<string, unknown>)?.zones as NearbyZone[]) || [];
  },

  getProtectionEstimate: async (id: UserIdentifier, dailyIncome: number): Promise<ProtectionEstimate> => {
    const p = await resolveProfile(id);
    const res = await fetchInsurance(`/policy/user/${p.backendUserId}/estimate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dailyIncome }),
    });
    const json = await parseJson(res);
    return json.data as ProtectionEstimate;
  },

  getInsurerDashboard: async (id: UserIdentifier): Promise<InsurerDashboard> => {
    const p = await resolveProfile(id);
    const res = await fetchInsurance(`/risk/admin/${p.backendUserId}/dashboard`);
    const json = await parseJson(res);
    return json.data as InsurerDashboard;
  },

  getPlatformActivity: async (id: UserIdentifier, platform?: string): Promise<PlatformActivityState> => {
    const p = await resolveProfile(id);
    const suffix = platform ? `?platform=${encodeURIComponent(platform)}` : '';
    const res = await fetchInsurance(`/platform/${p.backendUserId}${suffix}`);
    const json = await parseJson(res);
    return json.data as PlatformActivityState;
  },

  syncPlatformActivity: async (id: UserIdentifier, platform?: string): Promise<PlatformActivityState> => {
    const p = await resolveProfile(id);
    const targetPlatform = platform || p.platform;
    const res = await fetchInsurance(`/platform/sync/${encodeURIComponent(targetPlatform)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: p.backendUserId }),
    });
    const json = await parseJson(res);
    return json.data as PlatformActivityState;
  },

  syncPlatformBulk: async (platform: string): Promise<Record<string, unknown>> => {
    const res = await fetchInsurance(`/platform/sync/${encodeURIComponent(platform)}/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ triggerAutomation: true }),
    });
    const json = await parseJson(res);
    return json.data as Record<string, unknown>;
  },

  getPaymentDetails: async (id: UserIdentifier): Promise<PaymentDetails | null> => {
    const p = await resolveProfile(id);
    const res = await fetchInsurance(`/payment/user/${p.backendUserId}`);
    const json = await parseJson(res);
    return mapPaymentDetails((json.data as Record<string, unknown> | null | undefined) || null);
  },

  addPaymentDetails: async (id: UserIdentifier, payload: Omit<PaymentDetails, 'id' | 'userId'>): Promise<PaymentDetails> => {
    const p = await resolveProfile(id);
    const res = await fetchInsurance('/payment/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: p.backendUserId, ...payload }),
    });
    const json = await parseJson(res);
    return mapPaymentDetails(json.data as Record<string, unknown>)!;
  },

  getUserPayouts: async (userId: string) => {
    const p = await resolveProfile({ userId });
    const res = await fetchInsurance(`/payouts/user/${p.backendUserId}`);
    const json = await parseJson(res);
    return ((json.data as unknown[]) || []) as Array<Record<string, unknown>>;
  },

  getPayoutStats: async (): Promise<PayoutStats> => {
    const res = await fetchInsurance('/payouts/stats');
    const json = await parseJson(res);
    return (json.data as PayoutStats) || {
      totalPayouts: 0,
      totalAmount: 0,
      completedPayouts: 0,
      completedAmount: 0,
      pendingPayouts: 0,
      processingPayouts: 0,
      failedPayouts: 0,
      successRate: '0%',
    };
  },

  getPremiumQuote: async ({ userId, plan, overallRisk }: { userId: string; plan: string; overallRisk?: number | null }) => {
    const p = await resolveProfile({ userId });
    const res = await fetchInsurance('/policy/premium/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: p.backendUserId, plan, overallRisk }),
    });
    const json = await parseJson(res);
    return json.data as { weeklyPremium: number; coverageAmount: number };
  },

  activatePlan: async (id: UserIdentifier, selectedPlan: PlanSelection, overallRisk?: number | null) => {
    const p = await resolveProfile(id);
    await api.getPolicy({ userId: p.backendUserId });
    throw new Error('Direct policy activation is disabled. Use createPaymentOrder → payment → verifyPaymentAndActivatePlan');
  },

  createPaymentOrder: async (id: UserIdentifier, selectedPlan: PlanSelection, overallRisk?: number | null): Promise<PaymentOrder> => {
    const p = await resolveProfile(id);
    const res = await fetchInsurance('/policy/payment/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: p.backendUserId,
        plan: mapSelectedPlan(selectedPlan),
        overallRisk,
        triggerTypes: ['HEAVY_RAIN', 'HIGH_POLLUTION', 'TRAFFIC_BLOCKED'],
      }),
    });
    const json = await parseJson(res);
    return json.data as PaymentOrder;
  },

  verifyPaymentAndActivatePlan: async (id: UserIdentifier, payload: {
    policyId: string;
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  }) => {
    const res = await fetchInsurance('/policy/payment/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await parseJson(res);
    profileCache.delete(id.userId || id.email || 'default');
    return json.data;
  },

  simulateDemoClaim: async (id: UserIdentifier, payload: {
    selectedPlan: PlanSelection;
    disruptionType: string;
    otherReason?: string;
    rainfall: number;
    aqi: number;
    traffic: number;
    lostIncome: number;
    temperature?: number;
    inputMode?: 'live' | 'manual';
    manualFraudScore?: number;
  }): Promise<DemoSimulationResult> => {
    const p = await resolveProfile(id);
    const { selectedPlan, ...rest } = payload;
    const res = await fetchInsurance('/claim/demo/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: p.backendUserId, selectedPlan: mapSelectedPlan(selectedPlan), ...rest }),
    });
    const json = await parseJson(res);
    return json.data as DemoSimulationResult;
  },

  runDemoWorkflow: async (id: UserIdentifier): Promise<DemoWorkflowResult> => {
    const p = await resolveProfile(id);
    const payload = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: p.backendUserId }),
    };

    const paths = ['/api/v1/demo/run', '/api/demo/run', '/demo/run'];
    let lastError: unknown;

    for (const path of paths) {
      try {
        const res = await fetchInsurance(path, payload);
        const json = await parseJson(res);
        return json.data as DemoWorkflowResult;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error('Unable to run demo workflow');
  },

  getDemoWorkflowState: async (id: UserIdentifier): Promise<DemoWorkflowResult | null> => {
    const p = await resolveProfile(id);
    const paths = [
      `/api/v1/demo/state?userId=${encodeURIComponent(p.backendUserId)}`,
      `/api/demo/state?userId=${encodeURIComponent(p.backendUserId)}`,
      `/demo/state?userId=${encodeURIComponent(p.backendUserId)}`,
    ];
    let lastError: unknown;

    for (const path of paths) {
      try {
        const res = await fetchInsurance(path);
        const json = await parseJson(res);
        const run = (json.data as { run?: DemoWorkflowResult | null })?.run;
        return run || null;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error('Unable to fetch demo workflow state');
  },

  resetDemoWorkflow: async (id: UserIdentifier): Promise<DemoResetResult> => {
    const p = await resolveProfile(id);
    const payload = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: p.backendUserId }),
    };

    const paths = ['/api/v1/demo/reset', '/api/demo/reset', '/demo/reset'];
    let lastError: unknown;

    for (const path of paths) {
      try {
        const res = await fetchInsurance(path, payload);
        const json = await parseJson(res);
        return json.data as DemoResetResult;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error('Unable to reset demo workflow');
  },
};
