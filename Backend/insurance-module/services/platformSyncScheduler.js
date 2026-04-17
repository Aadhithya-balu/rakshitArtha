const cron = require('node-cron');
const logger = require('../utils/logger');
const { syncAllUsersForPlatform } = require('./platformSyncService');

let scheduler = null;

function startPlatformSyncScheduler() {
    if (scheduler) {
        return scheduler;
    }

    scheduler = cron.schedule('0 */6 * * *', async () => {
        try {
            const swiggy = await syncAllUsersForPlatform('SWIGGY');
            const zomato = await syncAllUsersForPlatform('ZOMATO');
            const uber = await syncAllUsersForPlatform('UBER');
            logger.info('Platform sync cron completed', { swiggy, zomato, uber });
        } catch (error) {
            logger.error('Platform sync cron failed', { error: error.message });
        }
    }, {
        scheduled: true,
        timezone: process.env.PLATFORM_SYNC_TIMEZONE || 'UTC',
    });

    logger.info('Platform sync scheduler started', {
        cron: '0 */6 * * *',
        timezone: process.env.PLATFORM_SYNC_TIMEZONE || 'UTC',
    });

    return scheduler;
}

function stopPlatformSyncScheduler() {
    if (!scheduler) return;
    scheduler.stop();
    scheduler = null;
}

module.exports = {
    startPlatformSyncScheduler,
    stopPlatformSyncScheduler,
};