import React, { useState, useEffect } from 'react';
import {
  View,
  ScrollView,
  Text,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity
} from 'react-native';
import { useLocation } from 'wouter';
import { ChevronLeft, AlertCircle, ShieldAlert, ListChecks } from 'lucide-react-native';
import { api } from '@/services/api';
import WorkflowTimeline from '@/components/WorkflowTimeline';
import FraudDetectionPanel from '@/components/FraudDetectionPanel';
import RejectionReasonSection from '@/components/RejectionReasonSection';

const WorkflowTrackerScreen = (props) => {
  const [location, navigate] = useLocation();
  // Extract claimId from URL path like /dashboard/workflow/CLAIM123
  const claimId = props?.claimId || location.split('/').pop();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [claimData, setClaimData] = useState(null);
  const [workflowData, setWorkflowData] = useState(null);
  const [fraudCheckData, setFraudCheckData] = useState(null);
  const [error, setError] = useState(null);
  const [expandedSections, setExpandedSections] = useState({
    workflow: true,
    fraud: false
  });

  useEffect(() => {
    if (claimId) {
      fetchClaimData();
    }
  }, [claimId]);

  const fetchClaimData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch complete claim status with workflow and fraud data
      const completeData = await api.getClaimCompleteStatus(String(claimId));

      setClaimData(completeData.claim);
      setWorkflowData(completeData.workflow);
      setFraudCheckData(completeData.fraudCheck);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch workflow data');
      console.error('Error fetching workflow:', err);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchClaimData();
    } catch (err) {
      console.error('Error refreshing:', err);
    } finally {
      setRefreshing(false);
    }
  };

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading Workflow Details...</Text>
      </View>
    );
  }

  if (!claimId || !claimData) {
    return (
      <View style={styles.centerContainer}>
        <ListChecks size={64} color="#007AFF" />
        <Text style={styles.errorText}>No claims till now</Text>
        <Text style={styles.loadingText}>Run a live claim first to see workflow stages here.</Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => navigate('/dashboard/claims')}
        >
          <Text style={styles.retryButtonText}>Go to Claims</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (error) {
    if (String(error).toLowerCase().includes('not found')) {
      return (
        <View style={styles.centerContainer}>
          <ListChecks size={64} color="#007AFF" />
          <Text style={styles.errorText}>No claims till now</Text>
          <Text style={styles.loadingText}>Workflow tracking appears after the first live claim is submitted.</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => navigate('/dashboard/claims')}
          >
            <Text style={styles.retryButtonText}>Go to Claims</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.centerContainer}>
        <AlertCircle size={64} color="#FF3B30" />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={fetchClaimData}
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigate('/dashboard/claims')}
        >
          <ChevronLeft size={24} color="#007AFF" />
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.pageTitle}>Workflow & Claim Process Tracker</Text>
          <Text style={styles.claimTitle}>Claim #{claimData?.id?.slice(-8).toUpperCase()}</Text>
          <Text style={styles.claimType}>{claimData?.type}</Text>
        </View>
      </View>

      {/* Claim Status Card */}
      <View style={styles.statusCard}>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Claim Status</Text>
          <View
            style={[
              styles.statusBadge,
              {
                backgroundColor: getStatusColor(claimData?.status)
              }
            ]}
          >
            <Text style={styles.statusValue}>{claimData?.status}</Text>
          </View>
        </View>

        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Amount</Text>
          <Text style={styles.statusValue}>₹{claimData?.amount?.toLocaleString()}</Text>
        </View>

        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Created</Text>
          <Text style={styles.statusValue}>
            {new Date(claimData?.createdAt).toLocaleDateString()}
          </Text>
        </View>
      </View>

      {/* Workflow Status Section */}
      {workflowData && (
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => toggleSection('workflow')}
          >
            <View style={styles.sectionTitleRow}>
              <ListChecks size={24} color="#007AFF" />
              <Text style={styles.sectionTitle}>Workflow Progress</Text>
            </View>

            {/* Overall Status Badge */}
            <View
              style={[
                styles.workflowStatusBadge,
                {
                  backgroundColor: getWorkflowStatusColor(
                    workflowData.overallStatus
                  )
                }
              ]}
            >
              <Text style={styles.workflowStatusText}>
                {workflowData.overallStatus}
              </Text>
            </View>
          </TouchableOpacity>

          {expandedSections.workflow && (
            <View style={styles.sectionContent}>
              {/* Progress Summary */}
              <View style={styles.progressSummary}>
                <View style={styles.progressItem}>
                  <Text style={styles.progressLabel}>Steps Completed</Text>
                  <Text style={styles.progressValue}>
                    {workflowData.steps.filter(s => s.status === 'SUCCESS').length}/
                    {workflowData.steps.length}
                  </Text>
                </View>
                <View style={styles.progressDivider} />
                <View style={styles.progressItem}>
                  <Text style={styles.progressLabel}>Current Step</Text>
                  <Text style={styles.progressValue}>
                    {formatStepName(workflowData.currentStep)}
                  </Text>
                </View>
              </View>

              {/* Timeline */}
              <WorkflowTimeline steps={workflowData.steps} />

              {/* Rejection Reason (if rejected) */}
              {workflowData.rejectionDetails && (
                <RejectionReasonSection
                  rejectionDetails={workflowData.rejectionDetails}
                />
              )}
            </View>
          )}
        </View>
      )}

      {/* Fraud Detection Section */}
      {fraudCheckData && (
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => toggleSection('fraud')}
          >
            <View style={styles.sectionTitleRow}>
              <ShieldAlert
                size={24}
                color={getRiskTierColor(fraudCheckData.riskTier)}
              />
              <Text style={styles.sectionTitle}>Fraud Detection</Text>
            </View>

            {/* Risk Tier Badge */}
            <View
              style={[
                styles.riskBadge,
                {
                  backgroundColor: getRiskTierColor(fraudCheckData.riskTier)
                }
              ]}
            >
              <Text style={styles.riskBadgeText}>{fraudCheckData.riskTier}</Text>
            </View>
          </TouchableOpacity>

          {expandedSections.fraud && (
            <View style={styles.sectionContent}>
              <FraudDetectionPanel fraudCheckData={fraudCheckData} />
            </View>
          )}
        </View>
      )}

      {/* Footer Spacing */}
      <View style={styles.footerSpacing} />
    </ScrollView>
  );
};

