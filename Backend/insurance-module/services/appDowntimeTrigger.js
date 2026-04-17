/**
 * App Downtime Trigger Service
 * Monitors delivery platform API availability
 * Downtime > 30 minutes = triggers income loss claim (unable to access orders)
 */

const logger = require('../utils/logger');

class AppDowntimeTrigger {
  constructor() {
    this.triggerType = 'APP_DOWNTIME';
    this.thresholdMinutes = 30; // 30+ minutes = trigger claim
    this.healthCheckInterval = 5 * 60 * 1000; // Check every 5 minutes
    this.downTimeMap = new Map(); // Track downtime per platform
  }

  async checkAndTrigger() {
    try {
      logger.info('📱 Checking App Downtime Triggers...');

      const platforms = ['Zomato', 'Swiggy', 'Zepto', 'Amazon', 'Dunzo'];

      for (const platform of platforms) {
        const isHealthy = await this.checkPlatformHealth(platform);

        if (!isHealthy) {
          const downtimeData = this.recordDowntime(platform);

          if (downtimeData.duration > this.thresholdMinutes) {
            logger.info(`⚠️ PLATFORM DOWNTIME DETECTED: ${platform}, Duration: ${downtimeData.duration}m`);
            await this.triggerAutoClaim(platform, downtimeData);
          }
        } else {
          this.downTimeMap.delete(platform); // Reset if healthy
        }
      }
    } catch (error) {
      logger.error('App Downtime Trigger Error:', error.message);
    }
  }

  async checkPlatformHealth(platform) {
    try {
      // Mock health check - in production, call actual APIs
      const mockHealthStatus = {
        'Zomato': true,
        'Swiggy': true,
        'Zepto': false, // Simulate downtime
        'Amazon': true,
        'Dunzo': true,
      };

      return mockHealthStatus[platform] ?? true;
    } catch (error) {
      logger.error(`Health check error for ${platform}:`, error.message);
      return false; // Assume down on error
    }
  }

  recordDowntime(platform) {
    const now = Date.now();

    if (!this.downTimeMap.has(platform)) {
      this.downTimeMap.set(platform, { startTime: now, duration: 0 });
    }

    const downtime = this.downTimeMap.get(platform);
    downtime.duration = Math.floor((now - downtime.startTime) / (1000 * 60)); // Convert to minutes

    return downtime;
  }

  async triggerAutoClaim(platform, downtimeData) {
    try {
      logger.info(`📋 Auto-filing app downtime claim for ${platform} users`);

      // Fetch affected workers on this platform
      const affectedWorkers = await this.getWorkersOnPlatform(platform);

      for (const worker of affectedWorkers) {
        // Calculate income loss (unable to access orders during downtime)
        const ordersPerHour = 6;
        const incomePerOrder = 40;
        const lostHours = downtimeData.duration / 60;
        const lossAmount = ordersPerHour * incomePerOrder * lostHours;

        const claimData = {
          userId: worker.userId,
          triggerType: this.triggerType,
          disruptionType: 'APP_DOWNTIME',
          affectedPlatform: platform,
          downtimeDuration: downtimeData.duration,
          incomeLoss: lossAmount,
          disruptionStart: new Date(downtimeData.startTime),
          disruptionEnd: new Date(),
          description: `${platform} app downtime for ${downtimeData.duration} minutes. Unable to access orders.`,
          status: 'auto_filed',
          autoApprove: true,
        };

        logger.info(`✅ Downtime Claim Auto-Filed: ${JSON.stringify(claimData)}`);
      }
    } catch (error) {
      logger.error('App Downtime Claim Trigger Error:', error.message);
    }
  }

  async getWorkersOnPlatform(platform) {
    // Mock: Return workers on this platform
    const platformWorkers = {
      'Zomato': [{ userId: 'user1' }, { userId: 'user4' }],
      'Swiggy': [{ userId: 'user2' }, { userId: 'user5' }],
      'Zepto': [{ userId: 'user3' }, { userId: 'user6' }],
      'Amazon': [{ userId: 'user7' }],
      'Dunzo': [{ userId: 'user8' }],
    };

    return platformWorkers[platform] || [];
  }
}

module.exports = new AppDowntimeTrigger();
