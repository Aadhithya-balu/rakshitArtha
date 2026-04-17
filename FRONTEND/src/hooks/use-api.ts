import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, PlanSelection } from '@/services/api';

type UserIdentifier = { userId?: string; email?: string };

const shouldRetry = (count: number, err: unknown) => {
  const msg = err instanceof Error ? err.message.toLowerCase() : '';
  if (msg.includes('not found') || msg.includes('404')) return false;
  return count < 2;
};

export function useWorkerProfile(identifier?: UserIdentifier) {
  return useQuery({
    queryKey: ['workerProfile', identifier?.userId, identifier?.email],
    queryFn: () => api.getWorkerProfile(identifier!),
    enabled: Boolean(identifier?.userId || identifier?.email),
    staleTime: 30000,
    retry: shouldRetry,
    refetchInterval: (q) => (q.state.status === 'success' ? 15000 : false),
  });
}

export function usePolicy(identifier?: UserIdentifier) {
  return useQuery({
    queryKey: ['policy', identifier?.userId, identifier?.email],
    queryFn: () => api.getPolicy(identifier!),
    enabled: Boolean(identifier?.userId || identifier?.email),
    staleTime: 30000,
    retry: shouldRetry,
    refetchInterval: (q) => (q.state.status === 'success' ? 15000 : false),
  });
}

export function useClaims(identifier?: UserIdentifier) {
  return useQuery({
    queryKey: ['claims', identifier?.userId, identifier?.email],
    queryFn: () => api.getClaims(identifier!),
    enabled: Boolean(identifier?.userId || identifier?.email),
    staleTime: 30000,
    retry: shouldRetry,
    refetchInterval: (q) => (q.state.status === 'success' ? 15000 : false),
  });
}

export function useRiskSnapshot(identifier?: UserIdentifier) {
  return useQuery({
    queryKey: ['riskSnapshot', identifier?.userId, identifier?.email],
    queryFn: () => api.getRiskSnapshot(identifier!),
    enabled: Boolean(identifier?.userId || identifier?.email),
    staleTime: 10000,
    retry: shouldRetry,
    refetchInterval: (q) => (q.state.status === 'success' ? 10000 : false),
  });
}

export function usePlatformActivity(identifier?: UserIdentifier, platform?: string) {
  return useQuery({
    queryKey: ['platformActivity', identifier?.userId, identifier?.email, platform],
    queryFn: () => api.getPlatformActivity(identifier!, platform),
    enabled: Boolean(identifier?.userId || identifier?.email),
    staleTime: 10000,
    retry: shouldRetry,
    refetchInterval: (q) => (q.state.status === 'success' ? 10000 : false),
  });
}

export function useSyncPlatformActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ identifier, platform }: { identifier: UserIdentifier; platform?: string }) =>
      api.syncPlatformActivity(identifier, platform),
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['platformActivity', v.identifier?.userId, v.identifier?.email, v.platform] });
    },
  });
}

export function useAlerts(identifier?: UserIdentifier) {
  return useQuery({
    queryKey: ['alerts', identifier?.userId, identifier?.email],
    queryFn: () => api.getAlerts(identifier!),
    enabled: Boolean(identifier?.userId || identifier?.email),
    staleTime: 10000,
    refetchInterval: 10000,
  });
}

export function useAutomationNotifications(identifier?: UserIdentifier) {
  return useQuery({
    queryKey: ['automationNotifications', identifier?.userId, identifier?.email],
    queryFn: () => api.getAutomationNotifications(identifier),
    enabled: Boolean(identifier?.userId || identifier?.email),
    staleTime: 10000,
    refetchInterval: 10000,
  });
}

export function useNearbyZones(identifier?: UserIdentifier) {
  return useQuery({
    queryKey: ['nearbyZones', identifier?.userId, identifier?.email],
    queryFn: () => api.getNearbyZones(identifier!),
    enabled: Boolean(identifier?.userId || identifier?.email),
    staleTime: 30000,
    retry: shouldRetry,
    refetchInterval: (q) => (q.state.status === 'success' ? 30000 : false),
  });
}

export function useSimulatePayout() {
  return useMutation({
    mutationFn: ({ identifier, dailyIncome }: { identifier: UserIdentifier; dailyIncome: number }) =>
      api.getProtectionEstimate(identifier, dailyIncome),
  });
}

export function useSimulateDemoClaim() {
  return useMutation({
    mutationFn: ({ identifier, payload }: {
      identifier: UserIdentifier;
      payload: Parameters<typeof api.simulateDemoClaim>[1];
    }) => api.simulateDemoClaim(identifier, payload),
  });
}

export function useRunDemoWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ identifier }: { identifier: UserIdentifier }) => api.runDemoWorkflow(identifier),
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['insurerDashboard'] });
      qc.invalidateQueries({ queryKey: ['claims', v.identifier.userId, v.identifier.email] });
      qc.invalidateQueries({ queryKey: ['demoWorkflowState', v.identifier.userId, v.identifier.email] });
    },
  });
}

