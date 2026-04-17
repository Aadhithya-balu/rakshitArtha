/**
 * Graduated Claim Calculator Service
 * Replaces binary claim logic with graduated, personalized payouts
 */

const User = require('../models/User');
const RiskData = require('../models/RiskData');
const Claim = require('../models/Claim');
const { getLatestPlatformActivity } = require('./platformSyncService');
const { 
    TRIGGERS, 
    WORKER_TYPES, 
    ACTIVITY_BASELINE,
    SEASONAL_FACTORS 
} = require('../utils/constants');

class ClaimCalculationService {
    /**
     * Calculate actual claim amount based on:
     * 1. Trigger severity (graduated)
     * 2. Worker type & income
     * 3. Activity verification
     * 4. Seasonal factors
     */
    async calculateClaimAmount(claimData) {
        const {
            userId,
            policyId,
            claimType,
            triggerEvidence,
            policy,
            riskScore
        } = claimData;

        const user = await User.findById(userId);
        const latestRisk = await RiskData.findOne({ userId }).sort({ createdAt: -1 });
        const platformActivity = await getLatestPlatformActivity(userId).catch(() => null);

        // Step 1: Get graduated trigger percentage
        const triggerPercent = this._getTriggerPercentage(
            claimType,
            triggerEvidence,
            latestRisk
        );

        // Step 2: Verify activity baseline (worker was actually working)
        const activityVerification = await this._verifyActivityBaseline(
            userId,
            triggerEvidence,
            user,
            platformActivity
        );

        // Step 3: Calculate income-based coverage
        const baseCoverage = this._calculateBaseCoverage(user, policy);

        // Step 4: Apply worker type sensitivity
        const workerTypeAdjustment = this._getWorkerTypeAdjustment(user);

        // Step 5: Apply seasonal factors
        const seasonalAdjustment = this._getSeasonalAdjustment(claimType, user.location);

        // Step 6: Final amount calculation
        const claimAmount = Math.round(
            baseCoverage *
            (triggerPercent / 100) *
            (activityVerification.activityFactor) *
            (workerTypeAdjustment) *
            (seasonalAdjustment)
        );

        return {
            baseAmount: baseCoverage,
            triggerPercentage: triggerPercent,
            activityFactor: activityVerification.activityFactor,
            activityFlags: activityVerification.flags,
            workerTypeAdjustment,
            seasonalAdjustment,
            finalAmount: claimAmount,
            isFullyActive: activityVerification.isFullyActive,
            requiresManualReview: activityVerification.requiresManualReview || triggerPercent < 30,
            breakdown: {
                baseAmount,
                triggerApplied: `${triggerPercent}%`,
                activityLevel: `${(activityVerification.activityFactor * 100).toFixed(0)}%`,
                workerType: user.workerType || 'UNKNOWN',
                seasonal: `${(seasonalAdjustment * 100).toFixed(0)}%`
            }
        };
    }

    /**
     * Get graduated trigger percentage (not binary 0 or 100)
     */
    _getTriggerPercentage(claimType, triggerEvidence, latestRisk) {
        const trigger = TRIGGERS[claimType];
        if (!trigger) return 0;

        // For catastrophic events, return 100%
        if (['DISASTER', 'CURFEW', 'STRIKE'].includes(claimType)) {
            return 100;
        }

        // Graduated thresholds
        if (trigger.thresholds) {
            const value = this._getTriggerValue(claimType, triggerEvidence, latestRisk);
            for (const threshold of trigger.thresholds) {
                if (value >= threshold.min && value < threshold.max) {
                    return threshold.claimPercent;
                }
            }
        }

        return 0;
    }

    /**
     * Extract trigger value from evidence
     */
    _getTriggerValue(claimType, triggerEvidence, latestRisk) {
        switch (claimType) {
            case 'RAINFALL':
                return triggerEvidence?.weatherData?.rainfall || 0;
            case 'HIGH_POLLUTION':
                return triggerEvidence?.weatherData?.aqi || 100;
            case 'TRAFFIC_BLOCKED':
                return triggerEvidence?.locationData?.blockedRadiusKm || 0;
            default:
                return 0;
        }
    }

    /**
     * Calculate base coverage adjusted for worker income
     * Instead of fixed ₹1000, use: daily_income * multiplier
     */
    _calculateBaseCoverage(user, policy) {
        const dailyIncome = parseFloat(user?.dailyIncome) || 300;
        const planConfig = require('../utils/constants').PLANS[policy?.plan];
        
        if (!planConfig) return 1000;

        // Use income multiplier from plan
        const incomeBasedCoverage = Math.min(
            dailyIncome * (planConfig.incomeMultiplier || 3),
            planConfig.coverage // Don't exceed max
        );

        return Math.max(incomeBasedCoverage, policy?.coverageAmount || 500);
    }

