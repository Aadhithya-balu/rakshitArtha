const RiskData = require('../models/RiskData');
const logger = require('../utils/logger');
const { TRIGGERS } = require('../utils/constants');

class TriggerService {
    /**
     * Check if triggers are met for a location
     */
    async checkTriggers(location, riskData) {
        const triggersMetId = {
            rainfall: false,
            highPollution: false,
            disaster: false,
            trafficBlocked: false
        };

        try {
            // Check rainfall trigger
            if (riskData.weatherData && riskData.weatherData.rainfall) {
                triggersMetId.rainfall = this._checkRainfallTrigger(
                    riskData.weatherData.rainfall,
                    TRIGGERS.RAINFALL.threshold
                );
            }

            // Check pollution trigger
            if (riskData.weatherData && riskData.weatherData.aqi) {
                triggersMetId.highPollution = this._checkPollutionTrigger(
                    riskData.weatherData.aqi,
                    TRIGGERS.HIGH_POLLUTION.threshold
                );
            }

            // Check disaster trigger (event-based)
            if (riskData.disasterAlert) {
                triggersMetId.disaster = true;
            }

            // Check traffic/route blockage
            if (riskData.locationData && riskData.locationData.routeBlockages) {
                triggersMetId.trafficBlocked = this._checkTrafficTrigger(
                    riskData.locationData.routeBlockages,
                    TRIGGERS.TRAFFIC_BLOCKED.threshold
                );
            }

            logger.debug('Trigger check completed', {
                location,
                triggers: triggersMetId
            });

            return triggersMetId;
        } catch (error) {
            logger.error('Trigger check error', { error: error.message });
            return triggersMetId; // Return false for all triggers on error
        }
    }

    /**
     * Check rainfall trigger
     */
    _checkRainfallTrigger(rainfall, threshold) {
        return rainfall > threshold;
    }

    /**
     * Check pollution trigger
     */
    _checkPollutionTrigger(aqi, threshold) {
        return aqi > threshold;
    }

    /**
     * Check traffic blockage trigger
     */
    _checkTrafficTrigger(blockageRadius, threshold) {
        return blockageRadius > threshold;
    }

    /**
     * Fetch latest risk data for location
     */
    async fetchLatestRiskData(userId) {
        try {
            const riskData = await RiskData.findOne({ userId })
                .sort({ createdAt: -1 });

            return riskData || null;
        } catch (error) {
            logger.error('Failed to fetch risk data', { error: error.message });
            return null;
        }
    }

    /**
     * Store risk data
     */
    async storeRiskData(riskDataPayload) {
        try {
            const riskData = await RiskData.create(riskDataPayload);
            logger.debug('Risk data stored', { userId: riskDataPayload.userId });
            return riskData;
        } catch (error) {
            logger.error('Failed to store risk data', { error: error.message });
            return null;
        }
    }

    /**
     * Get risk summary for location
     */
    async getRiskSummary(latitude, longitude) {
        try {
            // In production, integrate with weather APIs (IMD, OpenWeather)
            // For now, return mock data

            return {
                location: { latitude, longitude },
                weather: {
                    rainfall: 0,
                    aqi: 150,
                    temperature: 32,
                    humidity: 75
                },
                triggers: {
                    rainfall: false,
                    pollution: false,
                    warning: false
                },
                lastUpdated: new Date()
            };
        } catch (error) {
            logger.error('Risk summary fetch error', { error: error.message });
            return null;
        }
    }

    /**
     * Subscribe to real-time triggers
     */
    async subscribeToTriggers(userId, preferences) {
        try {
            logger.info('User subscribed to triggers', {
                userId,
                triggers: preferences.triggers
            });

            return {
                success: true,
                subscriptionId: `SUB-${userId}-${Date.now()}`
            };
        } catch (error) {
            logger.error('Trigger subscription error', { error: error.message });
            return { success: false, error: error.message };
        }
    }
}

module.exports = {
    triggerService: new TriggerService()
};