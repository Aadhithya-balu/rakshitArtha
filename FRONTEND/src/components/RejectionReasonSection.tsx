import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity
} from 'react-native';
import { AlertCircle, ChevronDown, ChevronUp, Phone, AlertTriangle, Info } from 'lucide-react-native';

const RejectionReasonSection = ({ rejectionDetails }) => {
  const [expanded, setExpanded] = useState(true);

  if (!rejectionDetails) {
    return null;
  }

  const { failedAtStep, reason, evidence } = rejectionDetails;

  const formatStepName = (step) => {
    return step
      .replace(/_/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  const getFailureIcon = () => {
    return AlertCircle;
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.rejectionHeader}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        <View style={styles.headerContent}>
          {React.createElement(getFailureIcon(), {
            size: 24,
            color: '#FF3B30',
            style: styles.headerIcon
          })}
          <View style={styles.headerText}>
            <Text style={styles.rejectionTitle}>Claim Rejected</Text>
            <Text style={styles.rejectionSubtitle}>
              Failed at: {formatStepName(failedAtStep)}
            </Text>
          </View>
        </View>
        {expanded ? (
          <ChevronUp size={24} color="#FF3B30" />
        ) : (
          <ChevronDown size={24} color="#FF3B30" />
        )}
      </TouchableOpacity>

      {expanded && (
        <View style={styles.rejectionContent}>
          {/* Rejection Step Indicator */}
          <View style={styles.failureStepCard}>
            <View style={styles.failureStepHeader}>
              <AlertCircle size={20} color="#FF3B30" />
              <Text style={styles.failureStepTitle}>
                Rejection Point
              </Text>
            </View>
            <View style={styles.failureStepBadge}>
              <Text style={styles.failureStepName}>
                {formatStepName(failedAtStep)}
              </Text>
            </View>
          </View>

          {/* Reason */}
          {reason && (
            <View style={styles.reasonSection}>
              <View style={styles.reasonHeader}>
                <Info size={18} color="#FF3B30" style={styles.reasonIcon} />
                <Text style={styles.reasonLabel}>Reason for Rejection</Text>
              </View>
              <View style={styles.reasonBox}>
                <Text style={styles.reasonText}>{reason}</Text>
              </View>
            </View>
          )}

          {/* Evidence Details */}
          {evidence && Object.keys(evidence).length > 0 && (
            <View style={styles.evidenceSection}>
              <View style={styles.evidenceHeader}>
                <AlertTriangle size={18} color="#666" style={styles.evidenceIcon} />
                <Text style={styles.evidenceLabel}>Evidence</Text>
              </View>
              <View style={styles.evidenceContent}>
                {Object.entries(evidence).map(([key, value]) => (
                  <View key={key} style={styles.evidenceItem}>
                    <Text style={styles.evidenceKey}>
                      {formatEvidenceKey(key)}
                    </Text>
                    <Text style={styles.evidenceValue}>
                      {formatEvidenceValue(value)}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Next Steps */}
          <View style={styles.nextStepsSection}>
            <View style={styles.nextStepsHeader}>
              <Info size={18} color="#666" style={styles.nextStepsIcon} />
              <Text style={styles.nextStepsLabel}>What You Can Do</Text>
            </View>
            <View style={styles.nextStepsList}>
              <View style={styles.nextStepItem}>
                <View style={styles.bulletPoint} />
                <Text style={styles.nextStepText}>
                  Review the rejection reason carefully
                </Text>
              </View>
              <View style={styles.nextStepItem}>
                <View style={styles.bulletPoint} />
                <Text style={styles.nextStepText}>
                  Verify the information provided in your claim
                </Text>
              </View>
              <View style={styles.nextStepItem}>
                <View style={styles.bulletPoint} />
                <Text style={styles.nextStepText}>
                  Contact support if you believe this is an error
                </Text>
              </View>
              <View style={styles.nextStepItem}>
                <View style={styles.bulletPoint} />
                <Text style={styles.nextStepText}>
                  Submit a new claim with corrected information if applicable
                </Text>
              </View>
            </View>
          </View>

          {/* Support Contact */}
          <TouchableOpacity style={styles.supportButton} activeOpacity={0.7}>
            <Phone size={18} color="#007AFF" style={styles.supportIcon} />
            <Text style={styles.supportButtonText}>Contact Support</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

// Helper functions
const formatEvidenceKey = (key) => {
  return key
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const formatEvidenceValue = (value) => {
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
};

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#FF3B30'
  },
  rejectionHeader: {
    backgroundColor: '#FF3B3015',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1
  },
  headerIcon: {
    marginRight: 12
  },
  headerText: {
    flex: 1
  },
  rejectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FF3B30',
    marginBottom: 2,
    fontFamily: 'System'
  },
  rejectionSubtitle: {
    fontSize: 13,
    color: '#D32F2F',
    fontFamily: 'System'
  },
  rejectionContent: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#FFF'
  },
  failureStepCard: {
    backgroundColor: '#FFF5F5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#FF3B30'
  },
  failureStepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8
  },
  failureStepTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginLeft: 8,
    fontFamily: 'System'
  },
  failureStepBadge: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    alignSelf: 'flex-start'
  },
  failureStepName: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'System'
  },
  reasonSection: {
    marginBottom: 16
  },
  reasonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8
  },
  reasonIcon: {
    marginRight: 8
  },
  reasonLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    fontFamily: 'System'
  },
  reasonBox: {
    backgroundColor: '#FFF5F5',
    padding: 12,
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#FF3B30'
  },
  reasonText: {
    fontSize: 13,
    color: '#333',
    lineHeight: 18,
    fontFamily: 'System'
  },
  evidenceSection: {
    marginBottom: 16
  },
  evidenceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8
  },
  evidenceIcon: {
    marginRight: 8
  },
  evidenceLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    fontFamily: 'System'
  },
  evidenceContent: {
    backgroundColor: '#F5F5F5',
    padding: 12,
    borderRadius: 6
  },
  evidenceItem: {
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0'
  },
  evidenceKey: {
    fontSize: 12,
    fontWeight: '600',
    color: '#555',
    marginBottom: 4,
    fontFamily: 'System'
  },
  evidenceValue: {
    fontSize: 12,
    color: '#333',
    fontFamily: 'System'
  },
  nextStepsSection: {
    marginBottom: 16
  },
  nextStepsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12
  },
  nextStepsIcon: {
    marginRight: 8
  },
  nextStepsLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    fontFamily: 'System'
  },
  nextStepsList: {
    backgroundColor: '#F9F9F9',
    padding: 12,
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#FFC107'
  },
  nextStepItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10
  },
  bulletPoint: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#666',
    marginTop: 6,
    marginRight: 12,
    flexShrink: 0
  },
  nextStepText: {
    fontSize: 12,
    color: '#333',
    flex: 1,
    lineHeight: 16,
    fontFamily: 'System'
  },
  supportButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center'
  },
  supportIcon: {
    marginRight: 8
  },
  supportButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'System'
  }
});

export default RejectionReasonSection;