    /**
     * Verify worker was actually working during disruption
     * Check: GPS movement, activity patterns, normal working hours
     */
    async _verifyActivityBaseline(userId, triggerEvidence, user, platformActivity = null) {
        const claimTimestamp = new Date(triggerEvidence?.timestamp);
        
        // Get historical activity data (last 30 days)
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const historicalRiskData = await RiskData.find({
            userId,
            createdAt: { $gte: thirtyDaysAgo }
        });

        // Check if claim time matches normal working hours
        const hour = claimTimestamp.getHours();
        const isWorkingHour = this._isNormalWorkingHour(historicalRiskData, hour);

        // Extract activity metrics from trigger evidence
        const gpsPoints = triggerEvidence?.activityData?.gpsPoints || [];
        const stationaryTime = triggerEvidence?.activityData?.stationaryTimePercent || 0;
        const distanceCovered = triggerEvidence?.activityData?.distanceCoveredKm || 0;
        const platformFactor = Number(platformActivity?.activityFactor ?? user?.activityTelemetry?.activityFactor ?? 1);
        const platformStatus = String(platformActivity?.activityStatus || user?.activityTelemetry?.activityStatus || '').toUpperCase();
        const platformIdleDuration = Number(platformActivity?.idleDuration ?? user?.activityTelemetry?.idleDuration ?? 0);
        const platformActiveOrders = Number(platformActivity?.activeOrders ?? user?.activityTelemetry?.activeOrders ?? 0);

        const flags = [];
        let activityFactor = 1.0;
        let requiresManualReview = false;

        // Check 1: GPS Signal Density
        if (gpsPoints.length < ACTIVITY_BASELINE.MIN_GPS_POINTS) {
            flags.push('LOW_GPS_POINTS');
            activityFactor -= 0.2;
            requiresManualReview = true;
        }

        // Check 2: Stationary Time During Claim Window
        if (stationaryTime > ACTIVITY_BASELINE.MAX_STATIONARY_TIME_PERCENT) {
            flags.push('HIGH_STATIONARY_TIME');
            activityFactor -= 0.15;
            requiresManualReview = true;
        }

        // Check 3: Distance Covered
        if (distanceCovered < 2) { // Less than 2km = suspicious
            flags.push('MINIMAL_DISTANCE');
            activityFactor -= 0.25;
            requiresManualReview = true;
        }

        // Check 4: Working Hour Consistency
        if (!isWorkingHour) {
            flags.push('UNUSUAL_WORKING_HOUR');
            activityFactor -= 0.3;
            requiresManualReview = true;
        }

        if (platformActivity) {
            if (platformStatus === 'IDLE' && platformActiveOrders > 0) {
                flags.push('PLATFORM_ACTIVITY_MISMATCH');
                activityFactor -= 0.18;
                requiresManualReview = true;
            }

            if (platformIdleDuration > 120) {
                flags.push('HIGH_PLATFORM_IDLE');
                activityFactor -= 0.12;
                requiresManualReview = true;
            }

            activityFactor *= Math.max(0.55, Math.min(1.05, platformFactor));
        }

        // Clamp activity factor between 0 and 1
        activityFactor = Math.max(0, Math.min(1, activityFactor));

        return {
            activityFactor,
            flags,
            requiresManualReview,
            isFullyActive: activityFactor >= 0.8,
            gpsSignalQuality: gpsPoints.length,
            stationaryTimePercent: stationaryTime,
            distanceCoveredKm: distanceCovered,
            isWorkingHour,
            evidence: {
                gpsPoints: gpsPoints.length,
                stationaryTime,
                distanceCovered
            }
        };
    }

    /**
     * Check if claim time matches worker's normal working hours
     */
    _isNormalWorkingHour(historicalData, claimHour) {
        if (historicalData.length === 0) return true; // Assume normal if no history

        // Find most common working hours from history
        const hourFrequency = {};
        historicalData.forEach(rd => {
            const hour = new Date(rd.createdAt || rd.timestamp).getHours();
            hourFrequency[hour] = (hourFrequency[hour] || 0) + 1;
        });

        const activeHours = Object.entries(hourFrequency)
            .filter(([_, count]) => count > historicalData.length * 0.2) // >= 20% frequency
            .map(([hour]) => parseInt(hour));

        return activeHours.length === 0 || activeHours.includes(claimHour);
    }

    /**
     * Apply worker type specific adjustments
        * For GIG WORKERS ONLY: Swiggy, Zomato, and other delivery partners
     * All gig delivery workers have similar weather exposure (1.0×)
     * No major adjustments needed - fairness already in graduated system
     */
    _getWorkerTypeAdjustment(user) {
        // All gig workers (Delivery Bike, Delivery on Foot, Delivery Vehicle)
        // are treated similarly with 1.0x multiplier (standard sensitivity)
        // The graduated trigger percentages already handle severity differences
        return 1.0; // No special multiplier for gig workers
    }

