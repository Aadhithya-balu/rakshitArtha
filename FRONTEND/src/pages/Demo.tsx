import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, ScrollView, Alert, PermissionsAndroid, Platform, Linking } from 'react-native';
import { CheckCircle2, XCircle, ShieldAlert, Wallet, Bell, Layers, ChevronDown, MapPin } from 'lucide-react-native';
import Geolocation from 'react-native-geolocation-service';
import { MobileLayout } from '@/components/layout/MobileLayout';
import { radius, shadow } from '@/theme/tokens';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useRiskSnapshot, useSimulateDemoClaim, useRunDemoWorkflow, useResetDemoWorkflow, useDemoWorkflowState } from '@/hooks/use-api';
import { formatCurrency } from '@/utils/helpers';
import type { PlanSelection } from '@/services/api';

const DISRUPTION_OPTIONS = ['HEAVY_RAIN', 'HIGH_POLLUTION', 'TRAFFIC_BLOCKED', 'THUNDERSTORM', 'FLOODING', 'EXTREME_HEAT', 'OTHER'];
const OTHER_OPTIONS = ['CURFEW', 'STRIKE', 'UNEXPECTED_EVENT', 'MARKET_CLOSURE', 'PLATFORM_DOWNTIME', 'HEALTH_ISSUE'];

function StatusIcon({ passed }: { passed: boolean }) {
  const { colors } = useTheme();
  return passed
    ? <CheckCircle2 size={15} color={colors.riskLow} />
    : <XCircle size={15} color={colors.riskHigh} />;
}

function WorkflowStep({ label, passed, reason, extra, s, colors }: { label: string; passed: boolean; reason: string; extra?: React.ReactNode; s: any; colors: any }) {
  const [open, setOpen] = useState(false);
  return (
    <TouchableOpacity onPress={() => setOpen(p => !p)} style={s.wfStep} activeOpacity={0.7}>
      <View style={s.wfRow}>
        <StatusIcon passed={passed} />
        <Text style={[s.wfLabel, !passed && { color: colors.mutedForeground }]}>{label}</Text>
        <ChevronDown size={12} color={colors.mutedForeground} style={{ marginLeft: 'auto', transform: [{ rotate: open ? '180deg' : '0deg' }] }} />
      </View>
      {open && <Text style={s.wfReason}>{reason}</Text>}
      {open && extra}
    </TouchableOpacity>
  );
}

