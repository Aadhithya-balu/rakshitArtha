const logger = require('../utils/logger');
const MLUtilities = require('./mlUtilities');

/**
 * Advanced Fraud Detection Model (No TensorFlow Required)
 * Uses Statistical ML algorithms: Isolation Forest, LOF, Z-scores, IQR
 * Supports 25+ engineered features with comprehensive anomaly detection
 */
class MLFraudDetectionModel {
  constructor() {
    this.isLoaded = true; // Always ready - no external dependencies
    this.featureStats = {}; // Store statistics for z-score calculations
    this.historicalClaims = []; // Store historical data for LOF/IF
    this.logger = logger;
  }

  /**
   * Initialize ML model (synchronous - no async needed)
   */
  async initialize() {
    this.logger.info('✅ Statistical ML Fraud Detection Model initialized (No TensorFlow required)');
    this.isLoaded = true;
  }

  /**
   * Predict fraud score with Isolation Forest + LOF + Statistical methods
   * Returns: { score: 0-100, confidence: 0-100, interpretation, components, severity }
   */
  async predictFraudScore(claimFeatures) {
    try {
      const engineeredFeatures = this._engineerFeatures(claimFeatures);

      // Component scores from different algorithms
      const zScoreAnomaly = this._zScoreAnomalyDetection(engineeredFeatures);
      const isolationScore = this._isolationForestAnomalyScore(engineeredFeatures);
      const lofScore = this._localOutlierFactorScore(engineeredFeatures);
      const behavioralScore = this._behavioralAnomalyScore(engineeredFeatures);
      const frequencyScore = this._frequencyPatternScore(engineeredFeatures);
      const amountScore = this._amountAnomalyScore(engineeredFeatures);
      const locationScore = this._locationAnomalyScore(engineeredFeatures);
      const velocityScore = this._velocityAnomalyScore(engineeredFeatures);
      const deviceScore = this._deviceSignalsScore(engineeredFeatures);
      const timingScore = this._timingAnomalyScore(engineeredFeatures);

      // Weighted ensemble of all components
      const aggregateScore = this._ensembleScore({
        zScore: zScoreAnomaly.score * 0.15,
        isolation: isolationScore * 0.20,
        lof: lofScore * 0.15,
        behavioral: behavioralScore * 0.12,
        frequency: frequencyScore * 0.10,
        amount: amountScore * 0.10,
        location: locationScore * 0.08,
        velocity: velocityScore * 0.05,
        device: deviceScore * 0.03,
        timing: timingScore * 0.02
      });

      // Calculate confidence (how certain we are)
      const confidence = this._calculateConfidence({
        zScoreAnomaly,
        isolationScore,
        lofScore,
        behavioralScore
      });

      // Store historical data for future LOF calculations
      this.historicalClaims.push(engineeredFeatures);
      if (this.historicalClaims.length > 10000) {
        this.historicalClaims.shift(); // Keep last 10k claims
      }

      return {
        score: Math.round(aggregateScore),
        confidence: Math.round(confidence),
        probability: aggregateScore / 100,
        model: 'STATISTICAL_ENSEMBLE',
        interpretation: this._interpretScore(Math.round(aggregateScore)),
        severity: this._calculateSeverity(Math.round(aggregateScore)),
        components: {
          zScore: Math.round(zScoreAnomaly.score),
          isolation: Math.round(isolationScore),
          lof: Math.round(lofScore),
          behavioral: Math.round(behavioralScore),
          frequency: Math.round(frequencyScore),
          amount: Math.round(amountScore),
          location: Math.round(locationScore),
          velocity: Math.round(velocityScore),
          device: Math.round(deviceScore),
          timing: Math.round(timingScore)
        },
        flags: this._generateFlags(engineeredFeatures, {
          zScoreAnomaly,
          isolationScore,
          lofScore,
          behavioralScore
        })
      };
    } catch (error) {
      this.logger.error('ML prediction error', { error: error.message });
      return this._safeDefaultScore();
    }
  }

  // ====== FEATURE ENGINEERING (25+ FEATURES) ======

