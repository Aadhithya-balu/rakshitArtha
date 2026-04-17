const User = require('../models/User');
const { asyncHandler, APIError } = require('../utils/errorHandler');
const logger = require('../utils/logger');
const { USER_STATUS, RESPONSE_CODES, ERRORS } = require('../utils/constants');
const { syncUserToAutomation, getAutomationSyncHealth } = require('../services/automationUserSyncService');
const { parseWorkingHours } = require('../utils/timeParser');

const ACTIVITY_STATE_LIMIT = 200;

function buildShiftFields(workingHours) {
    const parsed = parseWorkingHours(workingHours);
    if (!parsed) {
        return {
            workStartHour: null,
            workEndHour: null,
            isOvernightShift: false,
        };
    }

    return {
        workStartHour: parsed.startHour,
        workEndHour: parsed.endHour,
        isOvernightShift: parsed.isOvernight,
    };
}

function getDefaultInsurerAdminConfig() {
    const email = String(process.env.INSURER_ADMIN_EMAIL || 'insurer.admin@rakshitartha.in').trim().toLowerCase();
    const name = String(process.env.INSURER_ADMIN_NAME || 'RakshitArtha Insurer Admin').trim();
    const phone = String(process.env.INSURER_ADMIN_PHONE || '9000000000').replace(/\D/g, '').slice(-10) || '9000000000';

    return {
        email,
        name,
        phone,
        location: String(process.env.INSURER_ADMIN_LOCATION || 'Insurer HQ').trim(),
        city: String(process.env.INSURER_ADMIN_CITY || 'Bengaluru').trim(),
        deliveryZone: String(process.env.INSURER_ADMIN_DELIVERY_ZONE || 'Central').trim(),
        zoneType: String(process.env.INSURER_ADMIN_ZONE_TYPE || 'Urban').trim(),
    };
}

async function upsertInsurerAdminAccount(config = {}) {
    const defaults = getDefaultInsurerAdminConfig();
    const admin = {
        email: String(config.email || defaults.email).trim().toLowerCase(),
        name: String(config.name || defaults.name).trim(),
        phone: String(config.phone || defaults.phone).replace(/\D/g, '').slice(-10) || defaults.phone,
        location: String(config.location || defaults.location).trim(),
        city: String(config.city || defaults.city).trim(),
        deliveryZone: String(config.deliveryZone || defaults.deliveryZone).trim(),
        zoneType: String(config.zoneType || defaults.zoneType).trim(),
    };

    const existing = await User.findOne({ email: admin.email });
    const now = new Date();

    const user = await User.findOneAndUpdate(
        { email: admin.email },
        {
            $set: {
                name: admin.name,
                phone: admin.phone,
                location: admin.location,
                platform: 'OTHER',
                workerType: 'EMPLOYEE',
                role: 'INSURER_ADMIN',
                city: admin.city,
                deliveryZone: admin.deliveryZone,
                zoneType: admin.zoneType,
                accountStatus: USER_STATUS.ACTIVE,
                kyc: {
                    verified: true,
                    verifiedAt: now,
                    documentType: 'ADMIN_PROVISIONED',
                    documentIdMasked: 'XXXXADMIN'
                },
                updatedAt: now
            },
            $setOnInsert: {
                email: admin.email,
                createdAt: now
            }
        },
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );

    return { user, created: !existing };
}

exports.ensureDefaultInsurerAdminAccount = async () => {
    const { user, created } = await upsertInsurerAdminAccount();
    logger.info(created ? 'Default insurer admin account created' : 'Default insurer admin account verified', {
        userId: user._id,
        email: user.email
    });

    syncUserToAutomation(user, { reason: 'ensure-default-admin' })
        .catch((err) => logger.warn('Failed to sync default insurer admin to automation', { error: err.message, userId: user._id }));

    return user;
};

function normalizeActivityStatePayload(body = {}) {
    const state = String(body.state || '').trim().toUpperCase();
    const recordedAt = body.recordedAt ? new Date(body.recordedAt) : new Date();
    return {
        state,
        recordedAt: Number.isNaN(recordedAt.getTime()) ? new Date() : recordedAt,
        source: String(body.source || 'foreground-service').trim().slice(0, 80),
        accelerometerVariance: Number.isFinite(Number(body.accelerometerVariance)) ? Number(body.accelerometerVariance) : null,
        idleRatio: Number.isFinite(Number(body.idleRatio)) ? Number(body.idleRatio) : null,
        motionConsistencyScore: Number.isFinite(Number(body.motionConsistencyScore)) ? Number(body.motionConsistencyScore) : null,
        sampleCount: Number.isFinite(Number(body.sampleCount)) ? Number(body.sampleCount) : 0,
        deviceMotionAvailable: Boolean(body.deviceMotionAvailable)
    };
}

