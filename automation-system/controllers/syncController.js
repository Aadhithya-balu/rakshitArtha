const User = require('../models/User');
const logger = require('../utils/logger');

const syncState = {
  totalRequests: 0,
  successCount: 0,
  failureCount: 0,
  lastSyncAt: null,
  lastError: null,
  lastSyncedUserId: null,
};

function verifySyncToken(req, res, next) {
  const expected = String(process.env.AUTOMATION_SYNC_TOKEN || '').trim();
  if (!expected) return next();

  const provided = String(req.headers['x-sync-token'] || '').trim();
  if (!provided || provided !== expected) {
    return res.status(401).json({
      success: false,
      message: 'Invalid sync token',
    });
  }

  return next();
}

function clamp(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function normalizePayload(body = {}) {
  const sourceUserId = String(body.userId || '').trim();
  if (!sourceUserId) {
    throw new Error('userId is required for sync');
  }

  const weeklyIncome = Math.max(0, Number(body.weeklyIncome || 0));
  const weeklyHours = clamp(body.weeklyHours, 1, 112, 40);

  const lat = clamp(body?.location?.lat, -90, 90, 0);
  const lng = clamp(body?.location?.lng, -180, 180, 0);

  return {
    sourceUserId,
    email: body.email ? String(body.email).toLowerCase() : null,
    name: String(body.name || 'Worker'),
    location: { lat, lng },
    weeklyIncome,
    weeklyHours,
    workingHours: body.workingHours ? String(body.workingHours) : null,
    workStartHour: Number.isFinite(Number(body.workStartHour)) ? Number(body.workStartHour) : null,
    workEndHour: Number.isFinite(Number(body.workEndHour)) ? Number(body.workEndHour) : null,
    isOvernightShift: Boolean(body.isOvernightShift),
    shiftType: body.shiftType ? String(body.shiftType) : 'UNKNOWN',
    isActive: Boolean(body.isActive),
    role: body.role ? String(body.role) : null,
    accountStatus: body.accountStatus ? String(body.accountStatus) : null,
    sourceUpdatedAt: body.sourceUpdatedAt ? new Date(body.sourceUpdatedAt) : new Date(),
  };
}

async function upsertOne(raw) {
  const payload = normalizePayload(raw);
  const now = new Date();

  const existing = await User.findOne({ sourceUserId: payload.sourceUserId }).lean();

  const user = await User.findOneAndUpdate(
    { sourceUserId: payload.sourceUserId },
    {
      $set: {
        name: payload.name,
        email: payload.email,
        location: payload.location,
        weeklyIncome: payload.weeklyIncome,
        weeklyHours: payload.weeklyHours,
        workingHours: payload.workingHours,
        workStartHour: payload.workStartHour,
        workEndHour: payload.workEndHour,
        isOvernightShift: payload.isOvernightShift,
        shiftType: payload.shiftType,
        isActive: payload.isActive,
        role: payload.role,
        accountStatus: payload.accountStatus,
        syncMetadata: {
          sourceUpdatedAt: payload.sourceUpdatedAt,
          lastSyncedAt: now,
        },
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
      },
    },
    {
      upsert: true,
      new: true,
      runValidators: true,
      setDefaultsOnInsert: true,
    }
  );

  syncState.totalRequests += 1;
  syncState.successCount += 1;
  syncState.lastSyncAt = new Date().toISOString();
  syncState.lastSyncedUserId = payload.sourceUserId;
  syncState.lastError = null;

  return {
    created: !existing,
    user,
  };
}

async function upsertUser(req, res) {
  try {
    const { created, user } = await upsertOne(req.body);

    logger.log(`SYNC upsert ok: sourceUserId=${user.sourceUserId}, created=${created}, active=${user.isActive}`);

    return res.status(created ? 201 : 200).json({
      success: true,
      message: created ? 'User synced (created)' : 'User synced (updated)',
      data: {
        sourceUserId: user.sourceUserId,
        automationUserId: user._id,
        isActive: user.isActive,
        weeklyIncome: user.weeklyIncome,
        weeklyHours: user.weeklyHours,
      },
    });
  } catch (error) {
    syncState.totalRequests += 1;
    syncState.failureCount += 1;
    syncState.lastError = {
      message: error.message,
      at: new Date().toISOString(),
      userId: req.body?.userId || null,
    };

    logger.log(`SYNC upsert failed: ${error.message}`);

    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

async function bulkUpsertUsers(req, res) {
  const users = Array.isArray(req.body?.users) ? req.body.users : [];
  if (!users.length) {
    return res.status(400).json({ success: false, message: 'users array is required' });
  }

  const results = {
    total: users.length,
    success: 0,
    failed: 0,
    failures: [],
  };

  for (const raw of users) {
    try {
      await upsertOne(raw);
      results.success += 1;
    } catch (error) {
      results.failed += 1;
      results.failures.push({ userId: raw?.userId || null, error: error.message });
    }
  }

  logger.log(`SYNC bulk upsert completed: success=${results.success}, failed=${results.failed}`);

  return res.status(results.failed > 0 ? 207 : 200).json({
    success: results.failed === 0,
    message: results.failed === 0 ? 'All users synced' : 'Partial sync failure',
    data: results,
  });
}

async function getSyncHealth(_req, res) {
  const [totalUsers, activeUsers] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ isActive: true }),
  ]);

  return res.json({
    success: true,
    data: {
      ...syncState,
      totalUsers,
      activeUsers,
      inactiveUsers: Math.max(totalUsers - activeUsers, 0),
    },
  });
}

module.exports = {
  verifySyncToken,
  upsertUser,
  bulkUpsertUsers,
  getSyncHealth,
};
