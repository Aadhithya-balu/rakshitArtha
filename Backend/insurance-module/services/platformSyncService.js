const User = require('../models/User');
const PlatformActivitySync = require('../models/PlatformActivitySync');
const { APIError } = require('../utils/errorHandler');
const logger = require('../utils/logger');
const { syncUserToAutomation } = require('./automationUserSyncService');
const swiggyService = require('../integrations/swiggyService');
const zomatoService = require('../integrations/zomatoService');
const uberService = require('../integrations/uberService');
const { getLatestPlatformActivityForUser } = require('./platformDataService');

const PLATFORM_ADAPTERS = {
    SWIGGY: swiggyService,
    ZOMATO: zomatoService,
    UBER: uberService,
};

const ALLOWED_PLATFORMS = Object.keys(PLATFORM_ADAPTERS);

function normalizePlatform(platform) {
    return String(platform || '').trim().toUpperCase();
}

function assertAllowedPlatform(platform) {
    const normalized = normalizePlatform(platform);
    if (!ALLOWED_PLATFORMS.includes(normalized)) {
        throw new APIError('Platform must be SWIGGY, ZOMATO, or UBER', 400);
    }
    return normalized;
}

function getAdapter(platform) {
    const normalized = assertAllowedPlatform(platform);
    return PLATFORM_ADAPTERS[normalized];
}

function normalizeNumber(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
}

function derivePlatformUserId(platform, user, existingRecord, providedPlatformUserId) {
    if (providedPlatformUserId) {
        return String(providedPlatformUserId).trim();
    }

    if (existingRecord?.platformUserId) {
        return String(existingRecord.platformUserId).trim();
    }

    return `${platform.toLowerCase()}-${user._id.toString()}`;
}

function buildAuthContext(platform, body = {}) {
    const prefix = `${platform}_`;
    return {
        authType: String(body.authType || process.env[`${prefix}AUTH_TYPE`] || 'mock').trim().toLowerCase(),
        apiKey: String(body.apiKey || process.env[`${prefix}API_KEY`] || '').trim(),
        accessToken: String(body.accessToken || process.env[`${prefix}ACCESS_TOKEN`] || '').trim(),
    };
}

function isValidNormalizedPayload(payload) {
    return Boolean(
        payload &&
        payload.platformUserId &&
        Number.isFinite(Number(payload.weeklyIncome)) &&
        Number.isFinite(Number(payload.weeklyHours)) &&
        payload.weeklyIncome >= 0 &&
        payload.weeklyHours >= 0
    );
}

async function findUserForSync({ userId, email, platform, platformUserId }) {
    if (userId) {
        const user = await User.findById(userId);
        if (user) return user;
    }

    if (email) {
        const user = await User.findOne({ email: String(email).trim().toLowerCase() });
        if (user) return user;
    }

    if (platformUserId) {
        const record = await PlatformActivitySync.findOne({ sourcePlatform: platform, platformUserId });
        if (record?.userId) {
            const user = await User.findById(record.userId);
            if (user) return user;
        }
    }

    return null;
}

function computeUserUpdates(normalized) {
    const dailyIncome = Math.max(0, Math.round(normalized.weeklyIncome / 7));
    const avgDailyHours = Math.max(0, Math.round((normalized.weeklyHours / 7) * 10) / 10);

    return {
        dailyIncome,
        avgDailyHours: String(avgDailyHours),
        workingHours: `${avgDailyHours} hrs/day`,
        city: normalized.location?.city || undefined,
        deliveryZone: normalized.location?.label || undefined,
        latitude: normalized.location?.latitude ?? undefined,
        longitude: normalized.location?.longitude ?? undefined,
        activityTelemetry: {
            activeOrders: normalized.activeOrders,
            earnings: normalized.earnings,
            idleDuration: normalized.idleDuration,
            avgOrdersPerHour: normalized.avgOrdersPerHour,
            earningsTrend: normalized.earningsTrend,
            activityStatus: normalized.activityStatus,
            sourcePlatform: normalized.sourcePlatform,
            activityFactor: normalized.activityFactor,
            lastUpdated: normalized.syncTimestamp || normalized.lastUpdated || new Date(),
        },
    };
}

