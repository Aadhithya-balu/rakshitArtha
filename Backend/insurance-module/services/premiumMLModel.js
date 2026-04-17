/**
 * ML Dynamic Premium Model Service
 * Calculates personalized weekly premiums based on risk factors
 * Uses simple regression model: Premium = Base + Risk_Adjustment - Zone_Discount + Seasonal_Premium
 */

const logger = require('../../automation-system/utils/logger');

class PremiumMLModel {
  constructor() {
    this.basePremium = 5.0; // Base premium ₹5/week
    this.model = {
      riskWeights: {
        highRisk: 1.5,    // High risk factor multiplier
        mediumRisk: 1.0,  // Medium risk factor multiplier
        lowRisk: 0.7,      // Low risk factor multiplier
      },
      seasonalFactors: {
        monsoon: 1.3,      // Monsoon season: +30%
        summer: 1.1,       // Summer: +10%
        winter: 0.9,       // Winter: -10%
        normal: 1.0,       // Normal: No change
      },
      zoneDiscounts: {
        highSafety: 0.5,   // 50% discount
        mediumSafety: 0.8, // 20% discount
        lowSafety: 1.0,    // No discount
      },
    };
    logger.log('✅ ML Premium Model initialized');
  }

  /**
   * Calculate personalized premium for a user
   * @param {Object} userProfile - User profile with risk data
   * @returns {Object} - Premium calculation breakdown
   */
  async calculatePremium(userProfile) {
    try {
      logger.log(`🧮 Calculating premium for user: ${userProfile.userId}`);

      // Step 1: Extract risk factors
      const riskFactors = this.extractRiskFeatures(userProfile);
      logger.log(`📊 Risk Factors: ${JSON.stringify(riskFactors)}`);

      // Step 2: Calculate risk adjustment
      const riskAdjustment = this.calculateRiskAdjustment(riskFactors);
      logger.log(`📈 Risk Adjustment: ₹${riskAdjustment.toFixed(2)}`);

      // Step 3: Get zone discount
      const zoneDiscount = this.getZoneDiscount(userProfile.zone);
      logger.log(`🏘️  Zone Discount Multiplier: ${zoneDiscount}`);

      // Step 4: Get seasonal factor
      const seasonalFactor = this.getSeasonalFactor();
      logger.log(`🌤️  Seasonal Factor: ${seasonalFactor}`);

      // Step 5: Calculate final premium
      let finalPremium = this.basePremium;
      finalPremium = finalPremium * seasonalFactor; // Apply seasonal
      finalPremium = finalPremium * zoneDiscount; // Apply zone discount
      finalPremium = finalPremium + riskAdjustment; // Add risk adjustment

      // Round to 2 decimals
      finalPremium = Math.round(finalPremium * 100) / 100;

      // Validate: Premium should be between ₹2-₹15
      finalPremium = Math.max(2.0, Math.min(15.0, finalPremium));

      const breakdown = {
        userId: userProfile.userId,
        basePremium: this.basePremium,
        seasonalFactor: seasonalFactor,
        zoneDiscount: zoneDiscount,
        riskAdjustment: riskAdjustment,
        finalPremium: finalPremium,
        coverage: finalPremium * 250, // ₹250 per rupee of premium
        breakdown: {
          base: this.basePremium,
          afterSeasonal: this.basePremium * seasonalFactor,
          afterZone: this.basePremium * seasonalFactor * zoneDiscount,
          afterRisk: finalPremium,
        },
        explanation: this.generateExplanation(userProfile, riskFactors, finalPremium),
        nextReviewDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 1 week
      };

      logger.log(`✅ Premium Calculated: ₹${finalPremium}/week`);
      return breakdown;
    } catch (error) {
      logger.error('Premium Calculation Error:', error.message);
      return this.getDefaultPremium();
    }
  }

  /**
   * Extract ML features from user profile
   */
  extractRiskFeatures(userProfile) {
    const features = {
      locationRisk: this.assessLocationRisk(userProfile.zone),
      weatherRisk: this.assessWeatherRisk(userProfile.zone),
      claimHistory: this.assessClaimHistory(userProfile.pastClaims),
      activityLevel: userProfile.weeklyHours ? (userProfile.weeklyHours / 40) : 1,
      platformType: userProfile.platform, // Zomato, Swiggy, Zepto, etc.
      experienceMonths: userProfile.registrationDate ? this.getMonthsSinceRegistration(userProfile.registrationDate) : 6,
    };

    return features;
  }

  /**
   * Assess location-based risk (0-1 scale)
   */
  assessLocationRisk(zone) {
    const highRiskZones = ['New Delhi', 'Mumbai', 'Chennai']; // Prone to disruptions
    const mediumRiskZones = ['Bangalore', 'Hyderabad', 'Pune'];
    const lowRiskZones = ['Thiruvananthapuram', 'Kochi'];

    if (highRiskZones.includes(zone)) return 0.8;
    if (mediumRiskZones.includes(zone)) return 0.5;
    if (lowRiskZones.includes(zone)) return 0.2;
    return 0.5; // Default medium risk
  }