// Register User
exports.register = asyncHandler(async (req, res) => {
    const {
        name,
        email,
        phone,
        location,
        platform,
        latitude,
        longitude,
        workerType,
        dailyIncome,
        workingHours,
        workingDays,
        avgDailyHours,
        activityConsent,
        weatherCrossCheckConsent,
        activityTelemetry
    } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
        logger.warn('Duplicate email registration attempt', { email });
        throw new APIError(ERRORS.DUPLICATE_EMAIL, RESPONSE_CODES.CONFLICT);
    }

    const shiftFields = buildShiftFields(workingHours);

    const user = await User.create({
        name,
        email,
        phone,
        location,
        platform,
        latitude,
        longitude,
        workerType: workerType || 'GIG',
        workingHours,
        ...shiftFields,
        workingDays,
        avgDailyHours,
        dailyIncome: typeof dailyIncome === 'number' ? dailyIncome : undefined,
        activityConsent: Boolean(activityConsent),
        weatherCrossCheckConsent: weatherCrossCheckConsent !== false,
        activityTelemetry: activityTelemetry && typeof activityTelemetry === 'object'
            ? {
                accelerometerVariance: activityTelemetry.accelerometerVariance,
                idleRatio: activityTelemetry.idleRatio,
                foregroundAppMinutes: activityTelemetry.foregroundAppMinutes,
                motionConsistencyScore: activityTelemetry.motionConsistencyScore,
                sampleCount: activityTelemetry.sampleCount,
                collectedAt: activityTelemetry.collectedAt || new Date(),
                deviceMotionAvailable: Boolean(activityTelemetry.deviceMotionAvailable)
            }
            : undefined,
        accountStatus: USER_STATUS.VERIFICATION_PENDING,
        kyc: {
            verified: false
        }
    });

    logger.info('User registered successfully', { userId: user._id, email });

    syncUserToAutomation(user, { reason: 'register' })
        .catch((err) => logger.warn('Failed to sync newly registered user to automation', { error: err.message, userId: user._id }));

    res.status(RESPONSE_CODES.CREATED).json({
        success: true,
        message: 'User registered successfully. Verification pending.',
        data: {
            userId: user._id,
            email: user.email,
            status: user.accountStatus
        }
    });
});

// Get User Profile
exports.getUserProfile = asyncHandler(async (req, res) => {
    const { userId } = req.params;

    const user = await User.findById(userId).select('-kyc.documentType');
    if (!user) {
        throw new APIError(ERRORS.USER_NOT_FOUND, RESPONSE_CODES.NOT_FOUND);
    }

    logger.debug('User profile retrieved', { userId });

    res.status(RESPONSE_CODES.SUCCESS).json({
        success: true,
        data: user
    });
});

// Insurer admin login (no signup path)
exports.adminLogin = asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!normalizedEmail || !password) {
        throw new APIError('Email and password are required', RESPONSE_CODES.BAD_REQUEST);
    }

    const adminPassword = String(process.env.INSURER_ADMIN_PASSWORD || '').trim();
    if (!adminPassword) {
        throw new APIError('Insurer admin password is not configured', RESPONSE_CODES.SERVICE_UNAVAILABLE);
    }

    const configuredAdminEmail = String(process.env.INSURER_ADMIN_EMAIL || 'insurer.admin@rakshitartha.in').trim().toLowerCase();
    const configuredAdminName = String(process.env.INSURER_ADMIN_NAME || 'RakshitArtha Insurer Admin').trim();

    let user = await User.findOne({ email: normalizedEmail });

    // Allow a default backend-managed insurer admin account for quick setup.
    if (!user && normalizedEmail === configuredAdminEmail) {
        const provisioned = await upsertInsurerAdminAccount({
            email: configuredAdminEmail,
            name: configuredAdminName,
        });
        user = provisioned.user;
        logger.info('Default insurer admin auto-provisioned during login', { email: configuredAdminEmail, userId: user._id });
    }

    if (!user || user.role !== 'INSURER_ADMIN') {
        throw new APIError('Insurer admin account not found', RESPONSE_CODES.UNAUTHORIZED);
    }

    if (String(password) !== adminPassword) {
        throw new APIError('Invalid admin credentials', RESPONSE_CODES.UNAUTHORIZED);
    }

    const now = new Date();
    const previousLoginCount = Number(user.insurerLoginDetails?.loginCount || 0);

    user.accountStatus = USER_STATUS.ACTIVE;
    user.insurerLoginDetails = {
        lastLoginAt: now,
        lastLoginIp: String(req.ip || ''),
        lastLoginUserAgent: String(req.headers['user-agent'] || '').slice(0, 300),
        loginCount: previousLoginCount + 1
    };
    user.updatedAt = now;
    await user.save();

    res.status(RESPONSE_CODES.SUCCESS).json({
        success: true,
        message: 'Insurer admin login successful',
        data: {
            userId: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            accountStatus: user.accountStatus,
            loginDetails: user.insurerLoginDetails
        }
    });
});

