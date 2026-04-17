/**
 * ML Utilities - Statistical ML Algorithms for Fraud Detection
 * Provides Isolation Forest, LOF, Z-score, and other statistical methods
 * No TensorFlow dependency - pure statistical approach
 */

const logger = require('../utils/logger');

class MLUtilities {
  /**
   * Normalize features to 0-1 range
   */
  static normalizeFeatures(features, mins = null, maxs = null) {
    if (!mins || !maxs) {
      mins = {};
      maxs = {};
      
      // Auto-calculate mins/maxs from features
      Object.keys(features).forEach(key => {
        mins[key] = features[key];
        maxs[key] = features[key];
      });
    }

    const normalized = {};
    Object.keys(features).forEach(key => {
      const min = mins[key] || 0;
      const max = maxs[key] || 1;
      const range = max - min || 1;
      normalized[key] = (features[key] - min) / range;
    });

    return { normalized, mins, maxs };
  }

  /**
   * Standardize features (Z-score normalization)
   */
  static standardizeFeatures(features, means = null, stdDevs = null) {
    if (!means || !stdDevs) {
      means = {};
      stdDevs = {};

      Object.keys(features).forEach(key => {
        means[key] = features[key];
        stdDevs[key] = 1;
      });
    }

    const standardized = {};
    Object.keys(features).forEach(key => {
      const mean = means[key] || 0;
      const std = stdDevs[key] || 1;
      standardized[key] = std > 0 ? (features[key] - mean) / std : 0;
    });

    return { standardized, means, stdDevs };
  }

  /**
   * Euclidean distance between two feature vectors
   */
  static euclideanDistance(point1, point2) {
    let sum = 0;
    const keys = Object.keys(point1);
    
    for (const key of keys) {
      const diff = (point1[key] || 0) - (point2[key] || 0);
      sum += diff * diff;
    }

    return Math.sqrt(sum);
  }

  /**
   * Manhattan distance (L1)
   */
  static manhattanDistance(point1, point2) {
    let sum = 0;
    const keys = Object.keys(point1);

    for (const key of keys) {
      sum += Math.abs((point1[key] || 0) - (point2[key] || 0));
    }

    return sum;
  }

  /**
   * Calculate Z-score for anomaly detection
   * Returns: { score: -3 to 3, isAnomaly: bool, severity: 0-1 }
   */
  static calculateZScore(value, mean, stdDev, threshold = 2.5) {
    if (stdDev === 0) return { score: 0, isAnomaly: false, severity: 0 };

    const zScore = (value - mean) / stdDev;
    const severity = Math.min(Math.abs(zScore) / threshold, 1);

    return {
      score: zScore,
      isAnomaly: Math.abs(zScore) > threshold,
      severity: severity,
      confidence: Math.max(0, 1 - severity * 0.2) // Higher Z-score = lower confidence
    };
  }

  /**
   * Mahalanobis Distance - multivariate outlier detection
   */
  static mahalanobisDistance(point, mean, covarianceMatrix) {
    const diff = {};
    Object.keys(point).forEach(key => {
      diff[key] = point[key] - (mean[key] || 0);
    });

    // Simplified: use inverse diagonal of covariance
    let distance = 0;
    Object.keys(diff).forEach(key => {
      const variance = covarianceMatrix[key] || 1;
      if (variance > 0) {
        distance += (diff[key] * diff[key]) / variance;
      }
    });

    return Math.sqrt(distance);
  }

  /**
   * Isolation Forest - Anomaly Detection Algorithm
   * Returns anomaly score: 0 (normal) to 1 (highly anomalous)
   */
  static isolationForest(point, dataPoints, numTrees = 10, sampleSize = 256) {
    let anomalyScore = 0;

    for (let i = 0; i < numTrees; i++) {
      const sample = this._randomSample(dataPoints, Math.min(sampleSize, dataPoints.length));
      const pathLength = this._isolationTreePathLength(point, sample, 0);
      anomalyScore += pathLength;
    }

    // Average path length across trees
    const avgPathLength = anomalyScore / numTrees;
    const expectedPathLength = this._expectedPathLength(Math.min(sampleSize, dataPoints.length));

    // Normalize to 0-1
    const score = Math.pow(2, -(avgPathLength / expectedPathLength));
    
    return {
      score: Math.min(score, 1),
      isAnomaly: score > 0.6,
      pathLength: avgPathLength,
      severity: Math.min((score - 0.5) * 2, 1)
    };
  }