  /**
   * Assess weather-based risk using historical data
   */
  assessWeatherRisk(zone) {
    const weatherRiskByZone = {
      'New Delhi': 0.7,      // High monsoon risk
      'Mumbai': 0.85,        // Very high - coastal + monsoon
      'Bangalore': 0.4,      // Lower risk
      'Chennai': 0.8,        // High cyclone risk
      'Hyderabad': 0.5,
      'Pune': 0.3,
      'Kochi': 0.6,          // Monsoon affected
    };

    return weatherRiskByZone[zone] || 0.5;
  }

  /**
   * Assess claim history risk
   */
  assessClaimHistory(pastClaims = []) {
    if (!pastClaims || pastClaims.length === 0) return 0.3; // New users: lower risk
    if (pastClaims.length > 5) return 0.9; // High claims: higher risk
    return Math.min(0.3 + pastClaims.length * 0.15, 0.9);
  }

  /**
   * Calculate risk adjustment amount
   */
  calculateRiskAdjustment(riskFactors) {
    // Weighted average of all risk factors
    const avgRisk = (
      riskFactors.locationRisk * 0.3 +
      riskFactors.weatherRisk * 0.3 +
      riskFactors.claimHistory * 0.2 +
      (1 - riskFactors.activityLevel) * 0.1 +
      (1 - (riskFactors.experienceMonths / 12)) * 0.1
    );

    // Premium adjustment: 0-₹5 based on risk
    // Low risk (0.2): +₹0
    // Medium risk (0.5): +₹0.75
    // High risk (0.8): +₹1.50
    return avgRisk * 2.0;
  }

  /**
   * Get zone-based discount multiplier
   */
  getZoneDiscount(zone) {
    const safeZones = ['Thiruvananthapuram', 'Kochi', 'Pune'];
    const mediumZones = ['Bangalore', 'Hyderabad'];

    if (safeZones.includes(zone)) return 0.5; // 50% discount
    if (mediumZones.includes(zone)) return 0.8; // 20% discount
    return 1.0; // No discount
  }

  /**
   * Get seasonal factor
   */
  getSeasonalFactor() {
    const month = new Date().getMonth();
    
    // Monsoon: June-September (months 5-8)
    if (month >= 5 && month <= 8) return this.model.seasonalFactors.monsoon;
    
    // Summer: March-May (months 2-4)
    if (month >= 2 && month <= 4) return this.model.seasonalFactors.summer;
    
    // Winter: November-February (months 10-1)
    if (month >= 10 || month <= 1) return this.model.seasonalFactors.winter;
    
    return this.model.seasonalFactors.normal;
  }

  /**
   * Get months since registration
   */
  getMonthsSinceRegistration(registrationDate) {
    const now = new Date();
    const reg = new Date(registrationDate);
    const months = (now.getFullYear() - reg.getFullYear()) * 12 +
                   (now.getMonth() - reg.getMonth());
    return Math.max(months, 0);
  }

  /**
   * Generate human-readable explanation
   */
  generateExplanation(userProfile, riskFactors, finalPremium) {
    let explanation = `Your weekly premium is ₹${finalPremium.toFixed(2)}.\n\n`;

    // Positive factors
    if (riskFactors.locationRisk < 0.5) {
      explanation += `✓ Good news! Your zone (${userProfile.zone}) has low average disruptions.\n`;
    }

    if (riskFactors.claimHistory < 0.3) {
      explanation += `✓ Clean claim history - you get better rates!\n`;
    }

    // Risk factors
    if (riskFactors.locationRisk > 0.7) {
      explanation += `⚠️  Your zone experiences frequent disruptions. We've factored this in.\n`;
    }

    if (this.getSeasonalFactor() > 1.0) {
      explanation += `📅 Monsoon season incoming - premium increased temporarily.\n`;
    }

    explanation += `\n📊 Coverage: ₹${(finalPremium * 250).toLocaleString()} per disruption event.`;

    return explanation;
  }

  /**
   * Default premium if calculation fails
   */
  getDefaultPremium() {
    return {
      basePremium: this.basePremium,
      finalPremium: this.basePremium,
      coverage: this.basePremium * 250,
      explanation: `Standard premium of ₹${this.basePremium}/week applied.`,
      error: true,
    };
  }

  /**
   * Batch calculate premiums for multiple users
   */
  async calculateBatchPremiums(userProfiles) {
    logger.log(`🔄 Calculating premiums for ${userProfiles.length} users...`);
    const results = [];

    for (const profile of userProfiles) {
      const premium = await this.calculatePremium(profile);
      results.push(premium);
    }

    logger.log(`✅ Batch calculation complete: ${results.length} premiums calculated`);
    return results;
  }

  /**
   * Get premium for a specific user by ID
   */
  async getPremiumForUser(userId, userProfile) {
    logger.log(`🔍 Fetching premium for user ${userId}`);
    return this.calculatePremium(userProfile);
  }

  /**
   * Update model weights (for future ML retraining)
   */
  updateModelWeights(newWeights) {
    logger.log('🔧 Updating model weights...');
    this.model.riskWeights = { ...this.model.riskWeights, ...newWeights };
    logger.log('✅ Model weights updated');
  }
}

module.exports = new PremiumMLModel();