// Helper functions
const getStatusColor = (status) => {
  const colorMap = {
    SUBMITTED: '#FFC107',
    UNDER_REVIEW: '#2196F3',
    APPROVED: '#4CAF50',
    REJECTED: '#FF3B30',
    PAID: '#8BC34A'
  };
  return colorMap[status] || '#9E9E9E';
};

const getWorkflowStatusColor = (status) => {
  const colorMap = {
    IN_PROGRESS: '#2196F3',
    COMPLETED: '#4CAF50',
    FAILED: '#FF3B30',
    REJECTED: '#FF3B30'
  };
  return colorMap[status] || '#9E9E9E';
};

const getRiskTierColor = (tier) => {
  const colorMap = {
    GREEN: '#4CAF50',
    YELLOW: '#FFC107',
    RED: '#FF3B30'
  };
  return colorMap[tier] || '#9E9E9E';
};

const formatStepName = (step) => {
  return step
    .replace(/_/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5'
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5'
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
    fontFamily: 'System'
  },
  errorText: {
    marginTop: 12,
    fontSize: 16,
    color: '#FF3B30',
    textAlign: 'center',
    paddingHorizontal: 20,
    fontFamily: 'System'
  },
  retryButton: {
    marginTop: 20,
    paddingHorizontal: 30,
    paddingVertical: 12,
    backgroundColor: '#007AFF',
    borderRadius: 8
  },
  retryButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'System'
  },
  header: {
    backgroundColor: '#FFF',
    paddingHorizontal: 16,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  pageTitle: {
    fontSize: 11,
    color: '#666',
    marginBottom: 3,
    fontFamily: 'System'
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: -8
  },
  backButtonText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
    fontFamily: 'System'
  },
  claimTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
    fontFamily: 'System'
  },
  claimType: {
    fontSize: 14,
    color: '#666',
    fontFamily: 'System'
  },
  statusCard: {
    backgroundColor: '#FFF',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0'
  },
  statusLabel: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
    fontFamily: 'System'
  },
  statusValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '600',
    fontFamily: 'System'
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center'
  },
  section: {
    backgroundColor: '#FFF',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0'
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginLeft: 12,
    fontFamily: 'System'
  },
  sectionContent: {
    paddingHorizontal: 16,
    paddingVertical: 16
  },
  workflowStatusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6
  },
  workflowStatusText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'System'
  },
  riskBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6
  },
  riskBadgeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'System'
  },
  progressSummary: {
    flexDirection: 'row',
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    marginBottom: 16,
    overflow: 'hidden'
  },
  progressItem: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center'
  },
  progressDivider: {
    width: 1,
    backgroundColor: '#E0E0E0'
  },
  progressLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
    fontFamily: 'System'
  },
  progressValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#007AFF',
    fontFamily: 'System'
  },
  footerSpacing: {
    height: 30
  }
});

export default WorkflowTrackerScreen;
