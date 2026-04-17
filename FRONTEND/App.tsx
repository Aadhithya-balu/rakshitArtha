import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Router, Switch, Route, Redirect } from 'wouter';
import { memoryLocation } from 'wouter/src/memory-location';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import Home from '@/pages/Home';
import Dashboard from '@/pages/Dashboard';
import Claims from '@/pages/Claims';
import Policy from '@/pages/Policy';
import Alerts from '@/pages/Alerts';
import Demo from '@/pages/Demo';
import Profile from '@/pages/Profile';
import KycVerification from '@/pages/KycVerification';
import InsurerDashboard from '@/pages/InsurerDashboard';
import WorkerDashboard from '@/pages/WorkerDashboard';
import Payouts from '@/pages/Payouts';
import AddPaymentDetails from '@/pages/AddPaymentDetails';
import WorkflowTrackerScreen from '@/pages/WorkflowTrackerScreen';
import { bootstrapMotionBackground } from '@/services/motion-background';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30000,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
    },
  },
});
const { hook: locationHook, searchHook } = memoryLocation();

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Component /> : <Redirect to="/" />;
}

type AppRole = 'WORKER' | 'INSURER_ADMIN';

function RoleProtectedRoute({ component: Component, roles }: { component: React.ComponentType; roles: AppRole[] }) {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated) return <Redirect to="/" />;

  const role: AppRole = user?.role === 'INSURER_ADMIN' ? 'INSURER_ADMIN' : 'WORKER';
  if (!roles.includes(role)) {
    return <Redirect to={role === 'INSURER_ADMIN' ? '/dashboard/insurer' : '/dashboard'} />;
  }

  return <Component />;
}

function WorkerDashboardHomeRoute() {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated) return <Redirect to="/" />;
  const role: AppRole = user?.role === 'INSURER_ADMIN' ? 'INSURER_ADMIN' : 'WORKER';
  if (role === 'INSURER_ADMIN') return <Redirect to="/dashboard/insurer" />;
  return <Dashboard />;
}

function Routes() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/dashboard">{() => <WorkerDashboardHomeRoute />}</Route>
      <Route path="/dashboard/insurer">{() => <RoleProtectedRoute component={InsurerDashboard} roles={['INSURER_ADMIN']} />}</Route>
      <Route path="/dashboard/worker">{() => <RoleProtectedRoute component={WorkerDashboard} roles={['WORKER']} />}</Route>
      <Route path="/dashboard/claims">{() => <RoleProtectedRoute component={Claims} roles={['WORKER']} />}</Route>
      <Route path="/dashboard/policy">{() => <RoleProtectedRoute component={Policy} roles={['WORKER']} />}</Route>
      <Route path="/dashboard/alerts">{() => <RoleProtectedRoute component={Alerts} roles={['WORKER']} />}</Route>
      <Route path="/dashboard/demo">{() => <RoleProtectedRoute component={Demo} roles={['WORKER']} />}</Route>
      <Route path="/dashboard/payouts">{() => <RoleProtectedRoute component={Payouts} roles={['WORKER']} />}</Route>
      <Route path="/dashboard/payment-details">{() => <RoleProtectedRoute component={AddPaymentDetails} roles={['WORKER']} />}</Route>
      <Route path="/dashboard/profile">{() => <ProtectedRoute component={Profile} />}</Route>
      <Route path="/dashboard/kyc">{() => <RoleProtectedRoute component={KycVerification} roles={['WORKER']} />}</Route>
      <Route path="/dashboard/workflow/:claimId">{() => <RoleProtectedRoute component={WorkflowTrackerScreen} roles={['WORKER']} />}</Route>
      <Route>{() => <Redirect to="/" />}</Route>
    </Switch>
  );
}

export default function App() {
  React.useEffect(() => {
    bootstrapMotionBackground().catch(() => {});
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider>
          <Router hook={locationHook} searchHook={searchHook}>
            <Routes />
          </Router>
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
