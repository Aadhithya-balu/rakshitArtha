const axios = require('axios');
const User = require('../models/User');
const logger = require('../utils/logger');
const { parseWorkingHours, getShiftDurationHours, getShiftType } = require('../utils/timeParser');

const AUTOMATION_BASE_URL = String(process.env.AUTOMATION_API_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const SYNC_ENDPOINT = `${AUTOMATION_BASE_URL}/api/v1/sync/users/upsert`;
const SYNC_TOKEN = String(process.env.AUTOMATION_SYNC_TOKEN || '').trim();

const MAX_RETRY_ATTEMPTS = 3;
const RETRY_WORKER_INTERVAL_MS = Number(process.env.AUTOMATION_SYNC_RETRY_INTERVAL_MS || 30000);
const RETRY_BATCH_SIZE = Number(process.env.AUTOMATION_SYNC_RETRY_BATCH_SIZE || 25);

const syncState = {
    totalAttempts: 0,
    successCount: 0,
    failureCount: 0,
    queuedRetries: 0,
    lastError: null,
    lastSyncedUserId: null,
    lastSyncedAt: null,
};

const retryQueue = new Map();
let retryWorkerStarted = false;

function clampNumber(value, min, max, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.min(max, Math.max(min, numeric));
}

function parseAvgDailyHours(raw) {
    if (raw === null || raw === undefined) return null;
    const direct = Number(raw);
    if (Number.isFinite(direct)) return direct;

    const match = String(raw).match(/(\d+(?:\.\d+)?)/);
    return match ? Number(match[1]) : null;
}

function toWeeklyIncome(user) {
    const dailyIncome = Number(user?.dailyIncome || 0);
    if (Number.isFinite(dailyIncome) && dailyIncome > 0) {
        return Math.round(dailyIncome * 7);
    }
    return 0;
}

function toWeeklyHours(user) {
    const avgDailyHours = parseAvgDailyHours(user?.avgDailyHours);
    if (Number.isFinite(avgDailyHours) && avgDailyHours > 0) {
        return Math.round(avgDailyHours * 7 * 10) / 10;
    }

    const parsedShift = parseWorkingHours(user?.workingHours);
    const shiftHours = getShiftDurationHours(parsedShift);
    if (Number.isFinite(shiftHours) && shiftHours > 0) {
        return Math.round(shiftHours * 7 * 10) / 10;
    }

    return 40;
}

function toGeo(user) {
    const lat = clampNumber(user?.latitude, -90, 90, 0);
    const lng = clampNumber(user?.longitude, -180, 180, 0);
    return { lat, lng };
}

function toIsActive(user) {
    const isWorker = String(user?.role || 'WORKER').toUpperCase() === 'WORKER';
    const accountStatus = String(user?.accountStatus || '').toUpperCase();
    const blockedStates = new Set(['SUSPENDED', 'BLOCKED', 'DEACTIVATED']);
    return Boolean(isWorker && !blockedStates.has(accountStatus));
}

function buildPayload(user) {
    const weeklyIncome = toWeeklyIncome(user);
    const weeklyHours = toWeeklyHours(user);
    const parsedShift = parseWorkingHours(user?.workingHours);

    return {
        userId: String(user._id),
        email: String(user.email || '').toLowerCase(),
        name: String(user.name || 'Worker'),
        location: toGeo(user),
        weeklyIncome,
        weeklyHours,
        workingHours: user?.workingHours || null,
        workStartHour: parsedShift?.startHour ?? user?.workStartHour ?? null,
        workEndHour: parsedShift?.endHour ?? user?.workEndHour ?? null,
        isOvernightShift: parsedShift?.isOvernight ?? Boolean(user?.isOvernightShift),
        shiftType: getShiftType(parsedShift),
        isActive: toIsActive(user),
        sourceUpdatedAt: user.updatedAt || user.createdAt || new Date(),
        role: user.role,
        accountStatus: user.accountStatus,
    };
}

function getHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (SYNC_TOKEN) headers['x-sync-token'] = SYNC_TOKEN;
    return headers;
}

