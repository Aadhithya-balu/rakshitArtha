const axios = require('axios');
const crypto = require('crypto');

const DEFAULT_TIMEOUT_MS = Number(process.env.PLATFORM_API_TIMEOUT_MS || 5000);
const DEFAULT_RETRIES = Number(process.env.PLATFORM_API_RETRIES || 3);
const DEFAULT_BACKOFF_MS = Number(process.env.PLATFORM_API_BACKOFF_MS || 350);

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function stableSeed(value) {
    const hash = crypto.createHash('sha256').update(String(value || '')).digest();
    return hash.readUInt32BE(0);
}

function toNumber(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
}

function toDate(value, fallback = new Date()) {
    if (!value) return fallback;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? fallback : date;
}

function buildMockActivity(platform, platformUserId) {
    const normalizedPlatform = String(platform || '').trim().toUpperCase();
    const seed = stableSeed(`${normalizedPlatform}:${platformUserId}`);
    const baseIncome = normalizedPlatform === 'SWIGGY' ? 7200 : normalizedPlatform === 'ZOMATO' ? 6800 : 7100;
    const baseHours = normalizedPlatform === 'SWIGGY' ? 38 : normalizedPlatform === 'ZOMATO' ? 36 : 37;
    const weeklyIncome = baseIncome + (seed % 1800);
    const weeklyHours = Math.round((baseHours + (seed % 24) / 10) * 10) / 10;
    const jobCount = 45 + (seed % 40);
    const activeOrders = Math.max(0, Math.round(jobCount / 2) + (seed % 6));
    const idleDuration = Math.round((seed % 90) + (normalizedPlatform === 'UBER' ? 20 : 10));
    const avgOrdersPerHour = Number((activeOrders / Math.max(weeklyHours, 1)).toFixed(2));
    const earningsTrend = Number((((seed % 40) - 15) / 100).toFixed(2));
    const now = new Date();
    const lastActive = new Date(now.getTime() - (seed % 8) * 60 * 60 * 1000);
    const activityStatus = idleDuration > 60 ? 'IDLE' : activeOrders >= 18 ? 'ACTIVE' : 'PARTIALLY_ACTIVE';

    return {
        success: true,
        data: {
            sourcePlatform: normalizedPlatform,
            platformUserId,
            activityStatus,
            activeOrders,
            earnings: weeklyIncome,
            weeklyIncome,
            weeklyHours,
            rideOrOrderCount: jobCount,
            idleDuration,
            avgOrdersPerHour,
            earningsTrend,
            lastActive: lastActive.toISOString(),
            syncTimestamp: now.toISOString(),
            location: {
                city: normalizedPlatform === 'SWIGGY' ? 'Bengaluru' : 'Mumbai',
                latitude: normalizedPlatform === 'SWIGGY' ? 12.9716 : 19.076,
                longitude: normalizedPlatform === 'SWIGGY' ? 77.5946 : 72.8777,
                label: normalizedPlatform === 'SWIGGY' ? 'Swiggy delivery zone' : normalizedPlatform === 'ZOMATO' ? 'Zomato delivery zone' : 'Uber partner zone',
            },
            authType: 'mock',
            source: 'mock-adapter',
        },
    };
}

function parseRetryAfter(headerValue) {
    if (!headerValue) return null;
    const seconds = Number(headerValue);
    if (Number.isFinite(seconds)) return seconds * 1000;

    const parsed = Date.parse(String(headerValue));
    if (Number.isNaN(parsed)) return null;

    const delay = parsed - Date.now();
    return delay > 0 ? delay : null;
}

async function requestWithRetry(config, options = {}) {
    const retries = Number(options.retries || DEFAULT_RETRIES);
    const backoffMs = Number(options.backoffMs || DEFAULT_BACKOFF_MS);
    const platform = String(options.platform || 'platform').toUpperCase();

    let lastError = null;

    for (let attempt = 1; attempt <= retries; attempt += 1) {
        try {
            const response = await axios.request({
                timeout: DEFAULT_TIMEOUT_MS,
                validateStatus: () => true,
                ...config,
            });

            if (response.status >= 200 && response.status < 300) {
                return response;
            }

            const retryAfter = response.status === 429
                ? parseRetryAfter(response.headers?.['retry-after'])
                : null;

            if (attempt < retries && (response.status === 429 || response.status >= 500)) {
                await sleep(retryAfter || backoffMs * attempt);
                continue;
            }

            throw new Error(`${platform} API request failed with status ${response.status}`);
        } catch (error) {
            lastError = error;

            if (attempt < retries) {
                await sleep(backoffMs * attempt);
                continue;
            }

            throw error;
        }
    }

    throw lastError || new Error(`${platform} API request failed`);
}

module.exports = {
    buildMockActivity,
    parseRetryAfter,
    requestWithRetry,
    sleep,
    stableSeed,
    toDate,
    toNumber,
};