  _engineerFeatures(claimData) {
    return {
      // Basic features
      claimAmount: claimData.claimAmount || 0,
      riskScore: claimData.riskScore || 0,
      locationDistance: claimData.locationDistance || 0,

      // Temporal features
      daysToExpiry: claimData.daysToExpiry || 365,
      daysSincePolicyStart: claimData.daysSincePolicyStart || 0,
      hourOfDay: claimData.hourOfDay || new Date().getHours(),
      dayOfWeek: claimData.dayOfWeek || new Date().getDay(),
      secondsSinceLastClaim: claimData.secondsSinceLastClaim || 86400,

      // Frequency features
      claimsInPast7days: claimData.claimsInPast7days || 0,
      claimsInPast30days: claimData.claimsInPast30days || 0,
      claimsInPast90days: claimData.claimsInPast90days || 0,
      claimFrequencyRate: (claimData.claimsInPast30days || 0) / 30,
      claimVelocityLast24h: claimData.claimVelocityLast24h || 0,

      // Amount analysis
      amountDeviation: claimData.amountDeviation || 0, // std dev from baseline
      amountRatio: claimData.amountRatio || 1, // vs daily income
      largeClaimHistory: claimData.largeClaimHistory || 0,
      claimAmountTrend: claimData.claimAmountTrend || 0,

      // Behavioral features
      lossRatioPercent: claimData.lossRatioPercent || 0,
      deviceMotionVariance: claimData.deviceMotionVariance || 0,
      idleRatio: claimData.idleRatio || 0,
      appForegrndMinutes: claimData.appForegrndMinutes || 0,

      // Location-based
      locationConsistency: claimData.locationConsistency || 1,
      distanceFromBaseline: claimData.distanceFromBaseline || 0,
      speedMph: claimData.speedMph || 0,
      gpsAccuracy: claimData.gpsAccuracy || 0,

      // Device/network signals
      vpnDetected: claimData.vpnDetected ? 1 : 0,
      deviceSpoof: claimData.deviceSpoof ? 1 : 0,
      networkAnomaly: claimData.networkAnomaly ? 1 : 0,
      osVersion: this._encodeOsVersion(claimData.osVersion),
      appVersion: this._encodeVersionHash(claimData.appVersion),

      // Weather/context
      weatherEventMagnitude: claimData.weatherEventMagnitude || 0,
      trafficIndex: claimData.trafficIndex || 0,

      // User characteristics
      accountAge: Math.min(claimData.accountAge || 30, 365), // Cap at 1 year
      trustScore: claimData.trustScore || 0.5,
      policyType: this._encodePolicyType(claimData.policyType)
    };
  }

  // ====== ANOMALY DETECTION ALGORITHMS ======

  _zScoreAnomalyDetection(features) {
    const criticalFeatures = [
      'claimsInPast30days',
      'claimAmount',
      'locationDistance',
      'claimFrequencyRate',
      'amountRatio'
    ];

    let totalZ = 0;
    let anomalyFlags = 0;

    for (const feat of criticalFeatures) {
      const value = features[feat] || 0;
      const mean = this.featureStats[feat]?.mean || value;
      const std = this.featureStats[feat]?.std || 1;

      const zScore = Math.abs((value - mean) / (std + 0.1));
      totalZ += zScore;

      if (zScore > 2.5) anomalyFlags++;
    }

    const avgZ = totalZ / criticalFeatures.length;
    return {
      score: Math.min(avgZ * 10, 100),
      anomalyCount: anomalyFlags,
      isAnomaly: anomalyFlags >= 2
    };
  }

  _isolationForestAnomalyScore(features) {
    // Simplified Isolation-Forest-like scoring
    let anomalyScore = 0;

    // Check depth of anomalies
    if (features.claimsInPast30days > 5) anomalyScore += 15; // Frequent claimer
    if (features.claimsInPast7days > 2) anomalyScore += 12;  // Very recent
    if (features.claimVelocityLast24h > 1) anomalyScore += 18; // Velocity spike

    if (features.locationDistance > 30) anomalyScore += 14;   // Far travel
    if (features.speedMph > 150) anomalyScore += 16;          // Impossible speed
    if (features.amountRatio > 1.5) anomalyScore += 10;       // Large loss

    if (features.idleRatio > 0.85) anomalyScore += 8;         // Not moving
    if (features.deviceMotionVariance < 0.15) anomalyScore += 10; // Fake motion

    if (features.vpnDetected) anomalyScore += 20;             // VPN usage
    if (features.deviceSpoof) anomalyScore += 25;             // Device spoofing

    return Math.min(anomalyScore, 100);
  }

