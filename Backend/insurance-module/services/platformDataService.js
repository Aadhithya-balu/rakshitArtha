const PlatformActivitySync = require('../models/PlatformActivitySync');
const User = require('../models/User');

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function normalizeNumber(value, fallback = null) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeDate(value, fallback = null) {
    if (!value) return fallback;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function getActivityStatusFromRecord(record = {}) {
    if (record.activityStatus) return String(record.activityStatus).toUpperCase();
    if (normalizeNumber(record.idleDuration, 0) > 90) return 'IDLE';
    if (normalizeNumber(record.activeOrders, 0) >= 18) return 'ACTIVE';
    if (normalizeNumber(record.activeOrders, 0) > 0) return 'PARTIALLY_ACTIVE';
    return 'UNKNOWN';
}

function getActivityFactor(record = {}) {
    const activeOrders = normalizeNumber(record.activeOrders, 0);
    const idleDuration = normalizeNumber(record.idleDuration, 0);
    const avgOrdersPerHour = normalizeNumber(record.avgOrdersPerHour, 0);
    const earnings = normalizeNumber(record.earnings, normalizeNumber(record.weeklyIncome, 0));
    const trend = normalizeNumber(record.earningsTrend, 0);
    const status = getActivityStatusFromRecord(record);

    const orderScore = clamp(activeOrders / 22, 0, 1);
    const idlePenalty = clamp(idleDuration / 180, 0, 0.45);
    const earningsScore = clamp(earnings / 9000, 0, 1);
    const orderRateScore = clamp(avgOrdersPerHour / 4, 0, 1);
    const trendScore = clamp((trend + 0.35) / 0.7, 0, 1);
    const statusBoost = status === 'ACTIVE' ? 0.12 : status === 'PARTIALLY_ACTIVE' ? 0.04 : status === 'IDLE' ? -0.18 : 0;

    return Number(clamp(
        0.28 +
        (orderScore * 0.28) +
        (earningsScore * 0.16) +
        (orderRateScore * 0.14) +
        (trendScore * 0.08) +
        statusBoost -
        idlePenalty,
        0.05,
        1
    ).toFixed(3));
}

function buildPlatformState(record = null) {
    if (!record) return null;

    const sourcePlatform = String(record.sourcePlatform || '').toUpperCase();
    const weeklyIncome = normalizeNumber(record.weeklyIncome, 0);
    const weeklyHours = normalizeNumber(record.weeklyHours, 0);
    const activeOrders = normalizeNumber(record.activeOrders, normalizeNumber(record.rideOrOrderCount, 0));
    const earnings = normalizeNumber(record.earnings, weeklyIncome);
    const idleDuration = normalizeNumber(record.idleDuration, 0);
    const avgOrdersPerHour = normalizeNumber(record.avgOrdersPerHour, weeklyHours > 0 ? activeOrders / weeklyHours : 0);
    const earningsTrend = normalizeNumber(record.earningsTrend, 0);
    const activityStatus = getActivityStatusFromRecord(record);
    const lastUpdated = normalizeDate(record.lastUpdated || record.syncTimestamp || record.updatedAt, null);

    return {
        sourcePlatform,
        platformUserId: String(record.platformUserId || '').trim(),
        userId: record.userId ? String(record.userId) : null,
        activityStatus,
        activeOrders,
        earnings,
        weeklyIncome,
        weeklyHours,
        rideOrOrderCount: normalizeNumber(record.rideOrOrderCount, activeOrders),
        idleDuration,
        avgOrdersPerHour: Number(avgOrdersPerHour.toFixed(2)),
        earningsTrend: Number(earningsTrend.toFixed(2)),
        location: record.location || null,
        syncStatus: record.syncStatus || 'SUCCESS',
        syncTimestamp: normalizeDate(record.syncTimestamp, lastUpdated),
        lastUpdated,
        authType: record.authType || 'mock',
        rawPayload: record.rawPayload || null,
        activityFactor: getActivityFactor(record),
        isFullyActive: getActivityFactor(record) >= 0.75,
        source: 'platform-sync',
    };
}

async function getLatestPlatformActivityForUser(userId, options = {}) {
    if (!userId) return null;

    const user = options.includeUser === false ? null : await User.findById(userId).lean();
    const query = { userId };
    if (options.platform) {
        query.sourcePlatform = String(options.platform).toUpperCase();
    }

    const record = await PlatformActivitySync.findOne(query).sort({ syncTimestamp: -1, createdAt: -1 }).lean();
    if (record) {
        return buildPlatformState(record);
    }

    if (!user) return null;

    return {
        sourcePlatform: String(user.platform || 'UNKNOWN').toUpperCase(),
        platformUserId: null,
        userId: String(user._id),
        activityStatus: 'UNSYNCED',
        activeOrders: 0,
        earnings: normalizeNumber(user.dailyIncome, 0),
        weeklyIncome: normalizeNumber(user.dailyIncome, 0) * 7,
        weeklyHours: normalizeNumber(user.avgDailyHours, 0) * 7,
        rideOrOrderCount: 0,
        idleDuration: null,
        avgOrdersPerHour: 0,
        earningsTrend: 0,
        location: {
            city: user.city || null,
            latitude: user.latitude ?? null,
            longitude: user.longitude ?? null,
            label: user.deliveryZone || user.location || null,
        },
        syncStatus: 'SKIPPED',
        syncTimestamp: null,
        lastUpdated: null,
        authType: 'baseline',
        rawPayload: null,
        activityFactor: 0.35,
        isFullyActive: false,
        source: 'user-baseline',
    };
}

module.exports = {
    buildPlatformState,
    getActivityFactor,
    getActivityStatusFromRecord,
    getLatestPlatformActivityForUser,
};