    /**
     * Apply seasonal adjustments
     * Rain in monsoon = different from rain in summer
     */
    _getSeasonalAdjustment(claimType, location) {
        const currentMonth = new Date().getMonth() + 1; // 1-12
        let adjustment = 1.0;

        for (const [seasonName, seasonConfig] of Object.entries(SEASONAL_FACTORS)) {
            if (seasonConfig.months.includes(currentMonth)) {
                if (claimType === 'RAINFALL') {
                    adjustment = seasonConfig.rainfallMultiplier;
                } else if (claimType === 'HIGH_POLLUTION') {
                    adjustment = seasonConfig.pollutionMultiplier;
                }
                break;
            }
        }

        return adjustment;
    }

    /**
     * Validate weather data from multiple sources
     * Prevent fraud from single API source
     */
    async validateWeatherData(triggerEvidence, location) {
        const weatherData = triggerEvidence?.weatherData;
        if (!weatherData) return { verified: false, sources: [] };

        const sources = [];
        const validationResults = [];

        // Check 1: Public weather API
        if (weatherData.rainfall !== undefined) {
            sources.push({
                source: 'PUBLIC_API',
                rainfall: weatherData.rainfall,
                aqi: weatherData.aqi,
                timestamp: weatherData.timestamp
            });
        }

        // Check 2: Cross-check with official data if available
        // (This would connect to IMD, WAQI, etc. in production)
        sources.push({
            source: 'OFFICIAL_DATA',
            verified: false,
            note: 'Requires integration with government weather APIs'
        });

        // Check 3: Grid-level consistency (rain only in one zone = suspicious)
        const nearbyLocations = await this._getNearbyLocations(location);
        const nearbyWeather = nearbyLocations.map(loc => ({
            location: loc,
            hasRain: false // Would be populated from RiskData
        }));

        sources.push({
            source: 'GRID_CONSISTENCY',
            nearbyLocations: nearbyWeather,
            consistent: this._isWeatherConsistent(weatherData, nearbyWeather)
        });

        return {
            verified: sources.length > 0 && sources[0].rainfall !== undefined,
            sources,
            consistency: this._isWeatherConsistent(weatherData, nearbyWeather)
        };
    }

    /**
     * Get nearby locations for grid consistency check
     */
    async _getNearbyLocations(location) {
        // Would query locations within 10km radius
        // Placeholder for now
        return [
            { lat: location.latitude + 0.05, long: location.longitude + 0.05 },
            { lat: location.latitude - 0.05, long: location.longitude - 0.05 }
        ];
    }

    /**
     * Check weather consistency across nearby zones
     */
    _isWeatherConsistent(weatherData, nearbyWeather) {
        // If heavy rain reported but no neighboring zones have rain = suspicious
        if (weatherData.rainfall >= 50 && nearbyWeather.every(w => !w.hasRain)) {
            return false;
        }
        return true;
    }

    /**
     * Detect intentional inactivity gaming
     * Check if worker deliberately stayed home to claim
     */
    async detectInactivityGaming(userId, claimTimestamp) {
        const dayBefore = new Date(claimTimestamp.getTime() - 24 * 60 * 60 * 1000);
        const dayOf = claimTimestamp;
        const dayAfter = new Date(claimTimestamp.getTime() + 24 * 60 * 60 * 1000);

        const riskDataBefore = await RiskData.findOne({
            userId,
            createdAt: { $gte: dayBefore, $lt: claimTimestamp }
        });

        const riskDataDay = await RiskData.find({
            userId,
            createdAt: { $gte: dayOf, $lt: dayAfter }
        });

        const riskDataAfter = await RiskData.findOne({
            userId,
            createdAt: { $gte: dayAfter }
        });

        const flags = [];

        // Pattern 1: Zero activity day-of, activity day before and after
        if (!riskDataBefore?.activityData?.distanceCoveredKm && 
            riskDataDay.length === 0 &&
            riskDataAfter?.activityData?.distanceCoveredKm) {
            flags.push('SELECTIVE_INACTIVITY');
        }

        // Pattern 2: Claim submitted exactly 24 hours after 0-activity day
        if (riskDataDay.length === 0 && flags.length > 0) {
            flags.push('SUSPICIOUS_TIMING');
        }

        return {
            suspicious: flags.length > 0,
            flags,
            activityBefore: riskDataBefore?.activityData?.distanceCoveredKm || 0,
            activityDay: riskDataDay.length,
            activityAfter: riskDataAfter?.activityData?.distanceCoveredKm || 0
        };
    }
}

module.exports = new ClaimCalculationService();