  _localOutlierFactorScore(features) {
    // Density-based outlier detection
    if (this.historicalClaims.length < 10) return 0;

    const recentClaims = this.historicalClaims.slice(-100);
    const distances = recentClaims.map(claim => 
      MLUtilities.euclideanDistance(
        this._normalizeFeatures(features),
        this._normalizeFeatures(claim)
      )
    );

    distances.sort((a, b) => a - b);
    const k = Math.min(5, distances.length);
    const knnDistance = distances[k - 1];
    const avgKnnDistance = distances.slice(0, k).reduce((a, b) => a + b, 0) / k;

    // Large isolated claim = high LOF score
    const lofScore = Math.max(0, (knnDistance - avgKnnDistance) / (avgKnnDistance + 1)) * 50;
    return Math.min(lofScore, 100);
  }

  _behavioralAnomalyScore(features) {
    let score = 0;

    // Income loss ratio anomalies
    if (features.lossRatioPercent > 150) score += 25;
    else if (features.lossRatioPercent > 100) score += 15;

    // Activity contradiction
    if (features.idleRatio > 0.8 && features.claimAmount > 100) score += 20;

    // Motion inconsistency
    if (features.deviceMotionVariance < 0.2 && features.speedMph > 50) score += 15;

    // Account age vs claim pattern
    if (features.accountAge < 7 && features.claimsInPast7days > 0) score += 18;

    // Timing oddities
    if (features.hourOfDay >= 2 && features.hourOfDay <= 4) score += 8; // 2-4 AM claims
    if (features.dayOfWeek === 0 || features.dayOfWeek === 6) score -= 5; // Weekend patterns normal

    return Math.min(score, 100);
  }

  _frequencyPatternScore(features) {
    let score = 0;

    if (features.claimVelocityLast24h >= 3) score += 35;
    else if (features.claimVelocityLast24h >= 2) score += 25;
    else if (features.claimVelocityLast24h >= 1) score += 15;

    if (features.claimsInPast7days > 3) score += 20;
    if (features.claimsInPast30days > 8) score += 15;

    // Spacing too regular = gaming
    if (features.secondsSinceLastClaim < 300) score += 22; // Claims within 5 mins

    return Math.min(score, 100);
  }

  _amountAnomalyScore(features) {
    let score = 0;

    const deviation = Math.abs(features.amountDeviation);
    if (deviation > 2.5) score += 25;
    else if (deviation > 2) score += 15;
    else if (deviation > 1.5) score += 8;

    if (features.amountRatio > 2.0) score += 20;
    else if (features.amountRatio > 1.5) score += 12;

    if (features.claimAmountTrend > 0.3) score += 10; // Escalating claims
    if (features.largeClaimHistory > 3) score += 8;

    return Math.min(score, 100);
  }

  _locationAnomalyScore(features) {
    let score = 0;

    if (features.speedMph > 200) score += 35;
    else if (features.speedMph > 150) score += 25;
    else if (features.speedMph > 100) score += 15;

    if (features.distanceFromBaseline > 50) score += 20;
    else if (features.distanceFromBaseline > 30) score += 12;

    if (features.locationConsistency < 0.5) score += 15;
    if (features.gpsAccuracy > 150) score += 8; // Poor GPS

    return Math.min(score, 100);
  }

  _velocityAnomalyScore(features) {
    let score = 0;

    if (features.claimVelocityLast24h > 2) score += 30;
    else if (features.claimVelocityLast24h > 1) score += 15;

    if (features.secondsSinceLastClaim < 600) score += 18;

    return Math.min(score, 100);
  }

  _deviceSignalsScore(features) {
    let score = 0;

    if (features.vpnDetected) score += 25;
    if (features.deviceSpoof) score += 30;
    if (features.networkAnomaly) score += 15;

    // New/suspicious device
    if (features.osVersion === 'UNKNOWN') score += 8;
    if (features.appVersion === 0) score += 10;

    return Math.min(score, 100);
  }

