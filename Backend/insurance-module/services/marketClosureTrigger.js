/**
 * Market Closure & Curfew Trigger Service
 * Monitors civic announcements, curfews, and market closures
 * Closure/Curfew announced = triggers income loss claim (unable to access market/zone)
 */

const logger = require('../utils/logger');

class MarketClosureTrigger {
  constructor() {
    this.triggerType = 'MARKET_CLOSURE';
    this.activeCures = new Map(); // Track active curfews/closures
  }

  async checkAndTrigger() {
    try {
      logger.info('🏪 Checking Market Closure & Curfew Triggers...');

      const zones = await this.getAllZones();

      for (const zone of zones) {
        const closureData = await this.checkForClosure(zone);

        if (closureData.isClosed) {
          logger.info(`⚠️ MARKET CLOSURE DETECTED: Zone ${zone.name}, Reason: ${closureData.reason}`);

          await this.triggerAutoClaim(zone, closureData);
        }
      }
    } catch (error) {
      logger.error('Market Closure Trigger Error:', error.message);
    }
  }

  async getAllZones() {
    // Mock: Return all service zones
    return [
      { name: 'New Delhi', region: 'Delhi NCR' },
      { name: 'Mumbai', region: 'Maharashtra' },
      { name: 'Bangalore', region: 'Karnataka' },
      { name: 'Pune', region: 'Maharashtra' },
      { name: 'Hyderabad', region: 'Telangana' },
    ];
  }

  async checkForClosure(zone) {
    try {
      // Mock: Simulate civic data / announcements
      // In production: Fetch from local authority APIs or news feeds
      const mockClosures = {
        'New Delhi': null, // No closure
        'Mumbai': { reason: 'MONSOON_WARNING', severity: 'HIGH' }, // Simulate monsoon closure
        'Bangalore': null,
        'Pune': { reason: 'STRIKE', severity: 'MEDIUM' },
        'Hyderabad': null,
      };

      const closure = mockClosures[zone.name];

      if (closure) {
        return {
          isClosed: true,
          zone: zone.name,
          reason: closure.reason,
          severity: closure.severity,
          timestamp: new Date(),
          expectedDuration: this.getExpectedDuration(closure.reason),
        };
      }

      return { isClosed: false };
    } catch (error) {
      logger.error('Closure Check Error:', error.message);
      return { isClosed: false };
    }
  }

  getExpectedDuration(reason) {
    const durations = {
      'MONSOON_WARNING': 8, // Hours
      'STRIKE': 6,
      'CURFEW': 12,
      'NATURAL_DISASTER': 24,
      'MARKET_CLOSURE': 4,
    };

    return durations[reason] || 6;
  }

  async triggerAutoClaim(zone, closureData) {
    try {
      logger.info(`📋 Auto-filing market closure claim for ${zone.name}`);

      // Fetch all workers in affected zone
      const affectedWorkers = await this.getWorkersInZone(zone.name);

      for (const worker of affectedWorkers) {
        // Calculate income loss (unable to work during closure)
        const dailyIncome = 500; // ₹500/day average
        const lostHours = closureData.expectedDuration;
        const lossAmount = (dailyIncome / 24) * lostHours;

        const claimData = {
          userId: worker.userId,
          triggerType: this.triggerType,
          disruptionType: 'MARKET_CLOSURE',
          affectedZone: zone.name,
          closureReason: closureData.reason,
          severity: closureData.severity,
          incomeLoss: lossAmount,
          disruptionStart: closureData.timestamp,
          disruptionEnd: new Date(
            closureData.timestamp.getTime() + closureData.expectedDuration * 60 * 60 * 1000
          ),
          description: `Market closure in ${zone.name}. Reason: ${closureData.reason}. Expected duration: ${closureData.expectedDuration} hours.`,
          status: 'auto_filed',
          autoApprove: true,
        };

        logger.info(`✅ Closure Claim Auto-Filed: ${JSON.stringify(claimData)}`);
      }

      // Track active closure
      this.activeCures.set(zone.name, closureData);
    } catch (error) {
      logger.error('Market Closure Claim Trigger Error:', error.message);
    }
  }

  async getWorkersInZone(zoneName) {
    // Mock: Return workers in this zone
    const zoneWorkers = {
      'New Delhi': [{ userId: 'user1' }],
      'Mumbai': [{ userId: 'user2' }, { userId: 'user5' }],
      'Bangalore': [{ userId: 'user3' }, { userId: 'user6' }],
      'Pune': [{ userId: 'user4' }],
      'Hyderabad': [{ userId: 'user7' }, { userId: 'user8' }],
    };

    return zoneWorkers[zoneName] || [];
  }

  clearClosure(zoneName) {
    // Clear active closure when situation resolved
    this.activeCures.delete(zoneName);
    logger.info(`✓ Market closure cleared for ${zoneName}`);
  }
}

module.exports = new MarketClosureTrigger();
