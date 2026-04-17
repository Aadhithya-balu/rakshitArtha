/**
 * Traffic Congestion Trigger Service
 * Monitors traffic conditions and triggers claims for severe congestion
 * Traffic Index > 0.75 = SEVERE (delivery unable to meet expected delivery times)
 */

const logger = require('../utils/logger');

class TrafficTrigger {
  constructor() {
    this.triggerType = 'SEVERE_TRAFFIC';
    this.thresholdIndex = 0.75; // 75% congestion = severe
  }

  async checkAndTrigger() {
    try {
      logger.info('🚗 Checking Traffic Congestion Triggers...');

      const activeWorkers = await this.getActiveWorkers();

      for (const worker of activeWorkers) {
        const trafficData = await this.fetchTrafficIndex(worker.location.zone);

        if (trafficData && trafficData.index > this.thresholdIndex) {
          logger.info(`⚠️ SEVERE TRAFFIC DETECTED: Zone ${worker.location.zone}, Index: ${trafficData.index}`);

          await this.triggerAutoClaim(worker, trafficData);
        }
      }
    } catch (error) {
      logger.error('Traffic Trigger Error:', error.message);
    }
  }

  async getActiveWorkers() {
    // Mock: Return sample workers
    return [
      { userId: 'user1', location: { zone: 'New Delhi', coords: { lat: 28.7041, lng: 77.1025 } }, platform: 'Zomato' },
      { userId: 'user2', location: { zone: 'Mumbai', coords: { lat: 19.0760, lng: 72.8777 } }, platform: 'Swiggy' },
      { userId: 'user3', location: { zone: 'Bangalore', coords: { lat: 12.9716, lng: 77.5946 } }, platform: 'Zepto' },
    ];
  }

  async fetchTrafficIndex(zone) {
    try {
      // Using Google Maps Traffic API or mock data
      // For hackathon: Mock data with time-based variations
      const mockTrafficData = {
        'New Delhi': this.getTimeBasedTraffic(0.82), // Usually congested
        'Mumbai': this.getTimeBasedTraffic(0.78),
        'Bangalore': this.getTimeBasedTraffic(0.64),
      };

      return {
        index: mockTrafficData[zone] || 0.5,
        zone,
        severity: mockTrafficData[zone] > 0.75 ? 'SEVERE' : mockTrafficData[zone] > 0.5 ? 'MODERATE' : 'LOW',
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error('Traffic Index Fetch Error:', error.message);
      return null;
    }
  }

  getTimeBasedTraffic(baseIndex) {
    // Simulate traffic variations throughout day
    const hour = new Date().getHours();
    if (hour >= 8 && hour <= 10) return baseIndex + 0.1; // Morning peak
    if (hour >= 18 && hour <= 20) return baseIndex + 0.15; // Evening peak
    return baseIndex;
  }

  async triggerAutoClaim(worker, trafficData) {
    try {
      logger.info(`📋 Auto-filing traffic congestion claim for ${worker.userId}`);

      // Calculate income loss (severe traffic = lost 2-3 hours of deliveries)
      const deliveriesPerHour = 8;
      const incomePerDelivery = 30; // ₹30 per delivery
      const lostHours = 3;
      const lossAmount = deliveriesPerHour * incomePerDelivery * lostHours;

      const claimData = {
        userId: worker.userId,
        triggerType: this.triggerType,
        disruptionType: 'SEVERE_TRAFFIC',
        affectedZone: trafficData.zone,
        trafficIndex: trafficData.index,
        incomeLoss: lossAmount,
        disruptionStart: new Date(),
        disruptionEnd: new Date(Date.now() + 3 * 60 * 60 * 1000), // 3 hours
        description: `Severe traffic congestion detected. Index: ${(trafficData.index * 100).toFixed(0)}% (Threshold: ${(this.thresholdIndex * 100).toFixed(0)}%)`,
        status: 'auto_filed',
        autoApprove: true,
      };

      logger.info(`✅ Traffic Claim Auto-Filed: ${JSON.stringify(claimData)}`);
      return claimData;
    } catch (error) {
      logger.error('Traffic Claim Trigger Error:', error.message);
    }
  }
}

module.exports = new TrafficTrigger();