  /**
   * Local Outlier Factor (LOF) - Density-based anomaly detection
   */
  static localOutlierFactor(point, dataPoints, k = 5) {
    const distances = dataPoints
      .map(p => ({
        point: p,
        distance: this.euclideanDistance(point, p)
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, k);

    if (distances.length === 0) return { score: 0.5, isAnomaly: false };

    const kDistance = distances[distances.length - 1].distance;
    const reachDistances = distances.map(d => Math.max(d.distance, kDistance));
    const lrdPoint = k / reachDistances.reduce((a, b) => a + b, 0);

    // Calculate LRD for neighbors
    let sumLrd = 0;
    for (const d of distances) {
      const neighborDistances = dataPoints
        .map(p => ({
          distance: this.euclideanDistance(d.point, p)
        }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, k);

      const neighborKDist = neighborDistances[neighborDistances.length - 1].distance;
      const neighborReachDist = neighborDistances.map(nd => Math.max(nd.distance, neighborKDist));
      const lrdNeighbor = k / neighborReachDist.reduce((a, b) => a + b, 0);
      sumLrd += lrdNeighbor;
    }

    const lof = (sumLrd / distances.length) / (lrdPoint + 0.0001);

    return {
      score: Math.min(Math.max(lof - 0.5, 0), 1), // Normalize to 0-1
      isAnomaly: lof > 1.5,
      lof: lof,
      severity: Math.min((lof - 1) * 0.5, 1)
    };
  }

  /**
   * Statistical Outlier Detection using IQR (Interquartile Range)
   */
  static iqrOutlierDetection(value, dataPoints) {
    if (dataPoints.length < 4) return { isAnomaly: false, score: 0 };

    const sorted = [...dataPoints].sort((a, b) => a - b);
    const q1Index = Math.floor(sorted.length * 0.25);
    const q3Index = Math.floor(sorted.length * 0.75);

    const q1 = sorted[q1Index];
    const q3 = sorted[q3Index];
    const iqr = q3 - q1;

    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;

    const isOutlier = value < lowerBound || value > upperBound;
    const distanceFromBound = isOutlier
      ? Math.min(
          Math.abs(value - lowerBound),
          Math.abs(value - upperBound)
        )
      : 0;

    return {
      isAnomaly: isOutlier,
      score: Math.min(distanceFromBound / iqr, 1),
      bounds: { lower: lowerBound, upper: upperBound },
      iqr: iqr
    };
  }

  /**
   * Moving Average for trend detection
   */
  static movingAverage(dataPoints, windowSize = 7) {
    if (dataPoints.length < windowSize) return dataPoints;

    const result = [];
    for (let i = 0; i < dataPoints.length; i++) {
      const start = Math.max(0, i - windowSize + 1);
      const window = dataPoints.slice(start, i + 1);
      const avg = window.reduce((a, b) => a + b, 0) / window.length;
      result.push(avg);
    }

    return result;
  }

  /**
   * Exponential Moving Average (EMA) for trend smoothing
   */
  static exponentialMovingAverage(dataPoints, alpha = 0.3) {
    if (dataPoints.length === 0) return [];

    const result = [dataPoints[0]];
    for (let i = 1; i < dataPoints.length; i++) {
      const ema = alpha * dataPoints[i] + (1 - alpha) * result[i - 1];
      result.push(ema);
    }

    return result;
  }

  /**
   * Detect deviation from baseline
   */
  static detectDeviation(currentValue, baseline, stdDev, threshold = 1.5) {
    const deviation = Math.abs(currentValue - baseline);
    const normalized = deviation / (stdDev + 0.0001);

    return {
      deviation: normalized,
      isDeviation: normalized > threshold,
      severity: Math.min(normalized / threshold, 1),
      percentChange: ((currentValue - baseline) / baseline) * 100
    };
  }

  /**
   * Cosine Similarity between two vectors
   */
  static cosineSimilarity(vec1, vec2) {
    const keys = Object.keys(vec1);
    let dotProduct = 0;
    let magnitude1 = 0;
    let magnitude2 = 0;

    for (const key of keys) {
      const v1 = vec1[key] || 0;
      const v2 = vec2[key] || 0;
      dotProduct += v1 * v2;
      magnitude1 += v1 * v1;
      magnitude2 += v2 * v2;
    }

    const denominator = Math.sqrt(magnitude1) * Math.sqrt(magnitude2);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  /**
   * Calculate percentiles
   */
  static percentile(dataPoints, p) {
    if (dataPoints.length === 0) return 0;
    const sorted = [...dataPoints].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Calculate statistics summary
   */
  static calculateStats(values) {
    if (values.length === 0) return null;

    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);
    const mean = sum / values.length;
    const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    return {
      count: values.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      mean: mean,
      median: sorted[Math.floor(sorted.length / 2)],
      q1: sorted[Math.floor(sorted.length * 0.25)],
      q3: sorted[Math.floor(sorted.length * 0.75)],
      stdDev: stdDev,
      variance: variance,
      range: sorted[sorted.length - 1] - sorted[0]
    };
  }

  // ====== PRIVATE HELPER METHODS ======

  static _randomSample(arr, size) {
    const result = [];
    const indices = new Set();
    while (indices.size < Math.min(size, arr.length)) {
      indices.add(Math.floor(Math.random() * arr.length));
    }
    indices.forEach(i => result.push(arr[i]));
    return result;
  }

  static _isolationTreePathLength(point, subset, currentDepth) {
    if (subset.length <= 1 || currentDepth > 100) {
      return currentDepth + this._expectedPathLength(subset.length);
    }

    const keys = Object.keys(point);
    const randomKey = keys[Math.floor(Math.random() * keys.length)];
    const values = subset.map(p => p[randomKey] || 0);
    const splitValue = (Math.max(...values) + Math.min(...values)) / 2;

    const left = subset.filter(p => (p[randomKey] || 0) < splitValue);
    const right = subset.filter(p => (p[randomKey] || 0) >= splitValue);

    if (left.length === 0 || right.length === 0) {
      return currentDepth + 1;
    }

    const nextSubset = (point[randomKey] || 0) < splitValue ? left : right;
    return this._isolationTreePathLength(point, nextSubset, currentDepth + 1);
  }

  static _expectedPathLength(n) {
    if (n <= 1) return 0;
    return 2 * (Math.log(n - 1) + 0.5772156649) - 2 * (n - 1) / n;
  }
}

module.exports = MLUtilities;
