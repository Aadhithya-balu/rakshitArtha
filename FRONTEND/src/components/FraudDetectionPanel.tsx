import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView
} from 'react-native';
import { FileCheck, MapPin, Copy, BarChart3, Clock, Zap, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react-native';

const FraudDetectionPanel = ({ fraudCheckData }) => {
  const [expandedLayer, setExpandedLayer] = useState(null);

  const toggleLayer = (layerName) => {
    setExpandedLayer(expandedLayer === layerName ? null : layerName);
  };

  const getLayerIcon = (layerName) => {
    const iconMap = {
      policyActiveCheck: FileCheck,
      locationValidation: MapPin,
      duplicateClaimCheck: Copy,
      activityValidation: BarChart3,
      timeWindowValidation: Clock,
      anomalyDetection: Zap
    };
    return iconMap[layerName] || AlertTriangle;
  };

  const getLayerColor = (status) => {
    return status === 'PASS' ? '#4CAF50' : '#FF3B30';
  };

  const renderLayerDetails = (layerName, layer) => {
    if (!layer || !layer.details) return null;

    const details = layer.details;
    const detailsArray = Object.entries(details).map(([key, value]) => ({
      key,
      value
    }));

    return (
      <View style={styles.layerDetails}>
        <View style={styles.scoreBar}>
          <View style={styles.scoreLabel}>
            <Text style={styles.scoreLabelText}>Risk Score</Text>
            <Text style={styles.scoreValue}>{layer.score}/100</Text>
          </View>
          <View style={styles.scoreBarContainer}>
            <View
              style={[
                styles.scoreBarFill,
                {
                  width: `${layer.score}%`,
                  backgroundColor:
                    layer.score < 30
                      ? '#4CAF50'
                      : layer.score < 60
                      ? '#FFC107'
                      : '#FF3B30'
                }
              ]}
            />
          </View>
        </View>

        {layer.explanation && (
          <View style={styles.detailsSection}>
            <Text style={styles.detailsTitle}>Explanation</Text>
            <Text style={styles.detailsText}>{layer.explanation}</Text>
          </View>
        )}

        {detailsArray.length > 0 && (
          <View style={styles.detailsSection}>
            <Text style={styles.detailsTitle}>Details</Text>
            {detailsArray.map((item, index) => (
              <View key={index} style={styles.detailItem}>
                <Text style={styles.detailKey}>
                  {formatDetailKey(item.key)}
                </Text>
                <Text style={styles.detailValueText}>
                  {formatDetailValue(item.value)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Overall Fraud Assessment */}
      <View style={styles.overallAssessment}>
        <View style={styles.assessmentHeader}>
          <View>
            <Text style={styles.assessmentLabel}>Overall Fraud Score</Text>
            <Text style={styles.overallScore}>
              {fraudCheckData.overallScore}/100
            </Text>
          </View>
          <View
            style={[
              styles.riskTierBadge,
              {
                backgroundColor:
                  fraudCheckData.riskTier === 'GREEN'
                    ? '#4CAF50'
                    : fraudCheckData.riskTier === 'YELLOW'
                    ? '#FFC107'
                    : '#FF3B30'
              }
            ]}
          >
            <Text style={styles.riskTierText}>{fraudCheckData.riskTier}</Text>
          </View>
        </View>

        {/* Score Interpretation */}
        <View style={styles.scoreInterpretation}>
          <View style={styles.scoreRangeItem}>
            <View style={[styles.colorDot, { backgroundColor: '#4CAF50' }]} />
            <Text style={styles.scoreRangeText}>0-30: Low Risk</Text>
          </View>
          <View style={styles.scoreRangeItem}>
            <View style={[styles.colorDot, { backgroundColor: '#FFC107' }]} />
            <Text style={styles.scoreRangeText}>31-59: Medium Risk</Text>
          </View>
          <View style={styles.scoreRangeItem}>
            <View style={[styles.colorDot, { backgroundColor: '#FF3B30' }]} />
            <Text style={styles.scoreRangeText}>60-100: High Risk</Text>
          </View>
        </View>

        {/* Summary Stats */}
        {fraudCheckData.summary && (
          <View style={styles.summaryStats}>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Passed Checks</Text>
              <Text style={[styles.statValue, { color: '#4CAF50' }]}>
                {fraudCheckData.summary.passedLayers}/{fraudCheckData.summary.totalLayers}
              </Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Failed Checks</Text>
              <Text
                style={[
                  styles.statValue,
                  {
                    color:
                      fraudCheckData.summary.failedLayers > 0
                        ? '#FF3B30'
                        : '#4CAF50'
                  }
                ]}
              >
                {fraudCheckData.summary.failedLayers}/{fraudCheckData.summary.totalLayers}
              </Text>
            </View>
          </View>
        )}

        {/* Risk Assessment */}
        {fraudCheckData.summary?.riskAssessment && (
          <View style={styles.riskAssessmentBox}>
            <Text style={styles.riskAssessmentLabel}>Risk Assessment</Text>
            <Text style={styles.riskAssessmentValue}>
              {fraudCheckData.summary.riskAssessment}
            </Text>
          </View>
        )}
      </View>

      {/* Fraud Flags (if any) */}
      {fraudCheckData.fraudFlags && fraudCheckData.fraudFlags.length > 0 && (
        <View style={styles.fraudFlagsSection}>
          <Text style={styles.sectionTitle}>Fraud Flags Triggered</Text>
          <View style={styles.flagsList}>
            {fraudCheckData.fraudFlags.map((flag, index) => (
              <View key={index} style={styles.flagItem}>
                <AlertTriangle
                  size={16}
                  color="#FF3B30"
                />
                <Text style={styles.flagText}>{formatFlagName(flag)}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* 6 Fraud Detection Layers */}
      <View style={styles.layersContainer}>
        <Text style={styles.sectionTitle}>6-Layer Fraud Detection</Text>

        {fraudCheckData.layers &&
          Object.entries(fraudCheckData.layers).map(([layerKey, layer]) => (
            <TouchableOpacity
              key={layerKey}
              style={styles.layerCard}
              onPress={() => toggleLayer(layerKey)}
              activeOpacity={0.7}
            >
              {/* Layer Header */}
              <View
                style={[
                  styles.layerHeader,
                  {
                    backgroundColor: getLayerColor(layer.status) + '15'
                  }
                ]}
              >
                <View style={styles.layerTitleRow}>
                  {React.createElement(getLayerIcon(layerKey), {
                    size: 20,
                    color: getLayerColor(layer.status),
                    style: styles.layerIcon
                  })}
                  <View style={styles.layerTitleContent}>
                    <Text style={styles.layerName}>{layer.layerName}</Text>
                    {layer.explanation && (
                      <Text
                        style={styles.layerExplanationPreview}
                        numberOfLines={1}
                      >
                        {layer.explanation}
                      </Text>
                    )}
                  </View>
                </View>

                <View style={styles.layerStatusRow}>
                  <View
                    style={[
                      styles.layerStatusBadge,
                      {
                        backgroundColor: getLayerColor(layer.status)
                      }
                    ]}
                  >
                    <Text style={styles.layerStatusText}>{layer.status}</Text>
                  </View>
                  {expandedLayer === layerKey ? (
                    <ChevronUp size={20} color="#666" style={styles.expandIcon} />
                  ) : (
                    <ChevronDown size={20} color="#666" style={styles.expandIcon} />
                  )}
                </View>
              </View>

              {/* Expanded Layer Details */}
              {expandedLayer === layerKey &&
                renderLayerDetails(layerKey, layer)}
            </TouchableOpacity>
          ))}
      </View>
    </View>
  );
};

// Helper functions
const formatDetailKey = (key) => {
  return key
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .split(' ')
    .map(
      (word, i) =>
        (i === 0 ? word.charAt(0).toUpperCase() : word.charAt(0)) +
        word.slice(1)
    )
    .join(' ');
};

const formatDetailValue = (value) => {
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  if (typeof value === 'number') {
    if (value % 1 === 0) {
      return value.toString();
    }
    return value.toFixed(2);
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? `${value.length} items` : 'No items';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
};

const formatFlagName = (flag) => {
  return flag
    .replace(/_/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  overallAssessment: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16
  },
  assessmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16
  },
  assessmentLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
    marginBottom: 4,
    fontFamily: 'System'
  },
  overallScore: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    fontFamily: 'System'
  },
  riskTierBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6
  },
  riskTierText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 12,
    fontFamily: 'System'
  },
  scoreInterpretation: {
    marginBottom: 16
  },
  scoreRangeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6
  },
  colorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8
  },
  scoreRangeText: {
    fontSize: 12,
    color: '#666',
    fontFamily: 'System'
  },
  summaryStats: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 12
  },
  statItem: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center'
  },
  statDivider: {
    width: 1,
    backgroundColor: '#E0E0E0'
  },
  statLabel: {
    fontSize: 11,
    color: '#666',
    marginBottom: 4,
    fontFamily: 'System'
  },
  statValue: {
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'System'
  },
  riskAssessmentBox: {
    backgroundColor: '#FFF',
    padding: 12,
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#FFC107'
  },
  riskAssessmentLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
    fontWeight: '500',
    fontFamily: 'System'
  },
  riskAssessmentValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '600',
    fontFamily: 'System'
  },
  fraudFlagsSection: {
    marginBottom: 16
  },
  flagsList: {
    flexDirection: 'column'
  },
  flagItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0'
  },
  flagText: {
    fontSize: 13,
    color: '#FF3B30',
    fontWeight: '500',
    marginLeft: 12,
    fontFamily: 'System'
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
    fontFamily: 'System'
  },
  layersContainer: {
    marginTop: 4
  },
  layerCard: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E0E0E0'
  },
  layerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12
  },
  layerTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
    marginRight: 8
  },
  layerIcon: {
    marginTop: 2,
    marginRight: 8
  },
  layerTitleContent: {
    flex: 1
  },
  layerName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
    fontFamily: 'System'
  },
  layerExplanationPreview: {
    fontSize: 12,
    color: '#999',
    fontFamily: 'System'
  },
  layerStatusRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  layerStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginRight: 8
  },
  layerStatusText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'System'
  },
  expandIcon: {
    marginRight: -4
  },
  layerDetails: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    backgroundColor: '#FAFAFA'
  },
  scoreBar: {
    marginBottom: 16
  },
  scoreLabel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6
  },
  scoreLabelText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
    fontFamily: 'System'
  },
  scoreValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
    fontFamily: 'System'
  },
  scoreBarContainer: {
    height: 6,
    backgroundColor: '#E0E0E0',
    borderRadius: 3,
    overflow: 'hidden'
  },
  scoreBarFill: {
    height: '100%',
    borderRadius: 3
  },
  detailsSection: {
    marginBottom: 12
  },
  detailsTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
    fontFamily: 'System'
  },
  detailsText: {
    fontSize: 13,
    color: '#333',
    lineHeight: 18,
    fontFamily: 'System'
  },
  detailItem: {
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0'
  },
  detailKey: {
    fontSize: 12,
    fontWeight: '500',
    color: '#666',
    marginBottom: 4,
    fontFamily: 'System'
  },
  detailValueText: {
    fontSize: 12,
    color: '#333',
    fontFamily: 'System'
  }
});

export default FraudDetectionPanel;
