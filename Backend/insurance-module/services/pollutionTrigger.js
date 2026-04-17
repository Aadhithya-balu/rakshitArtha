/**
 * Pollution Trigger Service
 * Monitors Air Quality Index (AQI) and triggers claims for severe pollution
 * AQI > 400 = SEVERE (workers cannot deliver outdoors)
 */

const axios = require('axios');
const logger = require('../utils/logger');

class PollutionTrigger {
  constructor() {
    this.triggerType = 'SEVERE_POLLUTION';
    this.thresholdAQI = 400; // Severe pollution threshold
  }

  async checkAndTrigger() {
    try {
      logger.info('🌫️ Checking Pollution Triggers...');

      // Fetch all active workers with their zones
      const activeWorkers = await this.getActiveWorkers();
      
      for (const worker of activeWorkers) {
        const aqiData = await this.fetchAQI(worker.location.zone);
        
        if (aqiData && aqiData.aqi > this.thresholdAQI) {
          logger.info(`⚠️ SEVERE POLLUTION DETECTED: Zone ${worker.location.zone}, AQI: ${aqiData.aqi}`);
          
          await this.triggerAutoClaim(worker, aqiData);
        }
      }
    } catch (error) {
      logger.error('Pollution Trigger Error:', error.message);
    }
  }

  async getActiveWorkers() {
    // Mock: Return sample workers (in production, fetch from DB)
    return [
      { userId: 'user1', location: { zone: 'New Delhi' }, platform: 'Zomato' },
      { userId: 'user2', location: { zone: 'Mumbai' }, platform: 'Swiggy' },
      { userId: 'user3', location: { zone: 'Bangalore' }, platform: 'Zepto' },
    ];
  }

  async fetchAQI(zone) {
    try {
      // Using AQI API (waqi.info or mockup)
      // For now, returning mock data
      const mockAQIData = {
        'New Delhi': { aqi: 450, status: 'SEVERE' },
        'Mumbai': { aqi: 320, status: 'MODERATE_HIGH' },
        'Bangalore': { aqi: 180, status: 'MODERATE' },
      };

      return {
        aqi: mockAQIData[zone]?.aqi || 100,
        status: mockAQIData[zone]?.status || 'GOOD',
        zone,
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error('AQI Fetch Error:', error.message);
      return null;
    }
  }

  async triggerAutoClaim(worker, aqiData) {
    try {
      logger.info(`📋 Auto-filing pollution claim for ${worker.userId}`);
      
      // Calculate income loss (4 hours unworkable at severe pollution)
      const hourlyIncome = 250; // Mock: ₹250/hour
      const unworkableHours = 4;
      const lossAmount = hourlyIncome * unworkableHours;

      // In production: POST to ClaimController
      const claimData = {
        userId: worker.userId,
        triggerType: this.triggerType,
        disruptionType: 'SEVERE_POLLUTION',
        affectedZone: aqiData.zone,
        aqiLevel: aqiData.aqi,
        incomeLoss: lossAmount,
        disruptionStart: new Date(),
        disruptionEnd: new Date(Date.now() + 4 * 60 * 60 * 1000), // 4 hours
        description: `Severe pollution detected. AQI: ${aqiData.aqi} (Threshold: ${this.thresholdAQI})`,
        status: 'auto_filed',
        autoApprove: true, // Parametric: auto-approve pollution
      };

      logger.info(`✅ Pollution Claim Auto-Filed: ${JSON.stringify(claimData)}`);
      
      // Mock: Save to claims collection
      return claimData;
    } catch (error) {
      logger.error('Pollution Claim Trigger Error:', error.message);
    }
  }
}

module.exports = new PollutionTrigger();
