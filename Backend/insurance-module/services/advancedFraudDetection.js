/**
 * Advanced Fraud Detection Service
 * Detects GPS spoofing, duplicate claims, behavior anomalies, and weather validation
 */

const logger = require('../../automation-system/utils/logger');

class AdvancedFraudDetection {
  constructor() {
    this.fraudThreshold = 0.7; // Score > 0.7 = Likely fraud
    this.userBehaviorHistory = new Map(); // Track user patterns
  }

  /**
   * Comprehensive fraud detection for a claim
   */
  async analyzeClaim(claim, userProfile, userLocation) {
    try {
      logger.log(`🔍 Analyzing claim ${claim.id} for fraud indicators...`);

      let fraudScore = 0;
      const indicators = [];

      // Check 1: GPS Spoofing
      const gpsCheck = this.checkGpsSpoofing(claim, userLocation);
      if (gpsCheck.isSuspicious) {
        fraudScore += 0.35;
        indicators.push(gpsCheck.reason);
        logger.log(`⚠️  GPS Spoofing: ${gpsCheck.reason}`);
      }

      // Check 2: Duplicate Claims
      const duplicateCheck = await this.checkDuplicateClaims(claim, userProfile);
      if (duplicateCheck.isSuspicious) {
        fraudScore += 0.25;
        indicators.push(duplicateCheck.reason);
        logger.log(`⚠️  Duplicate: ${duplicateCheck.reason}`);
      }

      // Check 3: Behavior Anomaly
      const behaviorCheck = this.checkBehaviorAnomaly(claim, userProfile);
      if (behaviorCheck.isSuspicious) {
        fraudScore += 0.20;
        indicators.push(behaviorCheck.reason);
        logger.log(`⚠️  Behavior: ${behaviorCheck.reason}`);
      }

      // Check 4: Weather Mismatch
      const weatherCheck = this.checkWeatherMismatch(claim, userLocation);
      if (weatherCheck.isSuspicious) {
        fraudScore += 0.15;
        indicators.push(weatherCheck.reason);
        logger.log(`⚠️  Weather: ${weatherCheck.reason}`);
      }

      // Check 5: Time Pattern Analysis
      const timeCheck = this.checkTimePatternAnomaly(claim, userProfile);
      if (timeCheck.isSuspicious) {
        fraudScore += 0.10;
        indicators.push(timeCheck.reason);
        logger.log(`⚠️  Time: ${timeCheck.reason}`);
      }

      // Cap fraud score at 1.0
      fraudScore = Math.min(fraudScore, 1.0);

      const result = {
        claimId: claim.id,
        fraudScore: parseFloat(fraudScore.toFixed(2)),
        verdict: fraudScore > this.fraudThreshold ? 'SUSPICIOUS' : 'LEGITIMATE',
        confidence: Math.round((fraudScore > 0.5 ? fraudScore : 1 - fraudScore) * 100),
        indicators,
        recommendation: fraudScore > this.fraudThreshold ? 'DENY_CLAIM' : 'APPROVE_CLAIM',
        timestamp: new Date(),
      };

      logger.log(`✅ Fraud Analysis Complete: Score ${result.fraudScore}, Verdict: ${result.verdict}`);
      return result;
    } catch (error) {
      logger.error('Fraud Detection Error:', error.message);
      return { verdict: 'ERROR', error: error.message };
    }
  }

  /**
   * Check 1: GPS Spoofing Detection
   * Validates if claimed location and movement is physically possible
   */
  checkGpsSpoofing(claim, userLocation) {
    try {
      if (!userLocation.current || !userLocation.previous) {
        return { isSuspicious: false };
      }

      // Calculate distance between previous and current location
      const distance = this.calculateDistance(
        userLocation.previous.lat,
        userLocation.previous.lng,
        userLocation.current.lat,
        userLocation.current.lng
      );

      // Calculate time elapsed in hours
      const timeElapsed = (new Date(userLocation.current.timestamp) - new Date(userLocation.previous.timestamp)) / (60 * 60 * 1000);

      if (timeElapsed > 0) {
        const speed = distance / timeElapsed;

        // Delivery bikes: max ~60 km/h (even with traffic it's ~50 km/h avg)
        // Flagged if > 150 km/h (impossible)
        if (speed > 150) {
          return {
            isSuspicious: true,
            reason: `Impossible speed detected: ${speed.toFixed(0)} km/h (Max feasible: 60 km/h). Distance: ${distance.toFixed(1)}km in ${timeElapsed.toFixed(1)}h`,
          };
        }
      }

      return { isSuspicious: false };
    } catch (error) {
      logger.error('GPS Check Error:', error.message);
      return { isSuspicious: false };
    }
  }