// Provision insurer admin account (protected by bootstrap secret)
exports.createInsurerAdmin = asyncHandler(async (req, res) => {
    const providedSecret = String(req.headers['x-admin-secret'] || req.body?.bootstrapSecret || '').trim();
    const expectedSecret = String(process.env.INSURER_ADMIN_BOOTSTRAP_SECRET || '').trim();

    if (!expectedSecret) {
        throw new APIError('INSURER_ADMIN_BOOTSTRAP_SECRET is not configured', RESPONSE_CODES.SERVICE_UNAVAILABLE);
    }

    if (!providedSecret || providedSecret !== expectedSecret) {
        throw new APIError('Invalid bootstrap secret', RESPONSE_CODES.UNAUTHORIZED);
    }

    const {
        name,
        email,
        phone,
        location = 'Insurer HQ',
        city = 'Bengaluru',
        deliveryZone = 'Central',
        zoneType = 'Urban'
    } = req.body;

    const normalizedEmail = String(email || '').trim().toLowerCase();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
        throw new APIError('Email already registered', RESPONSE_CODES.CONFLICT);
    }

    const { user } = await upsertInsurerAdminAccount({
        name,
        email: normalizedEmail,
        phone,
        location,
        city,
        deliveryZone,
        zoneType,
    });

    logger.info('Insurer admin provisioned', { userId: user._id, email: user.email });

    res.status(RESPONSE_CODES.CREATED).json({
        success: true,
        message: 'Insurer admin created successfully',
        data: {
            userId: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            accountStatus: user.accountStatus
        }
    });
});

// Get User Profile by Email
exports.getUserProfileByEmail = asyncHandler(async (req, res) => {
    const email = decodeURIComponent(req.params.email).toLowerCase();

    const user = await User.findOne({ email }).select('-kyc.documentType');
    if (!user) {
        throw new APIError(ERRORS.USER_NOT_FOUND, RESPONSE_CODES.NOT_FOUND);
    }

    logger.debug('User profile retrieved by email', { email, userId: user._id });

    res.status(RESPONSE_CODES.SUCCESS).json({
        success: true,
        data: user
    });
});

// Record Activity State History
exports.recordActivityState = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const payload = normalizeActivityStatePayload(req.body);

    if (!payload.state || !['MOVING', 'IDLE', 'WALKING'].includes(payload.state)) {
        throw new APIError('State must be one of: MOVING, IDLE, WALKING', RESPONSE_CODES.BAD_REQUEST);
    }

    const user = await User.findById(userId);
    if (!user) {
        throw new APIError(ERRORS.USER_NOT_FOUND, RESPONSE_CODES.NOT_FOUND);
    }

    const historyEntry = {
        ...payload,
        recordedAt: payload.recordedAt,
    };

    user.activityStateHistory = Array.isArray(user.activityStateHistory) ? user.activityStateHistory : [];
    user.activityStateHistory.push(historyEntry);
    if (user.activityStateHistory.length > ACTIVITY_STATE_LIMIT) {
        user.activityStateHistory = user.activityStateHistory.slice(-ACTIVITY_STATE_LIMIT);
    }

    user.currentActivityState = {
        ...historyEntry,
        recordedAt: payload.recordedAt
    };
    user.updatedAt = new Date();

    await user.save();

    logger.info('Activity state recorded', {
        userId,
        state: payload.state,
        source: payload.source,
        historyCount: user.activityStateHistory.length
    });

    res.status(RESPONSE_CODES.SUCCESS).json({
        success: true,
        message: 'Activity state recorded successfully',
        data: {
            userId: user._id,
            currentActivityState: user.currentActivityState,
            historyCount: user.activityStateHistory.length
        }
    });
});

// Get Activity State History
exports.getActivityStateHistory = asyncHandler(async (req, res) => {
    const { userId } = req.params;

    const user = await User.findById(userId).select('currentActivityState activityStateHistory updatedAt');
    if (!user) {
        throw new APIError(ERRORS.USER_NOT_FOUND, RESPONSE_CODES.NOT_FOUND);
    }

    res.status(RESPONSE_CODES.SUCCESS).json({
        success: true,
        data: {
            currentActivityState: user.currentActivityState || null,
            activityStateHistory: user.activityStateHistory || [],
            historyCount: (user.activityStateHistory || []).length,
            updatedAt: user.updatedAt
        }
    });
});

