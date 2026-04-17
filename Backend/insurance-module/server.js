const loadEnv = require('./config/loadEnv');
loadEnv();
const app = require('./app');
const connectDB = require('./config/db');
const { ensureDefaultInsurerAdminAccount } = require('./controllers/authController');
const { syncAllUsersToAutomation } = require('./services/automationUserSyncService');
const { startPlatformSyncScheduler } = require('./services/platformSyncScheduler');
const logger = require('./utils/logger');

const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';

let server;

const bootstrap = async () => {
    await connectDB();
    await ensureDefaultInsurerAdminAccount();
    startPlatformSyncScheduler();

    server = app.listen(PORT, () => {
        logger.info(`🚀 Server running in ${NODE_ENV} mode on port ${PORT}`);
        logger.info(`📍 API Documentation: http://localhost:${PORT}/api/docs`);
        logger.info(`❤️ Health Check: http://localhost:${PORT}/health`);

        // Non-blocking bootstrap backfill so historical users become automation-eligible.
        syncAllUsersToAutomation({ batchSize: 200 })
            .catch((err) => logger.warn('Automation user bootstrap backfill failed', { error: err.message }));
    });
};

bootstrap().catch((err) => {
    logger.error('Fatal bootstrap error:', err);
    process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
    logger.error('Unhandled Rejection:', err);
    if (server) {
        server.close(() => process.exit(1));
        return;
    }
    process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception:', err);
    process.exit(1);
});