  /**
   * Haversine formula: Calculate distance between two coordinates
   */
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Check 2: Duplicate Claims Detection
   * Prevent multiple claims for the same event
   */
  async checkDuplicateClaims(claim, userProfile) {
    try {
      // Mock: Check against recent claims (in production, query database)
      const recentClaims = userProfile.pastClaims || [];

      for (const pastClaim of recentClaims.slice(-10)) { // Check last 10 claims
        // Same disruption type within 24 hours
        const timeDiff = (new Date(claim.disruptionStart) - new Date(pastClaim.date)) / (1000 * 60 * 60);

        if (pastClaim.type === claim.disruptionType && timeDiff < 24) {
          return {
            isSuspicious: true,
            reason: `Duplicate claim: Same disruption type (${claim.disruptionType}) filed ${timeDiff.toFixed(1)} hours ago`,
          };
        }

        // Exact same coordinates within 1 hour
        if (
          pastClaim.coordinates &&
          claim.coordinates &&
          this.calculateDistance(
            pastClaim.coordinates.lat,
            pastClaim.coordinates.lng,
            claim.coordinates.lat,
            claim.coordinates.lng
          ) < 0.1 &&
          timeDiff < 1
        ) {
          return {
            isSuspicious: true,
            reason: 'Duplicate claim: Same location and time',
          };
        }
      }

      return { isSuspicious: false };
    } catch (error) {
      logger.error('Duplicate Check Error:', error.message);
      return { isSuspicious: false };
    }
  }

  /**
   * Check 3: Behavior Pattern Anomaly
   * Detect sudden changes in claim filing behavior
   */
  checkBehaviorAnomaly(claim, userProfile) {
    try {
      const recentClaims = userProfile.pastClaims || [];

      // Count claims in last 30 days
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const recentCount = recentClaims.filter(
        (c) => new Date(c.date) > thirtyDaysAgo
      ).length;

      // If user suddenly starts filing many more claims than their average
      const avgClaimsPerMonth = recentClaims.length / Math.max(userProfile.membershipMonths || 1, 1);

      if (recentCount > avgClaimsPerMonth * 2.5) {
        return {
          isSuspicious: true,
          reason: `Abnormal claim frequency: ${recentCount} claims in 30 days (avg: ${avgClaimsPerMonth.toFixed(1)})`,
        };
      }

      return { isSuspicious: false };
    } catch (error) {
      logger.error('Behavior Check Error:', error.message);
      return { isSuspicious: false };
    }
  }

  /**
   * Check 4: Weather Validation
   * Verify if claimed weather disruption actually occurred
   */
  checkWeatherMismatch(claim, userLocation) {
    try {
      if (claim.disruptionType !== 'WEATHER' && claim.disruptionType !== 'SEVERE_POLLUTION') {
        return { isSuspicious: false };
      }

      // Mock: Compare against weather service
      // In production: Call actual weather API
      const mockWeatherData = {
        'New Delhi': { hasRain: true, aqi: 450 },
        'Mumbai': { hasRain: false, aqi: 280 },
        'Bangalore': { hasRain: false, aqi: 150 },
      };

      const weatherAtLocation = mockWeatherData[userLocation?.zone] || {};

      if (claim.disruptionType === 'WEATHER' && !weatherAtLocation.hasRain) {
        return {
          isSuspicious: true,
          reason: `Weather mismatch: No rain recorded at ${userLocation?.zone} during claim time`,
        };
      }

      if (claim.disruptionType === 'SEVERE_POLLUTION' && weatherAtLocation.aqi < 400) {
        return {
          isSuspicious: true,
          reason: `Pollution mismatch: AQI ${weatherAtLocation.aqi} at ${userLocation?.zone} (Claim: Severe Pollution)`,
        };
      }

      return { isSuspicious: false };
    } catch (error) {
      logger.error('Weather Check Error:', error.message);
      return { isSuspicious: false };
    }
  }

  /**
   * Check 5: Time Pattern Anomaly
   * Check if claim filing time is unusual for user
   */
  checkTimePatternAnomaly(claim, userProfile) {
    try {
      const claimHour = new Date(claim.disruptionStart).getHours();
      
      // Most delivery workers work 8am-11pm
      // If claim at 3am, suspicious
      if (claimHour >= 0 && claimHour <= 6) {
        return {
          isSuspicious: true,
          reason: `Unusual claim time: ${claimHour}:00 (Most delivery work is 8am-11pm)`,
        };
      }

      return { isSuspicious: false };
    } catch (error) {
      logger.error('Time Pattern Check Error:', error.message);
      return { isSuspicious: false };
    }
  }

  /**
   * Record user behavior for learning
   */
  recordUserBehavior(userId, claimData, fraudResult) {
    if (!this.userBehaviorHistory.has(userId)) {
      this.userBehaviorHistory.set(userId, []);
    }

    const history = this.userBehaviorHistory.get(userId);
    history.push({
      claim: claimData,
      fraudResult,
      timestamp: new Date(),
    });

    // Keep only last 100 records per user
    if (history.length > 100) {
      history.shift();
    }

    logger.log(`📝 User behavior recorded for ${userId}`);
  }

  /**
   * Get fraud statistics
   */
  getFraudStatistics() {
    let totalClaims = 0;
    let totalFraudulent = 0;

    for (const history of this.userBehaviorHistory.values()) {
      for (const record of history) {
        totalClaims++;
        if (record.fraudResult.verdict === 'SUSPICIOUS') {
          totalFraudulent++;
        }
      }
    }

    return {
      totalClaimsAnalyzed: totalClaims,
      totalFraudulentClaims: totalFraudulent,
      fraudRate: totalClaims > 0 ? ((totalFraudulent / totalClaims) * 100).toFixed(2) + '%' : '0%',
      systemAccuracy: '94%', // Mock accuracy
    };
  }
}

module.exports = new AdvancedFraudDetection();
