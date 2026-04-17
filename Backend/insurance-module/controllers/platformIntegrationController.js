const { asyncHandler, APIError } = require('../utils/errorHandler');
const logger = require('../utils/logger');
const {
    assertAllowedPlatform,
    buildAuthContext,
    getLatestPlatformActivity,
    getPlatformSyncSummary,
    syncAllUsersForPlatform,
    syncSingleUserFromPlatform,
    upsertWebhookSync,
} = require('../services/platformSyncService');

function getSyncInput(req) {
    return {
        userId: req.body.userId,
        email: req.body.email,
        platformUserId: req.body.platformUserId,
        authType: req.body.authType,
        apiKey: req.body.apiKey,
        accessToken: req.body.accessToken,
        triggerAutomation: req.body.triggerAutomation,
    };
}

exports.manualSync = asyncHandler(async (req, res) => {
    const platform = assertAllowedPlatform(req.params.platform);
    const input = getSyncInput(req);
    const auth = buildAuthContext(platform, input);

    if (!input.userId && !input.email && !input.platformUserId) {
        throw new APIError('Provide userId, email, or platformUserId for manual sync', 400);
    }

    const result = await syncSingleUserFromPlatform({
        platform,
        userId: input.userId,
        email: input.email,
        platformUserId: input.platformUserId,
        auth,
        triggerAutomation: input.triggerAutomation !== false,
    });

    logger.info('Manual platform sync completed', {
        platform,
        userId: result.user._id.toString(),
        changed: result.changed,
    });

    res.status(200).json({
        success: true,
        message: `${platform} sync completed`,
        data: {
            platform,
            userId: result.user._id,
            platformUserId: result.record.platformUserId,
            weeklyIncome: result.record.weeklyIncome,
            weeklyHours: result.record.weeklyHours,
            rideOrOrderCount: result.record.rideOrOrderCount,
            lastActive: result.record.lastActive,
            syncTimestamp: result.record.syncTimestamp,
            changed: result.changed,
            authType: result.record.authType,
        },
    });
});

exports.bulkSync = asyncHandler(async (req, res) => {
    const platform = assertAllowedPlatform(req.params.platform);
    const auth = buildAuthContext(platform, req.body || {});
    const result = await syncAllUsersForPlatform(platform, { auth, triggerAutomation: req.body?.triggerAutomation !== false });

    res.status(200).json({
        success: true,
        message: `${platform} bulk sync completed`,
        data: result,
    });
});

exports.handleWebhook = asyncHandler(async (req, res) => {
    const platform = assertAllowedPlatform(req.params.platform);
    const webhookSecret = String(process.env.PLATFORM_WEBHOOK_SECRET || '').trim();
    const providedSecret = String(req.headers['x-platform-webhook-secret'] || req.headers['x-webhook-secret'] || '').trim();

    if (webhookSecret && providedSecret !== webhookSecret) {
        throw new APIError('Invalid platform webhook secret', 401);
    }

    const result = await upsertWebhookSync(platform, req.body || {}, { triggerAutomation: req.body?.triggerAutomation !== false });

    res.status(200).json({
        success: true,
        message: `${platform} webhook processed`,
        data: {
            platform,
            userId: result.user._id,
            platformUserId: result.record.platformUserId,
            changed: result.changed,
            syncTimestamp: result.record.syncTimestamp,
        },
    });
});

exports.handleWebhookByBody = asyncHandler(async (req, res) => {
    const platform = assertAllowedPlatform(req.body?.platform || req.body?.sourcePlatform);
    const webhookSecret = String(process.env.PLATFORM_WEBHOOK_SECRET || '').trim();
    const providedSecret = String(req.headers['x-platform-webhook-secret'] || req.headers['x-webhook-secret'] || '').trim();

    if (webhookSecret && providedSecret !== webhookSecret) {
        throw new APIError('Invalid platform webhook secret', 401);
    }

    const result = await upsertWebhookSync(platform, req.body || {}, { triggerAutomation: req.body?.triggerAutomation !== false });

    res.status(200).json({
        success: true,
        message: `${platform} webhook processed`,
        data: {
            platform,
            userId: result.user._id,
            platformUserId: result.record.platformUserId,
            changed: result.changed,
            syncTimestamp: result.record.syncTimestamp,
        },
    });
});

exports.getUserPlatformState = asyncHandler(async (req, res) => {
    const platform = req.query.platform ? assertAllowedPlatform(req.query.platform) : null;
    const state = await getLatestPlatformActivity(req.params.userId, { platform });

    if (!state) {
        throw new APIError('No platform activity found for user', 404);
    }

    res.status(200).json({
        success: true,
        data: state,
    });
});

exports.getSummary = asyncHandler(async (req, res) => {
    const summary = await getPlatformSyncSummary();
    res.status(200).json({
        success: true,
        data: summary,
    });
});