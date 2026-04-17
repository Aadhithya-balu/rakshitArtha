import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert
} from 'react-native';
import { FileCheck, AlertCircle, Clock, Calculator, ShieldAlert, CheckCircle, XCircle, ChevronDown, ChevronUp } from 'lucide-react-native';

const WorkflowTimeline = ({ steps }) => {
  const [expandedStep, setExpandedStep] = useState(null);

  const getStepIcon = (stepName) => {
    const iconMap = {
      POLICY_VALIDATION: FileCheck,
      DISRUPTION_DETECTION: AlertCircle,
      DURATION_CALCULATION: Clock,
      LOSS_CALCULATION: Calculator,
      FRAUD_DETECTION: ShieldAlert,
      CLAIM_CREATION: FileCheck,
      PAYOUT_PROCESSING: CheckCircle
    };
    return iconMap[stepName] || AlertCircle;
  };

  const getStatusColor = (status) => {
    const colorMap = {
      SUCCESS: '#4CAF50',
      FAILED: '#FF3B30',
      PENDING: '#FFC107'
    };
    return colorMap[status] || '#9E9E9E';
  };

  const getStatusIcon = (status) => {
    const iconMap = {
      SUCCESS: CheckCircle,
      FAILED: XCircle,
      PENDING: Clock
    };
    return iconMap[status] || AlertCircle;
  };

  const formatStepName = (step) => {
    return step
      .replace(/_/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  };

  const toggleStepDetails = (stepIndex) => {
    setExpandedStep(expandedStep === stepIndex ? null : stepIndex);
  };

  return (
    <View style={styles.timelineContainer}>
      <View style={styles.timelineTrack}>
        {steps.map((step, index) => {
          const StepIcon = getStepIcon(step.stepName);
          const StatusIcon = getStatusIcon(step.status);
          return (
            <View key={index}>
            {/* Timeline Node */}
            <TouchableOpacity
              style={styles.timelineNodeContainer}
              onPress={() => toggleStepDetails(index)}
            >
              {/* Connector Line */}
              {index < steps.length - 1 && (
                <View
                  style={[
                    styles.connectorLine,
                    {
                      backgroundColor:
                        step.status === 'SUCCESS' ? '#4CAF50' : 
                        step.status === 'FAILED' ? '#FF3B30' : 
                        '#E0E0E0'
                    }
                  ]}
                />
              )}

              {/* Step Content */}
              <View style={styles.stepContent}>
                {/* Step Indicator */}
                <View
                  style={[
                    styles.stepIndicator,
                    {
                      backgroundColor: getStatusColor(step.status),
                      borderColor: getStatusColor(step.status)
                    }
                  ]}
                >
                  <StatusIcon size={20} color="#FFF" />
                </View>

                {/* Step Info */}
                <View style={styles.stepInfo}>
                  <View style={styles.stepHeaderRow}>
                    <View style={styles.stepNameContainer}>
                      <StepIcon
                        size={18}
                        color="#666"
                        style={styles.stepIcon}
                      />
                      <Text style={styles.stepName}>
                        {formatStepName(step.stepName)}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.statusBadge,
                        {
                          backgroundColor: getStatusColor(step.status)
                        }
                      ]}
                    >
                      <Text style={styles.statusBadgeText}>{step.status}</Text>
                    </View>
                  </View>

                  {/* Time Info */}
                  <View style={styles.timeInfo}>
                    <Text style={styles.time}>
                      {formatDate(step.timestamp)} at {formatTime(step.timestamp)}
                    </Text>
                    {step.duration > 0 && (
                      <Text style={styles.duration}>
                        Duration: {(step.duration / 1000).toFixed(2)}s
                      </Text>
                    )}
                  </View>

                  {/* Message */}
                  {step.message && (
                    <Text style={styles.message} numberOfLines={2}>
                      {step.message}
                    </Text>
                  )}
                </View>

                {/* Expand Arrow */}
                {expandedStep === index ? (
                  <ChevronUp size={20} color="#666" />
                ) : (
                  <ChevronDown size={20} color="#666" />
                )}
              </View>

              {/* Expanded Details */}
              {expandedStep === index && (
                <View style={styles.expandedDetails}>
                  {step.message && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Message</Text>
                      <Text style={styles.detailValue}>{step.message}</Text>
                    </View>
                  )}

                  {step.reason && (
                    <View style={styles.detailRow}>
                      <AlertCircle
                        size={16}
                        color="#FF3B30"
                        style={styles.detailIcon}
                      />
                      <View style={styles.detailContent}>
                        <Text style={styles.detailLabel}>Reason</Text>
                        <Text style={[styles.detailValue, { color: '#FF3B30' }]}>
                          {step.reason}
                        </Text>
                      </View>
                    </View>
                  )}

                  {step.data && Object.keys(step.data).length > 0 && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Details</Text>
                      <View style={styles.dataContainer}>
                        {Object.entries(step.data).map(([key, value]) => (
                          <View key={key} style={styles.dataItem}>
                            <Text style={styles.dataKey}>
                              {formatDataKey(key)}:
                            </Text>
                            <Text style={styles.dataValue}>
                              {formatDataValue(value)}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}

                  {step.duration > 0 && (
                    <View style={styles.detailRow}>
                      <Clock
                        size={16}
                        color="#666"
                        style={styles.detailIcon}
                      />
                      <View style={styles.detailContent}>
                        <Text style={styles.detailLabel}>Processing Time</Text>
                        <Text style={styles.detailValue}>
                          {(step.duration / 1000).toFixed(3)}s
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              )}
            </TouchableOpacity>
            </View>
          );
        })}
      </View>
    </View>
  );
};

// Helper functions
const formatDataKey = (key) => {
  return key
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const formatDataValue = (value) => {
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }
  if (typeof value === 'number') {
    return value.toLocaleString();
  }
  return String(value);
};

const styles = StyleSheet.create({
  timelineContainer: {
    marginVertical: 8
  },
  timelineTrack: {
    position: 'relative'
  },
  timelineNodeContainer: {
    position: 'relative',
    marginBottom: 0
  },
  connectorLine: {
    position: 'absolute',
    left: 19,
    top: 48,
    width: 2,
    height: 60,
    zIndex: 0
  },
  stepContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    paddingRight: 0
  },
  stepIndicator: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    zIndex: 1
  },
  stepInfo: {
    flex: 1,
    paddingRight: 12
  },
  stepHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4
  },
  stepNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1
  },
  stepIcon: {
    marginRight: 8
  },
  stepName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    flex: 1,
    fontFamily: 'System'
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginLeft: 8
  },
  statusBadgeText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'System'
  },
  timeInfo: {
    marginBottom: 4
  },
  time: {
    fontSize: 12,
    color: '#999',
    fontFamily: 'System'
  },
  duration: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
    fontFamily: 'System'
  },
  message: {
    fontSize: 13,
    color: '#555',
    marginTop: 4,
    lineHeight: 18,
    fontFamily: 'System'
  },
  expandedDetails: {
    marginTop: 12,
    marginLeft: 40,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0'
  },
  detailRow: {
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-start'
  },
  detailIcon: {
    marginRight: 8,
    marginTop: 2
  },
  detailContent: {
    flex: 1
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 4,
    fontFamily: 'System'
  },
  detailValue: {
    fontSize: 13,
    color: '#333',
    lineHeight: 18,
    fontFamily: 'System'
  },
  dataContainer: {
    backgroundColor: '#F5F5F5',
    borderRadius: 6,
    padding: 8,
    marginTop: 4
  },
  dataItem: {
    marginBottom: 4
  },
  dataKey: {
    fontSize: 12,
    fontWeight: '500',
    color: '#666',
    fontFamily: 'System'
  },
  dataValue: {
    fontSize: 12,
    color: '#333',
    marginTop: 2,
    fontFamily: 'System'
  }
});

export default WorkflowTimeline;