function SelectRow({ label, options, value, onChange, s, colors }: { label: string; options: string[]; value: string; onChange: (v: string) => void; s: any; colors: any }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={s.selectWrap}>
      <Text style={s.inputLabel}>{label}</Text>
      <TouchableOpacity style={s.selectBtn} onPress={() => setOpen(p => !p)}>
        <Text style={s.selectValue}>{value.replace(/_/g, ' ')}</Text>
        <ChevronDown size={14} color={colors.mutedForeground} />
      </TouchableOpacity>
      {open && (
        <View style={s.dropdown}>
          {options.map(opt => (
            <TouchableOpacity key={opt} style={[s.dropdownItem, value === opt && s.dropdownItemActive]} onPress={() => { onChange(opt); setOpen(false); }}>
              <Text style={[s.dropdownText, value === opt && { color: colors.primary, fontWeight: '700' }]}>{opt.replace(/_/g, ' ')}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

export default function Demo() {
  const { colors } = useTheme();
  const s = useMemo(() => createStyles(colors as any), [colors]);
  const { user } = useAuth();
  const id = { userId: user?.backendUserId, email: user?.email };
  const { data: risk, isLoading: riskLoading, isError: riskError, refetch: refetchRisk } = useRiskSnapshot(id);
  const simulateMutation = useSimulateDemoClaim();
  const runDemoMutation = useRunDemoWorkflow();
  const resetDemoMutation = useResetDemoWorkflow();
  const { data: latestDemoState } = useDemoWorkflowState(id, { enabled: Boolean(id.userId || id.email) });

  const [selectedPlan, setSelectedPlan] = useState<PlanSelection>('standard');
  const [disruptionType, setDisruptionType] = useState('HEAVY_RAIN');
  const [otherReason, setOtherReason] = useState('CURFEW');
  const [inputMode, setInputMode] = useState<'live' | 'manual'>('live');
  const [locationMode, setLocationMode] = useState<'live' | 'manual'>('live');
  const [locationLoading, setLocationLoading] = useState(false);
  const [liveLocation, setLiveLocation] = useState<{ lat: number; lon: number; address: string; accuracy?: number; timestamp?: string } | null>(null);
  const [manualLocation, setManualLocation] = useState('');
  const [manualRainfall, setManualRainfall] = useState('62');
  const [manualAqi, setManualAqi] = useState('210');
  const [manualTraffic, setManualTraffic] = useState('4');
  const [manualTemperature, setManualTemperature] = useState('30');
  const [manualFraudScore, setManualFraudScore] = useState('35');
  const [lostIncome, setLostIncome] = useState('350');
  const [demoRun, setDemoRun] = useState<typeof latestDemoState | null>(null);
  const [activeDemoStep, setActiveDemoStep] = useState(-1);

  const demoSteps = demoRun?.steps || [];
  const demoInProgress = runDemoMutation.isPending || (activeDemoStep >= 0 && activeDemoStep < demoSteps.length);
  const demoImpact = demoRun?.insurerDashboardImpact || {
    totalClaimsIncrement: 0,
    totalPayoutIncrement: 0,
  };

  useEffect(() => {
    if (!latestDemoState || demoRun) return;
    setDemoRun(latestDemoState);
  }, [latestDemoState, demoRun]);

  useEffect(() => {
    if (!demoSteps.length) {
      setActiveDemoStep(-1);
      return;
    }

    setActiveDemoStep(0);
    const interval = setInterval(() => {
      setActiveDemoStep((current) => {
        if (current >= demoSteps.length) {
          clearInterval(interval);
          return current;
        }
        return current + 1;
      });
    }, 850);

    return () => clearInterval(interval);
  }, [demoRun?.runId]);

  const handleRunFullDemoSimulation = () => {
    runDemoMutation.mutate(
      { identifier: id },
      {
        onSuccess: (response) => {
          setDemoRun(response);
        },
        onError: (error) => {
          Alert.alert('Demo Run Failed', error instanceof Error ? error.message : 'Unable to run demo workflow');
        },
      }
    );
  };

  const handleResetDemo = () => {
    resetDemoMutation.mutate(
      { identifier: id },
      {
        onSuccess: () => {
          setDemoRun(null);
          setActiveDemoStep(-1);
          Alert.alert('Demo Reset', 'Demo claims, payouts, and workflow logs were reset.');
        },
        onError: (error) => {
          Alert.alert('Reset Failed', error instanceof Error ? error.message : 'Unable to reset demo data');
        },
      }
    );
  };

  // Fetch live location with proper Geolocation API
  const fetchLiveLocation = async () => {
    try {
      setLocationLoading(true);

      const openSettingsFallback = () => {
        Alert.alert(
          'Location Access Needed',
          'Enable location permissions in settings to use live tracking.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => void Linking.openSettings() }
          ]
        );
      };

      if (Platform.OS === 'android') {
        const fineLocation = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Location Permission',
            message: 'RakshitArtha needs access to your location for claim processing',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          }
        );

        if (fineLocation !== PermissionsAndroid.RESULTS.GRANTED) {
          setLocationMode('manual');
          setLocationLoading(false);
          openSettingsFallback();
          return;
        }

        if (Number(Platform.Version) >= 29) {
          const backgroundLocation = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION,
            {
              title: 'Background Location Permission',
              message: 'RakshitArtha uses background location to keep live claim tracking active during a trip.',
              buttonNeutral: 'Ask Me Later',
              buttonNegative: 'Cancel',
              buttonPositive: 'Allow',
            }
          );

          if (backgroundLocation !== PermissionsAndroid.RESULTS.GRANTED) {
            setLocationMode('manual');
            setLocationLoading(false);
            openSettingsFallback();
            return;
          }
        }
      }

      Geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude, accuracy } = position.coords;
          const address = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;

          setLiveLocation({
            lat: latitude,
            lon: longitude,
            address,
            accuracy: accuracy || 0,
            timestamp: new Date().toISOString()
          });
          setLocationMode('live');
          setLocationLoading(false);
          Alert.alert('Location Fetched', `Accuracy: ${(accuracy || 0).toFixed(0)}m\n${address}`);
        },
        (error) => {
          let errorMsg = 'Failed to fetch location';
          if (error.code === 1) {
            errorMsg = 'Location permission denied. Please enable in settings.';
          } else if (error.code === 2) {
            errorMsg = 'Location unavailable. Try enabling GPS or opening settings.';
          } else if (error.code === 3) {
            errorMsg = 'Location request timed out. Try again.';
          }
          Alert.alert('Location Error', errorMsg);
          if (error.code === 1 || error.code === 2) {
            openSettingsFallback();
          }
          setLocationLoading(false);
        },
        {
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 5000,
          forceRequestLocation: true,
          showLocationDialog: true,
        }
      );
    } catch (error: any) {
      Alert.alert('Error', `Failed to fetch location: ${error.message}`);
      setLocationLoading(false);
    }
  };

  useEffect(() => {
    if (locationMode === 'live') {
      void fetchLiveLocation();
    }
  }, [locationMode]);

  const result = simulateMutation.data;
  const fraudLayerEntries = useMemo(() => Object.entries(result?.workflow?.fraudLayers || {}), [result?.workflow?.fraudLayers]);
  const liveRainfall = Number(risk?.rainfall ?? 0);
  const liveAqi = Number(risk?.aqi ?? 0);
  const liveTraffic = Number(risk?.trafficIndex ?? 0);
  const effectiveRainfall = inputMode === 'manual' ? Number(manualRainfall || 0) : liveRainfall;
  const effectiveAqi = inputMode === 'manual' ? Number(manualAqi || 0) : liveAqi;
  const effectiveTraffic = inputMode === 'manual' ? Number(manualTraffic || 0) : liveTraffic;
  const effectiveTemperature = inputMode === 'manual' ? Number(manualTemperature || 30) : Number(risk?.temperature ?? 30);
  const claimReadinessScore = Math.max(0, Math.min(100, Math.round(
    (effectiveRainfall >= 50 ? 30 : Math.min(30, (effectiveRainfall / 50) * 30)) +
    (effectiveAqi >= 200 ? 25 : Math.min(25, (effectiveAqi / 200) * 25)) +
    (effectiveTraffic >= 4 ? 20 : Math.min(20, (effectiveTraffic / 4) * 20)) +
    (Number(lostIncome || 0) >= 300 ? 25 : Math.min(25, (Number(lostIncome || 0) / 300) * 25))
  )));

  const currentLocation = locationMode === 'live' ? liveLocation?.address : manualLocation;

  const runSimulation = () => {
    if (inputMode === 'live' && (riskLoading || riskError)) return;

    // Build location data with GPS tracking
    const locationData = locationMode === 'live' && liveLocation 
      ? {
          latitude: liveLocation.lat,
          longitude: liveLocation.lon,
          address: liveLocation.address,
          accuracy: liveLocation.accuracy || 0,
          timestamp: liveLocation.timestamp || new Date().toISOString(),
          source: 'gps' as const
        }
      : manualLocation 
        ? {
            address: manualLocation,
            source: 'manual' as const
          }
        : null;

    simulateMutation.mutate({
      identifier: id,
      payload: {
        selectedPlan,
        disruptionType,
        otherReason: disruptionType === 'OTHER' ? otherReason : undefined,
        rainfall: effectiveRainfall,
        aqi: effectiveAqi,
        traffic: effectiveTraffic,
        lostIncome: Number(lostIncome),
        temperature: effectiveTemperature,
        inputMode,
        manualFraudScore: inputMode === 'manual' ? Number(manualFraudScore || 0) : undefined,
        // Include GPS tracking data for fraud detection
        locationData,
      },
    });
  };

  useEffect(() => {
    if (!result?.automation?.motionConsentRequired) return;
    Alert.alert(
      'Motion detection required',
      'Automated payout was blocked. Enable motion detection in Profile to receive instant payout.'
    );
  }, [result?.automation?.motionConsentRequired]);

  return (
    <MobileLayout title="Demo">
      <View style={s.card}>
        <Text style={s.liveTitle}>Demo Mode Controls</Text>
        <Text style={s.hint}>Run a deterministic demo workflow without creating live claims or payouts.</Text>

        <TouchableOpacity
          onPress={handleRunFullDemoSimulation}
          disabled={demoInProgress}
          style={[s.runBtn, demoInProgress && { opacity: 0.6 }]}
        >
          {runDemoMutation.isPending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={s.runBtnText}>Run Full Demo Simulation</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleResetDemo}
          disabled={resetDemoMutation.isPending}
          style={[s.resetBtn, resetDemoMutation.isPending && { opacity: 0.6 }]}
        >
          {resetDemoMutation.isPending ? (
            <ActivityIndicator color={colors.primary} size="small" />
          ) : (
            <Text style={s.resetBtnText}>Reset Demo</Text>
          )}
        </TouchableOpacity>

        {demoRun && (
          <View style={s.readinessCard}>
            <Text style={s.readinessTitle}>Insurer Dashboard Impact</Text>
            <Text style={s.hint}>Total Claims +{demoImpact.totalClaimsIncrement}</Text>
            <Text style={s.hint}>Total Payout +{formatCurrency(demoImpact.totalPayoutIncrement)}</Text>
          </View>
        )}
      </View>

      {demoRun && (
        <View style={s.resultCard}>
          <View style={s.resultHeader}>
            <Text style={s.resultHeaderTitle}>Workflow Tracker</Text>
            <View style={[s.badge, { backgroundColor: `${colors.riskLow}22` }]}>
              <Text style={[s.badgeText, { color: colors.riskLow }]}>DEMO MODE</Text>
            </View>
          </View>

          <View style={s.resultBody}>
            {demoSteps.map((step, index) => {
              const isCompleted = activeDemoStep > index;
              const isCurrent = activeDemoStep === index;
              const passed = isCompleted || (!demoInProgress && activeDemoStep >= demoSteps.length);

              return (
                <View key={step.stepKey} style={s.wfStep}>
                  <View style={s.wfRow}>
                    {isCurrent ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : passed ? (
                      <StatusIcon passed={true} />
                    ) : (
                      <View style={s.pendingStepDot} />
                    )}
                    <Text style={s.wfLabel}>{step.title}</Text>
                  </View>
                  <Text style={s.wfReason}>{step.message}</Text>
                </View>
              );
            })}

            {!demoInProgress && (
              <>
                <View style={s.wfStep}>
                  <View style={s.wfRow}>
                    <CheckCircle2 size={15} color={colors.riskLow} />
                    <Text style={s.wfLabel}>Claim Approved</Text>
                  </View>
                  <Text style={s.wfReason}>Deterministic claim amount: {formatCurrency(demoRun.claimAmount)}</Text>
                </View>

                <View style={s.wfStep}>
                  <View style={s.wfRow}>
                    <Wallet size={14} color={colors.primary} />
                    <Text style={s.wfLabel}>Payout Successful</Text>
                  </View>
                  <Text style={s.wfReason}>Payout credited: {formatCurrency(demoRun.payoutAmount)}</Text>
                </View>

                <View style={s.wfStep}>
                  <View style={s.wfRow}>
                    <Bell size={14} color={colors.primary} />
                    <Text style={s.wfLabel}>Notification</Text>
                  </View>
                  <Text style={s.wfReason}>{demoRun.notification.message}</Text>
                </View>
              </>
            )}
          </View>
        </View>
      )}

      <View style={s.intro}>
        <Text style={s.title}>Hybrid Claim Demo</Text>
        <Text style={s.subtitle}>Weather + disruption + income inputs flow through the 5-layer fraud engine, fair review lanes, and payout logic.</Text>
      </View>

      {/* Location Section */}
      <View style={s.card}>
        <View style={s.liveRow}>
          <Text style={s.liveTitle}>📍 Location</Text>
        </View>
        <View style={s.modeRow}>
          <TouchableOpacity onPress={() => setLocationMode('live')} style={[s.modeChip, locationMode === 'live' && s.modeChipActive]}>
            <Text style={[s.modeChipText, locationMode === 'live' && s.modeChipTextActive]}>Live GPS</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setLocationMode('manual')} style={[s.modeChip, locationMode === 'manual' && s.modeChipActive]}>
            <Text style={[s.modeChipText, locationMode === 'manual' && s.modeChipTextActive]}>Manual Entry</Text>
          </TouchableOpacity>
        </View>

        {locationMode === 'live' ? (
          <View>
            <TouchableOpacity onPress={fetchLiveLocation} disabled={locationLoading} style={[s.locationBtn, locationLoading && { opacity: 0.6 }]}>
              {locationLoading ? (
                <ActivityIndicator color={colors.primary} size="small" />
              ) : (
                <>
                  <MapPin size={14} color={colors.primary} />
                  <Text style={s.locationBtnText}>
                    {liveLocation ? 'Update Location' : 'Fetch Live Location'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
            {liveLocation && (
              <View style={s.locationDisplay}>
                <Text style={s.locationText}>{liveLocation.address}</Text>
              </View>
            )}
          </View>
        ) : (
          <View>
            <Text style={s.inputLabel}>Location (City/Area)</Text>
            <TextInput
              style={s.input}
              value={manualLocation}
              onChangeText={setManualLocation}
              placeholder="e.g., Kanija Bhavan, Bengaluru"
              placeholderTextColor={colors.mutedForeground}
            />
          </View>
        )}
        <Text style={s.hint}>Location is used by backend to fetch weather from nearest stations.</Text>
      </View>

      {/* Weather & Inputs */}
      <View style={s.card}>
        <View style={s.liveRow}>
          <Text style={s.liveTitle}>Weather & Risk Metrics</Text>
          {inputMode === 'live' && (
            <TouchableOpacity onPress={() => refetchRisk()} style={s.refreshBtn}>
              <Text style={s.refreshText}>{riskLoading ? 'Refreshing...' : 'Refresh API'}</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={s.modeRow}>
          <TouchableOpacity onPress={() => setInputMode('live')} style={[s.modeChip, inputMode === 'live' && s.modeChipActive]}>
            <Text style={[s.modeChipText, inputMode === 'live' && s.modeChipTextActive]}>API Fetched</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setInputMode('manual')} style={[s.modeChip, inputMode === 'manual' && s.modeChipActive]}>
            <Text style={[s.modeChipText, inputMode === 'manual' && s.modeChipTextActive]}>Manual Entry</Text>
          </TouchableOpacity>
        </View>

        {inputMode === 'live' && (
          <>
            <View style={s.liveGrid}>
              <View style={s.liveCell}><Text style={s.liveLabel}>Rainfall</Text><Text style={s.liveValue}>{riskLoading ? 'Syncing' : `${liveRainfall} mm`}</Text></View>
              <View style={s.liveCell}><Text style={s.liveLabel}>AQI</Text><Text style={s.liveValue}>{riskLoading ? 'Syncing' : String(liveAqi)}</Text></View>
              <View style={s.liveCell}><Text style={s.liveLabel}>Traffic</Text><Text style={s.liveValue}>{riskLoading ? 'Syncing' : String(liveTraffic)}</Text></View>
            </View>
            <Text style={s.hint}>Live data from backend for your current location</Text>
          </>
        )}

        {inputMode === 'manual' && (
          <>
            <View style={s.manualGrid}>
              <View style={s.manualCell}><Text style={s.inputLabel}>Rainfall (mm)</Text><TextInput style={s.input} value={manualRainfall} onChangeText={setManualRainfall} keyboardType="numeric" placeholderTextColor={colors.mutedForeground} /></View>
              <View style={s.manualCell}><Text style={s.inputLabel}>AQI</Text><TextInput style={s.input} value={manualAqi} onChangeText={setManualAqi} keyboardType="numeric" placeholderTextColor={colors.mutedForeground} /></View>
              <View style={s.manualCell}><Text style={s.inputLabel}>Traffic (0-5)</Text><TextInput style={s.input} value={manualTraffic} onChangeText={setManualTraffic} keyboardType="numeric" placeholderTextColor={colors.mutedForeground} /></View>
              <View style={s.manualCell}><Text style={s.inputLabel}>Temp (°C)</Text><TextInput style={s.input} value={manualTemperature} onChangeText={setManualTemperature} keyboardType="numeric" placeholderTextColor={colors.mutedForeground} /></View>
              <View style={s.manualCell}><Text style={s.inputLabel}>Fraud Score (0-100)</Text><TextInput style={s.input} value={manualFraudScore} onChangeText={setManualFraudScore} keyboardType="numeric" placeholderTextColor={colors.mutedForeground} /></View>
            </View>
            <Text style={s.hint}>Manual mode uses your entered values only, including fraud score (0-100). No live weather API data is used in this mode.</Text>
          </>
        )}

        <View style={s.readinessCard}>
          <Text style={s.readinessTitle}>Claim Readiness Score</Text>
          <View style={s.readinessBar}><View style={[s.readinessFill, { width: `${claimReadinessScore}%` as any }]} /></View>
          <Text style={s.hint}>Current score: {claimReadinessScore}/100 based on disruption intensity and income loss.</Text>
        </View>

        {/* Plan */}
        <Text style={s.inputLabel}>Plan</Text>
        <View style={s.chipRow}>
          {(['standard', 'premium'] as PlanSelection[]).map(p => (
            <TouchableOpacity key={p} onPress={() => setSelectedPlan(p)} style={[s.chip, selectedPlan === p && s.chipActive]}>
              <Text style={[s.chipText, selectedPlan === p && s.chipTextActive]}>{p === 'standard' ? '⚡ Standard' : '🛡 Premium'}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Disruption type */}
        <SelectRow label="Disruption Type" options={DISRUPTION_OPTIONS} value={disruptionType} onChange={setDisruptionType} s={s} colors={colors} />

        {/* Other reason */}
        {disruptionType === 'OTHER' && (
          <>
            <SelectRow label="Other Reason" options={OTHER_OPTIONS} value={otherReason} onChange={setOtherReason} s={s} colors={colors} />
            <Text style={s.hint}>Reasons like health issue are outside policy rules and will be rejected.</Text>
          </>
        )}

        <Text style={s.inputLabel}>Lost Income (₹)</Text>
        <TextInput style={s.input} value={lostIncome} onChangeText={setLostIncome} keyboardType="numeric" placeholderTextColor={colors.mutedForeground} />

        <TouchableOpacity onPress={runSimulation} disabled={simulateMutation.isPending || (inputMode === 'live' && (riskLoading || riskError))} style={[s.runBtn, (simulateMutation.isPending || (inputMode === 'live' && (riskLoading || riskError))) && { opacity: 0.6 }]}> 
          {simulateMutation.isPending
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={s.runBtnText}>Run Workflow</Text>}
        </TouchableOpacity>
      </View>

      {/* Result */}
      {result && (
        <View style={[s.resultCard, { borderColor: result.approved ? `${colors.riskLow}44` : `${colors.riskHigh}44` }]}>
          {/* Header */}
          <View style={s.resultHeader}>
            <Text style={s.resultHeaderTitle}>Workflow Layers</Text>
            <View style={[s.badge, { backgroundColor: result.approved ? `${colors.riskLow}22` : `${colors.riskHigh}22` }]}>
              <Text style={[s.badgeText, { color: result.approved ? colors.riskLow : colors.riskHigh }]}>
                {result.approved ? 'APPROVED' : 'REJECTED'}
              </Text>
            </View>
          </View>

          <View style={s.resultBody}>
            <WorkflowStep label="Policy payment verified" passed={result.workflow.policyPaymentVerified.passed} reason={result.workflow.policyPaymentVerified.reason} s={s} colors={colors} />
            <WorkflowStep label="Disruption detected" passed={result.workflow.disruptionDetected.passed} reason={result.workflow.disruptionDetected.reason} s={s} colors={colors} />
            <WorkflowStep label="Income loss validated" passed={result.workflow.incomeLossValidated.passed} reason={`${result.workflow.incomeLossValidated.reason} Loss: ${result.incomeLossPercent}%`} s={s} colors={colors} />

            {/* Fraud layers */}
            <View style={s.fraudSection}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <Layers size={14} color={colors.primary} />
                <Text style={s.fraudSectionTitle}>Fraud detection (5 layers)</Text>
              </View>
              {fraudLayerEntries.map(([key, layer]) => (
                <View key={key} style={s.fraudLayerRow}>
                  <StatusIcon passed={!layer.triggered} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.fraudLayerKey}>{key}</Text>
                    <Text style={s.fraudLayerReason}>{layer.reason}</Text>
                  </View>
                </View>
              ))}
            </View>

            {result.workflow.fraudDecision && (
              <WorkflowStep
                label="Fraud decision"
                passed={result.workflow.fraudDecision.passed}
                reason={`${result.workflow.fraudDecision.reason} Score: ${result.workflow.fraudDecision.score}${result.workflow.fraudDecision.reviewTier ? ` · Tier: ${result.workflow.fraudDecision.reviewTier}` : ''}${result.workflow.fraudDecision.nextAction ? ` · Action: ${result.workflow.fraudDecision.nextAction.replace(/_/g, ' ')}` : ''}`}
                s={s}
                colors={colors}
              />
            )}

            <WorkflowStep
              label="Claim amount calculated"
              passed={result.workflow.payoutCalculated.passed}
              reason={result.workflow.payoutCalculated.reason}
              s={s}
              colors={colors}
              extra={<Text style={[s.wfReason, { color: colors.foreground, fontWeight: '700', marginTop: 4 }]}>{formatCurrency(result.claimAmount)}</Text>}
            />

            <View style={s.wfStep}>
              <View style={s.wfRow}>
                <StatusIcon passed={result.workflow.payoutSent.passed} />
                <Text style={s.wfLabel}>Payout transfer</Text>
                <Wallet size={13} color={colors.primary} style={{ marginLeft: 'auto' }} />
              </View>
              <Text style={s.wfReason}>{result.workflow.payoutSent.reason}</Text>
            </View>

            <View style={s.wfStep}>
              <View style={s.wfRow}>
                <StatusIcon passed={result.workflow.notificationSent.passed} />
                <Text style={s.wfLabel}>Push notification</Text>
                <Bell size={13} color={colors.primary} style={{ marginLeft: 'auto' }} />
              </View>
              <Text style={s.wfReason}>{result.workflow.notificationSent.reason}</Text>
            </View>

            {!result.approved && (
              <View style={s.rejectionBox}>
                <ShieldAlert size={14} color={colors.riskHigh} />
                <Text style={s.rejectionText}>{result.rejectionReason || 'Claim rejected by workflow checks'}</Text>
              </View>
            )}
          </View>
        </View>
      )}
    </MobileLayout>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  intro: { padding: 16, paddingBottom: 8, alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: colors.foreground, textAlign: 'center' },
  subtitle: { fontSize: 12, color: colors.mutedForeground, textAlign: 'center', marginTop: 4, lineHeight: 18 },
  card: { marginHorizontal: 16, marginBottom: 12, backgroundColor: colors.card, borderRadius: radius['2xl'], borderWidth: 1, borderColor: colors.cardBorder, padding: 14, ...shadow.sm, gap: 10 },
  chipRow: { flexDirection: 'row', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.xl, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.secondary },
  chipActive: { borderColor: colors.primary, backgroundColor: `${colors.primary}15` },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.mutedForeground },
  chipTextActive: { color: colors.primary },
  inputLabel: { fontSize: 11, fontWeight: '700', color: colors.mutedForeground, marginBottom: 4 },
  input: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.secondary, color: colors.foreground, fontSize: 14 },
  hint: { fontSize: 10, color: colors.mutedForeground, lineHeight: 14 },
  liveRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  liveTitle: { fontSize: 14, fontWeight: '800', color: colors.foreground },
  refreshBtn: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.secondary },
  refreshText: { fontSize: 11, fontWeight: '700', color: colors.primary },
  liveGrid: { flexDirection: 'row', gap: 8 },
  liveCell: { flex: 1, backgroundColor: colors.secondary, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: 10 },
  liveLabel: { fontSize: 10, color: colors.mutedForeground },
  liveValue: { fontSize: 14, fontWeight: '800', color: colors.foreground, marginTop: 4 },
  modeRow: { flexDirection: 'row', gap: 8 },
  modeChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.secondary },
  modeChipActive: { borderColor: colors.primary, backgroundColor: `${colors.primary}15` },
  modeChipText: { fontSize: 12, fontWeight: '600', color: colors.mutedForeground },
  modeChipTextActive: { color: colors.primary },
  manualGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  manualCell: { width: '48%' },
  readinessCard: { backgroundColor: colors.secondary, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: 10 },
  readinessTitle: { fontSize: 12, fontWeight: '700', color: colors.foreground, marginBottom: 6 },
  readinessBar: { height: 8, borderRadius: 999, backgroundColor: colors.border, overflow: 'hidden', marginBottom: 6 },
  readinessFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 999 },
  locationBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.xl, borderWidth: 1.5, borderColor: colors.primary, backgroundColor: `${colors.primary}15` },
  locationBtnText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  locationDisplay: { backgroundColor: colors.secondary, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: 10, marginTop: 8 },
  locationText: { fontSize: 12, color: colors.foreground, fontWeight: '500' },
  selectWrap: { position: 'relative', zIndex: 10 },
  selectBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.secondary },
  selectValue: { fontSize: 13, color: colors.foreground, fontWeight: '500' },
  dropdown: { position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: colors.card, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.cardBorder, ...shadow.md, zIndex: 100, marginTop: 4 },
  dropdownItem: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  dropdownItemActive: { backgroundColor: `${colors.primary}10` },
  dropdownText: { fontSize: 13, color: colors.foreground },
  runBtn: { backgroundColor: colors.primary, paddingVertical: 13, borderRadius: radius['2xl'], alignItems: 'center', ...shadow.primary },
  runBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  resetBtn: { borderWidth: 1.5, borderColor: colors.primary, borderRadius: radius['2xl'], paddingVertical: 12, alignItems: 'center', backgroundColor: `${colors.primary}10` },
  resetBtnText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  resultCard: { marginHorizontal: 16, marginBottom: 24, backgroundColor: colors.card, borderRadius: radius['2xl'], borderWidth: 1, overflow: 'hidden', ...shadow.md },
  resultHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  resultHeaderTitle: { fontSize: 13, fontWeight: '700', color: colors.foreground },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  resultBody: { padding: 14, gap: 2 },
  wfStep: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.cardBorder },
  wfRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wfLabel: { fontSize: 13, fontWeight: '600', color: colors.foreground, flex: 1 },
  wfReason: { fontSize: 11, color: colors.mutedForeground, marginTop: 3, paddingLeft: 23, lineHeight: 16 },
  pendingStepDot: { width: 15, height: 15, borderRadius: 999, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.secondary },
  fraudSection: { backgroundColor: colors.secondary, borderRadius: radius.xl, padding: 12, marginVertical: 4 },
  fraudSectionTitle: { fontSize: 13, fontWeight: '700', color: colors.foreground },
  fraudLayerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 5, borderTopWidth: 1, borderTopColor: colors.cardBorder },
  fraudLayerKey: { fontSize: 11, fontWeight: '700', color: colors.foreground },
  fraudLayerReason: { fontSize: 10, color: colors.mutedForeground, marginTop: 1 },
  rejectionBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: `${colors.riskHigh}15`, borderRadius: radius.xl, borderWidth: 1, borderColor: `${colors.riskHigh}33`, padding: 10, marginTop: 4 },
  rejectionText: { fontSize: 12, fontWeight: '600', color: colors.riskHigh, flex: 1 },
});
