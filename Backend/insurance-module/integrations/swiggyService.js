const { buildMockActivity, requestWithRetry, toDate, toNumber } = require('./platformClient');

const PLATFORM = 'SWIGGY';

function getConfig() {
    return {
        baseUrl: String(process.env.SWIGGY_API_BASE_URL || '').trim().replace(/\/$/, ''),
        path: String(process.env.SWIGGY_ACTIVITY_PATH || '/v1/workers/:platformUserId/activity').trim(),
        apiKey: String(process.env.SWIGGY_API_KEY || '').trim(),
        accessToken: String(process.env.SWIGGY_ACCESS_TOKEN || '').trim(),
        mode: String(process.env.SWIGGY_INTEGRATION_MODE || process.env.PLATFORM_INTEGRATION_MODE || 'mock').trim().toLowerCase(),
    };
}

function isMockMode(config = getConfig()) {
    return !config.baseUrl || ['mock', 'demo', 'test', 'local'].includes(config.mode);
}

function buildHeaders(auth = {}, config = getConfig()) {
    const headers = { Accept: 'application/json' };

    if (auth.apiKey || config.apiKey) {
        headers['x-api-key'] = auth.apiKey || config.apiKey;
    }

    if (auth.accessToken || config.accessToken) {
        headers.Authorization = `Bearer ${auth.accessToken || config.accessToken}`;
    }

    return headers;
}

function buildUrl(platformUserId, config = getConfig()) {
    const path = config.path.replace(':platformUserId', encodeURIComponent(platformUserId));
    return `${config.baseUrl}${path}`;
}

function createMockResponse(platformUserId) {
    return buildMockActivity(PLATFORM, platformUserId);
}

function normalizeActivity(rawResponse, context = {}) {
    const payload = rawResponse?.data?.data || rawResponse?.data || rawResponse || {};
    const activity = payload.activity || payload.summary || payload.worker || payload;
    const platformUserId = String(
        context.platformUserId ||
        payload.platformUserId ||
        payload.workerId ||
        payload.id ||
        activity.platformUserId ||
        activity.workerId ||
        ''
    ).trim();

    const weeklyIncome = toNumber(
        payload.weeklyIncome ?? activity.weeklyIncome ?? activity.earnings?.weekly ?? activity.earnings?.gross ?? activity.income?.weekly,
        0
    );
    const weeklyHours = toNumber(
        payload.weeklyHours ?? activity.weeklyHours ?? activity.hours?.weekly ?? activity.activeHours ?? activity.workHours,
        0
    );
    const rideOrOrderCount = Math.max(0, Math.round(toNumber(
        payload.rideOrOrderCount ?? activity.orderCount ?? activity.ordersCompleted ?? activity.jobCount ?? activity.completedTrips,
        0
    )));
    const activeOrders = Math.max(0, Math.round(toNumber(payload.activeOrders ?? activity.activeOrders ?? rideOrOrderCount, 0)));
    const idleDuration = toNumber(payload.idleDuration ?? activity.idleDuration ?? activity.idleMinutes, 0);
    const avgOrdersPerHour = toNumber(payload.avgOrdersPerHour ?? activity.avgOrdersPerHour ?? (weeklyHours > 0 ? activeOrders / weeklyHours : 0), 0);
    const earningsTrend = toNumber(payload.earningsTrend ?? activity.earningsTrend ?? activity.trend, 0);

    return {
        sourcePlatform: PLATFORM,
        platformUserId,
        weeklyIncome,
        weeklyHours,
        rideOrOrderCount,
        activeOrders,
        earnings: toNumber(payload.earnings ?? activity.earnings?.weekly ?? weeklyIncome, weeklyIncome),
        idleDuration,
        avgOrdersPerHour,
        earningsTrend,
        activityStatus: String(payload.activityStatus || activity.activityStatus || (idleDuration > 60 ? 'IDLE' : activeOrders >= 18 ? 'ACTIVE' : 'PARTIALLY_ACTIVE')).toUpperCase(),
        lastActive: toDate(payload.lastActive ?? activity.lastActive ?? activity.updatedAt ?? payload.updatedAt),
        syncTimestamp: toDate(payload.syncTimestamp ?? payload.syncedAt ?? new Date()),
        location: {
            city: payload.location?.city || activity.location?.city || null,
            latitude: toNumber(payload.location?.latitude ?? activity.location?.latitude, null),
            longitude: toNumber(payload.location?.longitude ?? activity.location?.longitude, null),
            label: payload.location?.label || activity.location?.label || 'Swiggy',
        },
        authType: context.authType || 'mock',
        rawPayload: payload,
    };
}

async function fetchWorkerActivity({ platformUserId, auth = {} } = {}) {
    if (!platformUserId) {
        throw new Error('platformUserId is required for Swiggy sync');
    }

    const config = getConfig();
    if (isMockMode(config)) {
        return createMockResponse(platformUserId);
    }

    const response = await requestWithRetry(
        {
            method: 'GET',
            url: buildUrl(platformUserId, config),
            headers: buildHeaders(auth, config),
        },
        { platform: PLATFORM }
    );

    return response;
}

async function fetchAndNormalizeActivity(params = {}) {
    const raw = await fetchWorkerActivity(params);
    return {
        raw,
        normalized: normalizeActivity(raw, params),
    };
}

module.exports = {
    PLATFORM,
    createMockResponse,
    fetchAndNormalizeActivity,
    fetchWorkerActivity,
    normalizeActivity,
};