export function useDemoWorkflowState(identifier?: UserIdentifier, options?: { enabled?: boolean; refetchInterval?: number }) {
  return useQuery({
    queryKey: ['demoWorkflowState', identifier?.userId, identifier?.email],
    queryFn: () => api.getDemoWorkflowState(identifier!),
    enabled: Boolean(identifier?.userId || identifier?.email) && (options?.enabled ?? true),
    staleTime: 2000,
    retry: shouldRetry,
    refetchInterval: options?.refetchInterval ?? false,
  });
}

export function useResetDemoWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ identifier }: { identifier: UserIdentifier }) => api.resetDemoWorkflow(identifier),
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['insurerDashboard'] });
      qc.invalidateQueries({ queryKey: ['claims', v.identifier.userId, v.identifier.email] });
      qc.invalidateQueries({ queryKey: ['demoWorkflowState', v.identifier.userId, v.identifier.email] });
    },
  });
}

export function useActivatePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ identifier, selectedPlan, overallRisk }: {
      identifier: UserIdentifier;
      selectedPlan: PlanSelection;
      overallRisk?: number | null;
    }) => api.activatePlan(identifier, selectedPlan, overallRisk),
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['policy', v.identifier.userId, v.identifier.email] });
      qc.invalidateQueries({ queryKey: ['workerProfile', v.identifier.userId, v.identifier.email] });
    },
  });
}

export function useCreatePaymentOrder() {
  return useMutation({
    mutationFn: ({ identifier, selectedPlan, overallRisk }: {
      identifier: UserIdentifier;
      selectedPlan: PlanSelection;
      overallRisk?: number | null;
    }) => api.createPaymentOrder(identifier, selectedPlan, overallRisk),
  });
}

export function useVerifyPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ identifier, payload }: {
      identifier: UserIdentifier;
      payload: { policyId: string; razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string };
    }) => api.verifyPaymentAndActivatePlan(identifier, payload),
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['policy', v.identifier.userId, v.identifier.email] });
      qc.invalidateQueries({ queryKey: ['riskSnapshot', v.identifier.userId, v.identifier.email] });
      qc.invalidateQueries({ queryKey: ['claims', v.identifier.userId, v.identifier.email] });
    },
  });
}

export function useGetPremiumQuote() {
  return useMutation({
    mutationFn: ({ userId, plan, overallRisk }: { userId: string; plan: string; overallRisk?: number | null }) =>
      api.getPremiumQuote({ userId, plan, overallRisk }),
  });
}

export function useInsurerDashboard(identifier?: UserIdentifier) {
  return useQuery({
    queryKey: ['insurerDashboard', identifier?.userId, identifier?.email],
    queryFn: () => api.getInsurerDashboard(identifier!),
    enabled: Boolean(identifier?.userId || identifier?.email),
    staleTime: 20000,
    retry: shouldRetry,
    refetchInterval: (q) => (q.state.status === 'success' ? 20000 : false),
  });
}

export function usePaymentDetails(identifier?: UserIdentifier) {
  return useQuery({
    queryKey: ['paymentDetails', identifier?.userId, identifier?.email],
    queryFn: () => api.getPaymentDetails(identifier!),
    enabled: Boolean(identifier?.userId || identifier?.email),
    staleTime: 30000,
    retry: shouldRetry,
  });
}

export function useAddPaymentDetails() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ identifier, payload }: {
      identifier: UserIdentifier;
      payload: Parameters<typeof api.addPaymentDetails>[1];
    }) => api.addPaymentDetails(identifier, payload),
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['paymentDetails', v.identifier.userId, v.identifier.email] });
      qc.invalidateQueries({ queryKey: ['userPayouts', v.identifier.userId] });
    },
  });
}

export function useUserPayouts(userId?: string) {
  return useQuery({
    queryKey: ['userPayouts', userId],
    queryFn: () => api.getUserPayouts(userId!),
    enabled: Boolean(userId),
    staleTime: 30000,
    retry: shouldRetry,
    refetchInterval: (q) => (q.state.status === 'success' ? 15000 : false),
  });
}

export function usePayoutStats() {
  return useQuery({
    queryKey: ['payoutStats'],
    queryFn: () => api.getPayoutStats(),
    staleTime: 60000,
    retry: shouldRetry,
  });
}

export function useProcessPayout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ claimId, method }: { claimId: string; method: string }) =>
      fetch(`/api/claims/${claimId}/payout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payoutMethod: method }),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['claims'] });
      qc.invalidateQueries({ queryKey: ['userPayouts'] });
      qc.invalidateQueries({ queryKey: ['payoutStats'] });
      qc.invalidateQueries({ queryKey: ['paymentDetails'] });
    },
  });
}