function recordChanged(existingRecord, normalized) {
    if (!existingRecord) return true;

    const lastActiveChanged = Boolean(existingRecord.lastActive && normalized.lastActive)
        ? existingRecord.lastActive.getTime() !== normalized.lastActive.getTime()
        : Boolean(existingRecord.lastActive !== normalized.lastActive);

    return (
        normalizeNumber(existingRecord.weeklyIncome) !== normalizeNumber(normalized.weeklyIncome) ||
        normalizeNumber(existingRecord.weeklyHours) !== normalizeNumber(normalized.weeklyHours) ||
        normalizeNumber(existingRecord.rideOrOrderCount) !== normalizeNumber(normalized.rideOrOrderCount) ||
        normalizeNumber(existingRecord.activeOrders) !== normalizeNumber(normalized.activeOrders) ||
        normalizeNumber(existingRecord.earnings) !== normalizeNumber(normalized.earnings) ||
        String(existingRecord.activityStatus || '') !== String(normalized.activityStatus || '') ||
        lastActiveChanged
    );
}

async function persistSyncRecord({ user, platform, platformUserId, normalized, raw, authType, changed, syncStatus = 'SUCCESS', errorMessage = null }) {
    const payload = {
        userId: user._id,
        sourcePlatform: platform,
        platformUserId,
        activityStatus: normalized.activityStatus,
        activeOrders: normalized.activeOrders,
        earnings: normalized.earnings,
        weeklyIncome: normalized.weeklyIncome,
        weeklyHours: normalized.weeklyHours,
        rideOrOrderCount: normalized.rideOrOrderCount,
        idleDuration: normalized.idleDuration,
        avgOrdersPerHour: normalized.avgOrdersPerHour,
        earningsTrend: normalized.earningsTrend,
        lastActive: normalized.lastActive,
        syncTimestamp: normalized.syncTimestamp || new Date(),
        lastUpdated: normalized.syncTimestamp || new Date(),
        location: normalized.location,
        authType,
        syncStatus,
        errorMessage,
        rawPayload: raw?.data || raw || null,
        lastAutomationSyncAt: changed && syncStatus === 'SUCCESS' ? new Date() : undefined,
    };

    return PlatformActivitySync.findOneAndUpdate(
        { sourcePlatform: platform, platformUserId },
        { $set: payload, $setOnInsert: { createdAt: new Date() } },
        { upsert: true, new: true, runValidators: true }
    );
}