// Verify KYC
exports.verifyKYC = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { documentType, documentId, documentImage, profileImage } = req.body;

    const user = await User.findById(userId);
    if (!user) {
        throw new APIError(ERRORS.USER_NOT_FOUND, RESPONSE_CODES.NOT_FOUND);
    }

    const maskedId = documentId
        ? `XXXX${String(documentId).slice(-4)}`
        : undefined;

    // Update KYC
    user.kyc = {
        verified: true,
        verifiedAt: new Date(),
        documentType,
        documentIdMasked: maskedId,
        documentImage: documentImage || null,
        profileImage: profileImage || null
    };
    if (profileImage) {
        user.profileImage = profileImage;
    }
    user.accountStatus = USER_STATUS.ACTIVE;

    await user.save();

    logger.info('User KYC verified', { userId, documentType });

    syncUserToAutomation(user, { reason: 'verify-kyc' })
        .catch((err) => logger.warn('Failed to sync KYC-verified user to automation', { error: err.message, userId }));

    res.status(RESPONSE_CODES.SUCCESS).json({
        success: true,
        message: 'KYC verified successfully',
        data: {
            userId: user._id,
            accountStatus: user.accountStatus
        }
    });
});

// Update User Profile
exports.updateProfile = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const {
        name,
        location,
        latitude,
        longitude,
        phone,
        platform,
        city,
        deliveryZone,
        zoneType,
        dailyIncome,
        workingHours,
        workingDays,
        avgDailyHours,
        themePreference,
        profileImage,
        activityConsent,
        weatherCrossCheckConsent,
        activityTelemetry
    } = req.body;

    const normalizedTelemetry = activityTelemetry && typeof activityTelemetry === 'object'
        ? {
            accelerometerVariance: activityTelemetry.accelerometerVariance,
            idleRatio: activityTelemetry.idleRatio,
            foregroundAppMinutes: activityTelemetry.foregroundAppMinutes,
            motionConsistencyScore: activityTelemetry.motionConsistencyScore,
            sampleCount: activityTelemetry.sampleCount,
            collectedAt: activityTelemetry.collectedAt || new Date(),
            deviceMotionAvailable: Boolean(activityTelemetry.deviceMotionAvailable)
        }
        : undefined;

    const shiftFields = buildShiftFields(workingHours);

    const user = await User.findByIdAndUpdate(
        userId,
        {
            name,
            location: location || [city, deliveryZone].filter(Boolean).join(', ') || undefined,
            latitude,
            longitude,
            phone,
            platform,
            city,
            deliveryZone,
            zoneType,
            dailyIncome,
            workingHours,
            ...shiftFields,
            workingDays,
            avgDailyHours,
            themePreference,
            profileImage,
            activityConsent,
            weatherCrossCheckConsent,
            activityTelemetry: normalizedTelemetry,
            updatedAt: new Date()
        },
        { new: true, runValidators: true }
    );

    if (!user) {
        throw new APIError(ERRORS.USER_NOT_FOUND, RESPONSE_CODES.NOT_FOUND);
    }

    logger.info('User profile updated', { userId });

    syncUserToAutomation(user, { reason: 'update-profile' })
        .catch((err) => logger.warn('Failed to sync profile update to automation', { error: err.message, userId }));

    res.status(RESPONSE_CODES.SUCCESS).json({
        success: true,
        message: 'Profile updated successfully',
        data: user
    });
});

exports.registerDeviceToken = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { token, platform = 'web' } = req.body;

    if (!token || String(token).trim().length < 8) {
        throw new APIError('Device token is required', RESPONSE_CODES.BAD_REQUEST);
    }

    const user = await User.findById(userId);
    if (!user) {
        throw new APIError(ERRORS.USER_NOT_FOUND, RESPONSE_CODES.NOT_FOUND);
    }

    const normalizedToken = String(token).trim();
    const exists = (user.deviceTokens || []).some((entry) => entry.token === normalizedToken);
    if (!exists) {
        user.deviceTokens = user.deviceTokens || [];
        user.deviceTokens.push({
            token: normalizedToken,
            platform,
            createdAt: new Date()
        });
        user.updatedAt = new Date();
        await user.save();
    }

    res.status(RESPONSE_CODES.SUCCESS).json({
        success: true,
        message: 'Device token registered',
        data: {
            userId: user._id,
            tokenCount: user.deviceTokens.length
        }
    });
});

exports.getSyncHealth = asyncHandler(async (_req, res) => {
    res.status(RESPONSE_CODES.SUCCESS).json({
        success: true,
        data: getAutomationSyncHealth(),
    });
});