  _timingAnomalyScore(features) {
    let score = 0;

    // Unusual hours
    if (features.hourOfDay >= 2 && features.hourOfDay <= 5) score += 8;

    // Weekend/holiday patterns
    if ((features.dayOfWeek === 0 || features.dayOfWeek === 6) && 
        features.claimVelocityLast24h > 1) score += 5;

    // Time since policy vs claim pattern
    if (features.daysSincePolicyStart < 7 && features.claimsInPast7days > 0) score += 12;

    return Math.min(score, 100);
  }

  // ====== ENSEMBLE & SCORING ======

  _ensembleScore(components) {
    let total = 0;
    let weights = 0;

    for (const [key, value] of Object.entries(components)) {
      total += value;
      weights++;
    }

    return Math.min(Math.round(total), 100);
  }

  _calculateConfidence(anomalyScores) {
    // Higher confidence if multiple methods agree
    const scores = [
      anomalyScores.zScoreAnomaly.anomalyCount > 0 ? 1 : 0,
      anomalyScores.isolationScore > 30 ? 1 : 0,
      anomalyScores.lofScore > 30 ? 1 : 0,
      anomalyScores.behavioralScore > 30 ? 1 : 0
    ];

    const agreement = scores.reduce((a, b) => a + b, 0);
    return Math.max(40, agreement * 25); // Min 40%, max 100%
  }

  _calculateSeverity(score) {
    if (score >= 80) return 'CRITICAL';
    if (score >= 60) return 'HIGH';
    if (score >= 40) return 'MEDIUM';
    if (score >= 20) return 'LOW';
    return 'MINIMAL';
  }

  _generateFlags(features, anomalies) {
    const flags = [];

    if (anomalies.zScoreAnomaly.anomalyCount >= 2) flags.push('STATISTICAL_OUTLIER');
    if (anomalies.isolationScore > 50) flags.push('ISOLATION_ANOMALY');
    if (anomalies.lofScore > 40) flags.push('DENSITY_OUTLIER');
    if (anomalies.behavioralScore > 40) flags.push('BEHAVIORAL_MISMATCH');

    if (features.vpnDetected) flags.push('VPN_DETECTED');
    if (features.deviceSpoof) flags.push('DEVICE_SPOOFING');
    if (features.claimVelocityLast24h > 1) flags.push('CLAIM_VELOCITY_SPIKE');
    if (features.speedMph > 100) flags.push('IMPOSSIBLE_SPEED');
    if (features.idleRatio > 0.85) flags.push('UNEXPECTED_IDLE');

    return flags;
  }

  _interpretScore(score) {
    if (score >= 80) return 'VERY_HIGH_RISK';
    if (score >= 60) return 'HIGH_RISK';
    if (score >= 40) return 'MEDIUM_RISK';
    if (score >= 20) return 'LOW_RISK';
    return 'ACCEPTABLE_RISK';
  }

  // ====== HELPER METHODS ======

  _normalizeFeatures(features) {
    return {
      claimAmount: (features.claimAmount || 0) / 500,
      claimsInPast30days: (features.claimsInPast30days || 0) / 10,
      locationDistance: (features.locationDistance || 0) / 50,
      speedMph: Math.min((features.speedMph || 0) / 100, 1),
      amountRatio: Math.min((features.amountRatio || 0) / 3, 1)
    };
  }

  _encodeOsVersion(osVersion) {
    const versionMap = { iOS: 1, Android: 2, Web: 3 };
    return versionMap[osVersion] || 0;
  }

  _encodeVersionHash(version) {
    if (!version) return 0;
    let hash = 0;
    for (let i = 0; i < version.length; i++) {
      hash = ((hash << 5) - hash) + version.charCodeAt(i);
    }
    return Math.abs(hash) % 100;
  }

  _encodePolicyType(policyType) {
    const typeMap = {
      DELIVERY: 1,
      GIG_WORK: 2,
      RIDE_SHARE: 3,
      GENERAL: 4
    };
    return typeMap[policyType] || 0;
  }

  _safeDefaultScore() {
    return {
      score: 25,
      confidence: 30,
      probability: 0.25,
      model: 'ERROR_FALLBACK',
      interpretation: 'LOW_RISK',
      severity: 'LOW',
      components: {},
      flags: ['PREDICTION_ERROR']
    };
  }
}

module.exports = {
  mlFraudDetectionModel: new MLFraudDetectionModel()
};