async function syncSingleUserFromPlatform({ platform, userId, email, platformUserId, auth = {}, triggerAutomation = true } = {}) {
    const normalizedPlatform = assertAllowedPlatform(platform);
    const adapter = getAdapter(normalizedPlatform);
    const user = await findUserForSync({ userId, email, platform: normalizedPlatform, platformUserId });

    if (!user) {
        throw new APIError(`No user found for ${normalizedPlatform} sync`, 404);
    }

    const existingRecord = await PlatformActivitySync.findOne({ sourcePlatform: normalizedPlatform, platformUserId: platformUserId || `${normalizedPlatform.toLowerCase()}-${user._id.toString()}` });
    const resolvedPlatformUserId = derivePlatformUserId(normalizedPlatform, user, existingRecord, platformUserId);
    const authContext = buildAuthContext(normalizedPlatform, auth);

    const { raw, normalized } = await adapter.fetchAndNormalizeActivity({
        platformUserId: resolvedPlatformUserId,
        auth: authContext,
        authType: authContext.authType,
    });

    if (!isValidNormalizedPayload(normalized)) {
        await persistSyncRecord({
            user,
            platform: normalizedPlatform,
            platformUserId: resolvedPlatformUserId,
            normalized: normalized || {},
            raw,
            authType: authContext.authType,
            changed: false,
            syncStatus: 'SKIPPED',
            errorMessage: 'Invalid platform payload received',
        });

        throw new APIError(`Invalid ${normalizedPlatform} payload received`, 422);
    }

    const changed = recordChanged(existingRecord, normalized);
    const updateFields = computeUserUpdates(normalized);

    if (changed) {
        user.dailyIncome = updateFields.dailyIncome;
        user.avgDailyHours = updateFields.avgDailyHours;
        user.workingHours = updateFields.workingHours;
        if (updateFields.city) user.city = updateFields.city;
        if (updateFields.deliveryZone) user.deliveryZone = updateFields.deliveryZone;
        if (Number.isFinite(updateFields.latitude)) user.latitude = updateFields.latitude;
        if (Number.isFinite(updateFields.longitude)) user.longitude = updateFields.longitude;
        user.activityTelemetry = updateFields.activityTelemetry;
        user.updatedAt = new Date();
        await user.save();
    }

    const syncRecord = await persistSyncRecord({
        user,
        platform: normalizedPlatform,
        platformUserId: resolvedPlatformUserId,
        normalized,
        raw,
        authType: authContext.authType,
        changed,
        syncStatus: 'SUCCESS',
    });

    if (changed && triggerAutomation) {
        try {
            await syncUserToAutomation(user, { reason: `platform-sync:${normalizedPlatform.toLowerCase()}` });
            syncRecord.lastAutomationSyncAt = new Date();
            await syncRecord.save();
        } catch (automationError) {
            logger.warn('Platform sync completed but automation sync failed', {
                platform: normalizedPlatform,
                userId: user._id.toString(),
                error: automationError.message,
            });
        }
    }

    return {
        user,
        record: syncRecord,
        normalized,
        changed,
    };
}

async function syncAllUsersForPlatform(platform, options = {}) {
    const normalizedPlatform = assertAllowedPlatform(platform);
    const users = await User.find({ platform: normalizedPlatform, role: 'WORKER' }).sort({ _id: 1 });

    const results = [];
    for (const user of users) {
        try {
            const result = await syncSingleUserFromPlatform({
                platform: normalizedPlatform,
                userId: user._id,
                auth: options.auth || {},
                triggerAutomation: options.triggerAutomation !== false,
            });
            results.push({ userId: user._id.toString(), success: true, changed: result.changed });
        } catch (error) {
            logger.warn('Platform sync skipped user', {
                platform: normalizedPlatform,
                userId: user._id.toString(),
                error: error.message,
            });
            results.push({ userId: user._id.toString(), success: false, error: error.message });
        }
    }

    return {
        platform: normalizedPlatform,
        processed: results.length,
        successCount: results.filter((item) => item.success).length,
        failureCount: results.filter((item) => !item.success).length,
        results,
    };
}