function queueRetry(payload, reason) {
    const existing = retryQueue.get(payload.userId);
    retryQueue.set(payload.userId, {
        payload,
        attempts: existing?.attempts || 0,
        reason,
        queuedAt: existing?.queuedAt || new Date(),
        lastAttemptAt: existing?.lastAttemptAt || null,
    });
    syncState.queuedRetries = retryQueue.size;
}

async function sendUpsert(payload, reason = 'unknown', allowThrow = false) {
    syncState.totalAttempts += 1;

    try {
        const response = await axios.post(
            SYNC_ENDPOINT,
            payload,
            {
                headers: getHeaders(),
                timeout: 5000,
                validateStatus: (status) => status >= 200 && status < 500,
            }
        );

        if (response.status >= 400 || response.data?.success === false) {
            throw new Error(response.data?.message || `Automation sync failed with status ${response.status}`);
        }

        syncState.successCount += 1;
        syncState.lastSyncedUserId = payload.userId;
        syncState.lastSyncedAt = new Date().toISOString();
        syncState.lastError = null;
        return { success: true, data: response.data };
    } catch (error) {
        syncState.failureCount += 1;
        syncState.lastError = {
            reason,
            message: error.message,
            at: new Date().toISOString(),
            userId: payload.userId,
        };

        logger.warn('Automation user sync failed', {
            userId: payload.userId,
            reason,
            error: error.message,
        });

        if (allowThrow) throw error;
        return { success: false, error: error.message };
    }
}

function ensureRetryWorker() {
    if (retryWorkerStarted) return;
    retryWorkerStarted = true;

    setInterval(async () => {
        if (retryQueue.size === 0) return;

        const entries = Array.from(retryQueue.values()).slice(0, RETRY_BATCH_SIZE);
        for (const entry of entries) {
            if (entry.attempts >= MAX_RETRY_ATTEMPTS) {
                retryQueue.delete(entry.payload.userId);
                continue;
            }

            entry.attempts += 1;
            entry.lastAttemptAt = new Date();

            const result = await sendUpsert(entry.payload, `retry:${entry.reason}`, false);
            if (result.success) {
                retryQueue.delete(entry.payload.userId);
            } else {
                retryQueue.set(entry.payload.userId, entry);
            }
        }

        syncState.queuedRetries = retryQueue.size;
    }, RETRY_WORKER_INTERVAL_MS);
}

async function syncUserToAutomation(user, options = {}) {
    if (!user?._id) {
        return { success: false, error: 'Invalid user payload for sync' };
    }

    ensureRetryWorker();

    const reason = options.reason || 'user-update';
    const payload = buildPayload(user);

    for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt += 1) {
        const result = await sendUpsert(payload, `${reason}:attempt-${attempt}`, false);
        if (result.success) return result;

        if (attempt < MAX_RETRY_ATTEMPTS) {
            await new Promise((resolve) => setTimeout(resolve, attempt * 300));
        }
    }

    queueRetry(payload, reason);
    return { success: false, queued: true };
}

async function syncAllUsersToAutomation(options = {}) {
    ensureRetryWorker();

    const batchSize = Number(options.batchSize || 200);
    let lastId = null;
    let synced = 0;
    let failed = 0;

    // Backfill all users so existing production data is not missed.
    // Keep this incremental to avoid memory spikes with large datasets.
    while (true) {
        const filter = lastId ? { _id: { $gt: lastId } } : {};
        const users = await User.find(filter).sort({ _id: 1 }).limit(batchSize);
        if (!users.length) break;

        for (const user of users) {
            const result = await syncUserToAutomation(user, { reason: 'bootstrap-backfill' });
            if (result.success) synced += 1;
            else failed += 1;
        }

        lastId = users[users.length - 1]._id;
    }

    logger.info('Automation user backfill completed', { synced, failed, queuedRetries: retryQueue.size });
    return { synced, failed, queuedRetries: retryQueue.size };
}

function getAutomationSyncHealth() {
    return {
        ...syncState,
        automationBaseUrl: AUTOMATION_BASE_URL,
        endpoint: SYNC_ENDPOINT,
        retryWorkerStarted,
        queuedUserIds: Array.from(retryQueue.keys()).slice(0, 20),
    };
}

module.exports = {
    syncUserToAutomation,
    syncAllUsersToAutomation,
    getAutomationSyncHealth,
    buildAutomationSyncPayload: buildPayload,
};