async function upsertWebhookSync(platform, payload = {}, options = {}) {
    const normalizedPlatform = assertAllowedPlatform(platform);
    const user = await findUserForSync({
        userId: payload.userId,
        email: payload.email,
        platform: normalizedPlatform,
        platformUserId: payload.platformUserId,
    });

    if (!user) {
        throw new APIError(`No user found for ${normalizedPlatform} webhook sync`, 404);
    }

    const normalized = {
        sourcePlatform: normalizedPlatform,
        platformUserId: String(payload.platformUserId || `${normalizedPlatform.toLowerCase()}-${user._id.toString()}`).trim(),
        activityStatus: String(payload.activityStatus || 'UNKNOWN').toUpperCase(),
        activeOrders: normalizeNumber(payload.activeOrders, normalizeNumber(payload.rideOrOrderCount, 0)),
        earnings: normalizeNumber(payload.earnings, normalizeNumber(payload.weeklyIncome, 0)),
        weeklyIncome: normalizeNumber(payload.weeklyIncome, 0),
        weeklyHours: normalizeNumber(payload.weeklyHours, 0),
        rideOrOrderCount: normalizeNumber(payload.rideOrOrderCount, 0),
        idleDuration: normalizeNumber(payload.idleDuration, null),
        avgOrdersPerHour: normalizeNumber(payload.avgOrdersPerHour, null),
        earningsTrend: normalizeNumber(payload.earningsTrend, null),
        lastActive: payload.lastActive ? new Date(payload.lastActive) : new Date(),
        syncTimestamp: payload.syncTimestamp ? new Date(payload.syncTimestamp) : new Date(),
        location: payload.location || {},
        authType: payload.authType || 'webhook',
        rawPayload: payload,
    };

    if (!isValidNormalizedPayload(normalized)) {
        throw new APIError(`Invalid ${normalizedPlatform} webhook payload`, 422);
    }

    const existingRecord = await PlatformActivitySync.findOne({ sourcePlatform: normalizedPlatform, platformUserId: normalized.platformUserId });
    const changed = recordChanged(existingRecord, normalized);

    if (changed) {
        const updateFields = computeUserUpdates(normalized);
        user.dailyIncome = updateFields.dailyIncome;
        user.avgDailyHours = updateFields.avgDailyHours;
        user.workingHours = updateFields.workingHours;
        if (updateFields.city) user.city = updateFields.city;
        if (updateFields.deliveryZone) user.deliveryZone = updateFields.deliveryZone;
        if (Number.isFinite(updateFields.latitude)) user.latitude = updateFields.latitude;
        if (Number.isFinite(updateFields.longitude)) user.longitude = updateFields.longitude;
        user.activityTelemetry = updateFields.activityTelemetry;
        user.updatedAt = new Date();
        await user.save();
    }

    const record = await persistSyncRecord({
        user,
        platform: normalizedPlatform,
        platformUserId: normalized.platformUserId,
        normalized,
        raw: payload,
        authType: normalized.authType,
        changed,
        syncStatus: 'SUCCESS',
    });

    if (changed && options.triggerAutomation !== false) {
        try {
            await syncUserToAutomation(user, { reason: `platform-webhook:${normalizedPlatform.toLowerCase()}` });
            record.lastAutomationSyncAt = new Date();
            await record.save();
        } catch (automationError) {
            logger.warn('Webhook sync completed but automation sync failed', {
                platform: normalizedPlatform,
                userId: user._id.toString(),
                error: automationError.message,
            });
        }
    }

    return { user, record, changed, normalized };
}

async function getPlatformSyncSummary() {
    const [totalSyncs, successfulSyncs, failedSyncs] = await Promise.all([
        PlatformActivitySync.countDocuments(),
        PlatformActivitySync.countDocuments({ syncStatus: 'SUCCESS' }),
        PlatformActivitySync.countDocuments({ syncStatus: 'FAILED' }),
    ]);

    const recentRecords = await PlatformActivitySync.find()
        .sort({ syncTimestamp: -1 })
        .limit(10)
        .select('sourcePlatform platformUserId activityStatus activeOrders earnings weeklyIncome weeklyHours lastActive syncTimestamp syncStatus lastAutomationSyncAt');

    return {
        totalSyncs,
        successfulSyncs,
        failedSyncs,
        supportedPlatforms: ALLOWED_PLATFORMS,
        recentRecords,
    };
}

async function getLatestPlatformActivity(userId, options = {}) {
    const state = await getLatestPlatformActivityForUser(userId, options);
    return state || null;
}

module.exports = {
    ALLOWED_PLATFORMS,
    assertAllowedPlatform,
    buildAuthContext,
    getAdapter,
    getPlatformSyncSummary,
    getLatestPlatformActivity,
    normalizePlatform,
    syncAllUsersForPlatform,
    syncSingleUserFromPlatform,
    upsertWebhookSync,
};