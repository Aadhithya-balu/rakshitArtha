const { RESPONSE_CODES, ERRORS } = require('./constants');
const logger = require('./logger');
const { parseWorkingHours } = require('./timeParser');
const VALID_KYC_DOCS = ['AADHAR', 'PAN', 'DRIVING_LICENSE'];

function failValidation(res, context, errors, meta = {}) {
    logger.warn(`Validation failed for ${context}`, { errors, ...meta });
    return res.status(RESPONSE_CODES.BAD_REQUEST).json({
        success: false,
        message: ERRORS.INVALID_INPUT,
        errors
    });
}

// Validate User Registration Input
const validateUserRegistration = (req, res, next) => {
    const { name, email, phone, location, platform } = req.body;

    const errors = [];

    if (!name || name.trim().length < 2) {
        errors.push('Name must be at least 2 characters');
    }

    if (!email || !/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(email)) {
        errors.push('Invalid email format');
    }

    if (!phone || !/^[0-9]{10}$/.test(phone)) {
        errors.push('Phone must be 10 digits');
    }

    if (!location || location.trim().length === 0) {
        errors.push('Location is required');
    }

    if (!platform || !['SWIGGY', 'ZOMATO', 'RIKSHAW', 'OTHER'].includes(platform)) {
        errors.push('Invalid platform');
    }

    if (errors.length > 0) return failValidation(res, 'user registration', errors, { email });

    next();
};

// Validate Policy Creation Input
const validatePolicyCreation = (req, res, next) => {
    const { userId, plan, workerType, triggerTypes } = req.body;
    const VALID_PLANS = ['BASIC', 'STANDARD', 'PREMIUM', 'GIG_BASIC', 'GIG_STANDARD', 'GIG_PREMIUM'];
    const VALID_TRIGGERS = ['HEAVY_RAIN', 'HIGH_POLLUTION', 'DISASTER', 'TRAFFIC_BLOCKED'];

    const errors = [];

    if (!userId) {
        errors.push('User ID is required');
    }

    if (!plan || !VALID_PLANS.includes(plan)) {
        errors.push(`Plan must be one of: ${VALID_PLANS.join(', ')}`);
    }

    if (workerType && !['GIG', 'EMPLOYEE'].includes(workerType)) {
        errors.push('Worker type must be GIG or EMPLOYEE');
    }

    if (triggerTypes && (!Array.isArray(triggerTypes) || 
        triggerTypes.some(t => !VALID_TRIGGERS.includes(t)))) {
        errors.push(`Trigger types must be array of: ${VALID_TRIGGERS.join(', ')}`);
    }

    if (errors.length > 0) return failValidation(res, 'policy creation', errors, { userId });

    next();
};

// Validate Claim Submission Input
const validateClaimSubmission = (req, res, next) => {
    const { policyId, claimType, riskScore, triggerEvidence } = req.body;
    const VALID_CLAIM_TYPES = [
        'HEAVY_RAIN',
        'HIGH_POLLUTION',
        'DISASTER',
        'TRAFFIC_BLOCKED',
        'THUNDERSTORM',
        'EXTREME_HEAT',
        'FLOODING',
        'CURFEW',
        'STRIKE',
        'UNEXPECTED_EVENT',
        'MARKET_CLOSURE',
        'PLATFORM_DOWNTIME'
    ];

    const errors = [];

    if (!policyId) {
        errors.push('Policy ID is required');
    }

    if (!claimType || !VALID_CLAIM_TYPES.includes(claimType)) {
        errors.push(`Claim type must be one of: ${VALID_CLAIM_TYPES.join(', ')}`);
    }

    if (riskScore === undefined || riskScore < 0 || riskScore > 100) {
        errors.push('Risk score must be between 0 and 100');
    }

    if (!triggerEvidence || typeof triggerEvidence !== 'object') {
        errors.push('Trigger evidence is required and must be an object');
    }

    if (errors.length > 0) return failValidation(res, 'claim submission', errors, { policyId });

    next();
};

// Validate KYC Submission Input
const validateKycSubmission = (req, res, next) => {
    const { documentType, documentId } = req.body;
    const errors = [];
    const normalizedType = String(documentType || '').trim().toUpperCase();
    const normalizedId = String(documentId || '').trim().toUpperCase();

    if (!normalizedType || !VALID_KYC_DOCS.includes(normalizedType)) {
        errors.push(`Document type must be one of: ${VALID_KYC_DOCS.join(', ')}`);
    }

    if (!normalizedId || normalizedId.length < 6) {
        errors.push('Document ID must be at least 6 characters');
    }

    if (normalizedType === 'AADHAR' && !/^\d{12}$/.test(normalizedId)) {
        errors.push('Aadhar must be exactly 12 digits');
    }

    if (normalizedType === 'PAN' && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(normalizedId)) {
        errors.push('PAN format must be like ABCDE1234F');
    }

    if (normalizedType === 'DRIVING_LICENSE' && normalizedId.length < 10) {
        errors.push('Driving license number looks too short');
    }

    if (errors.length > 0) return failValidation(res, 'KYC submission', errors);

    next();
};

const validateActivityStatePayload = (req, res, next) => {
    const { state, recordedAt, source, accelerometerVariance, idleRatio, motionConsistencyScore, sampleCount, deviceMotionAvailable } = req.body;
    const errors = [];
    const allowedStates = ['MOVING', 'IDLE', 'WALKING'];

    if (!state || !allowedStates.includes(String(state).toUpperCase())) {
        errors.push(`state must be one of: ${allowedStates.join(', ')}`);
    }

    if (recordedAt !== undefined && recordedAt !== null && Number.isNaN(Date.parse(String(recordedAt)))) {
        errors.push('recordedAt must be a valid date string');
    }

    if (source !== undefined && String(source).trim().length < 2) {
        errors.push('source must be at least 2 characters when provided');
    }

    const numericFields = [
        ['accelerometerVariance', accelerometerVariance],
        ['idleRatio', idleRatio],
        ['motionConsistencyScore', motionConsistencyScore],
    ];

    for (const [field, value] of numericFields) {
        if (value !== undefined && value !== null && !Number.isFinite(Number(value))) {
            errors.push(`${field} must be a valid number when provided`);
        }
    }

    if (sampleCount !== undefined && sampleCount !== null) {
        const parsed = Number(sampleCount);
        if (!Number.isFinite(parsed) || parsed < 0) {
            errors.push('sampleCount must be a non-negative number when provided');
        }
    }

    if (deviceMotionAvailable !== undefined && typeof deviceMotionAvailable !== 'boolean') {
        errors.push('deviceMotionAvailable must be boolean when provided');
    }

    if (errors.length > 0) return failValidation(res, 'activity state payload', errors);

    next();
};

const validateProfileUpdate = (req, res, next) => {
    const {
        name,
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
        activityConsent,
        weatherCrossCheckConsent,
        activityTelemetry
    } = req.body;

    const errors = [];

    if (name !== undefined && String(name).trim().length < 2) {
        errors.push('Name must be at least 2 characters');
    }

    if (phone !== undefined && !/^\d{10}$/.test(String(phone).replace(/\D/g, '').slice(-10))) {
        errors.push('Phone must be 10 digits');
    }

    if (platform !== undefined && !['SWIGGY', 'ZOMATO', 'RIKSHAW', 'OTHER'].includes(String(platform).toUpperCase())) {
        errors.push('Platform must be one of: SWIGGY, ZOMATO, RIKSHAW, OTHER');
    }

    if (city !== undefined && String(city).trim().length < 2) {
        errors.push('City must be at least 2 characters');
    }

    if (deliveryZone !== undefined && String(deliveryZone).trim().length < 2) {
        errors.push('Delivery zone must be at least 2 characters');
    }

    if (zoneType !== undefined && !['Urban', 'Suburban', 'Rural'].includes(String(zoneType))) {
        errors.push('Zone type must be Urban, Suburban, or Rural');
    }

    if (dailyIncome !== undefined) {
        const income = Number(dailyIncome);
        if (!Number.isFinite(income) || income < 0 || income > 100000) {
            errors.push('Daily income must be a valid number between 0 and 100000');
        }
    }

    if (avgDailyHours !== undefined) {
        const hours = Number(avgDailyHours);
        if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
            errors.push('Average daily hours must be between 1 and 24');
        }
    }

    if (workingHours !== undefined) {
        const parsedHours = parseWorkingHours(String(workingHours));
        if (!parsedHours) {
            errors.push('Working hours must be in format like "2 PM - 10 PM", "2pm-10am", or "14:00 - 22:00"');
        }
    }

    if (workingDays !== undefined && String(workingDays).trim().length < 3) {
        errors.push('Working days format looks invalid');
    }

    if (themePreference !== undefined && !['light', 'dark', 'system'].includes(String(themePreference))) {
        errors.push('Theme preference must be light, dark, or system');
    }

    if (activityConsent !== undefined && typeof activityConsent !== 'boolean') {
        errors.push('activityConsent must be boolean');
    }

    if (weatherCrossCheckConsent !== undefined && typeof weatherCrossCheckConsent !== 'boolean') {
        errors.push('weatherCrossCheckConsent must be boolean');
    }

    if (activityTelemetry !== undefined && (typeof activityTelemetry !== 'object' || activityTelemetry === null)) {
        errors.push('activityTelemetry must be an object');
    }

    if (errors.length > 0) return failValidation(res, 'profile update', errors);

    next();
};

const validatePaymentOrderPayload = (req, res, next) => {
    const { userId, plan, overallRisk, triggerTypes } = req.body;
    const validPlans = ['BASIC', 'STANDARD', 'PREMIUM', 'GIG_BASIC', 'GIG_STANDARD', 'GIG_PREMIUM'];
    const validTriggers = ['HEAVY_RAIN', 'HIGH_POLLUTION', 'DISASTER', 'TRAFFIC_BLOCKED', 'EXTREME_HEAT', 'PLATFORM_DOWNTIME'];
    const errors = [];

    if (!userId || String(userId).trim().length < 12) {
        errors.push('Valid userId is required');
    }

    if (!plan || !validPlans.includes(String(plan).toUpperCase())) {
        errors.push(`Plan must be one of: ${validPlans.join(', ')}`);
    }

    if (overallRisk !== undefined) {
        const risk = Number(overallRisk);
        if (!Number.isFinite(risk) || risk < 0 || risk > 100) {
            errors.push('overallRisk must be a number between 0 and 100');
        }
    }

    if (triggerTypes !== undefined) {
        if (!Array.isArray(triggerTypes) || triggerTypes.length === 0) {
            errors.push('triggerTypes must be a non-empty array when provided');
        } else if (triggerTypes.some((t) => !validTriggers.includes(String(t).toUpperCase()))) {
            errors.push(`triggerTypes must contain only: ${validTriggers.join(', ')}`);
        }
    }

    if (errors.length > 0) return failValidation(res, 'payment order payload', errors);

    next();
};

const validatePaymentVerificationPayload = (req, res, next) => {
    const { policyId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
    const errors = [];

    if (!policyId) errors.push('policyId is required');
    if (!razorpayOrderId) errors.push('razorpayOrderId is required');
    if (!razorpayPaymentId) errors.push('razorpayPaymentId is required');
    if (!razorpaySignature) errors.push('razorpaySignature is required');

    if (errors.length > 0) return failValidation(res, 'payment verification payload', errors);

    next();
};

const validateDemoClaimSimulation = (req, res, next) => {
    const {
        userId,
        selectedPlan,
        disruptionType,
        otherReason,
        rainfall,
        aqi,
        traffic,
        lostIncome,
        inputMode,
        manualFraudScore
    } = req.body;

    const errors = [];
    const allowedPlans = ['GIG_STANDARD', 'GIG_PREMIUM'];
    const allowedDisruptions = [
        'HEAVY_RAIN', 'THUNDERSTORM', 'EXTREME_HEAT', 'FLOODING',
        'HIGH_POLLUTION', 'CURFEW', 'STRIKE', 'UNEXPECTED_EVENT',
        'MARKET_CLOSURE', 'PLATFORM_DOWNTIME', 'TRAFFIC_BLOCKED', 'OTHER'
    ];
    const allowedOtherReasons = ['CURFEW', 'STRIKE', 'UNEXPECTED_EVENT', 'MARKET_CLOSURE', 'PLATFORM_DOWNTIME'];

    if (!userId || String(userId).trim().length < 12) errors.push('Valid userId is required');
    if (selectedPlan !== undefined && !allowedPlans.includes(String(selectedPlan).toUpperCase())) {
        errors.push(`selectedPlan must be one of: ${allowedPlans.join(', ')}`);
    }
    if (!disruptionType || !allowedDisruptions.includes(String(disruptionType).toUpperCase())) {
        errors.push(`disruptionType must be one of: ${allowedDisruptions.join(', ')}`);
    }
    if (String(disruptionType || '').toUpperCase() === 'OTHER' && !allowedOtherReasons.includes(String(otherReason || '').toUpperCase())) {
        errors.push(`When disruptionType is OTHER, otherReason must be one of: ${allowedOtherReasons.join(', ')}`);
    }

    const numericChecks = [
        ['rainfall', rainfall, 0, 1000],
        ['aqi', aqi, 0, 1000],
        ['traffic', traffic, 0, 5],
        ['lostIncome', lostIncome, 0, 200000],
    ];

    for (const [field, value, min, max] of numericChecks) {
        if (value !== undefined) {
            const num = Number(value);
            if (!Number.isFinite(num) || num < min || num > max) {
                errors.push(`${field} must be between ${min} and ${max}`);
            }
        }
    }

    if (inputMode !== undefined && !['live', 'manual'].includes(String(inputMode).toLowerCase())) {
        errors.push('inputMode must be live or manual');
    }

    if (manualFraudScore !== undefined && manualFraudScore !== null) {
        const score = Number(manualFraudScore);
        if (!Number.isFinite(score) || score < 0 || score > 100) {
            errors.push('manualFraudScore must be between 0 and 100');
        }
    }

    if (errors.length > 0) return failValidation(res, 'demo claim simulation payload', errors);

    next();
};

const validateInsurerAdminProvision = (req, res, next) => {
    const { name, email, phone } = req.body;
    const errors = [];

    if (!name || String(name).trim().length < 2) {
        errors.push('Name must be at least 2 characters');
    }

    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail || !/^[\w-.]+@([\w-]+\.)+[\w-]{2,}$/.test(normalizedEmail)) {
        errors.push('Valid email is required');
    }

    if (phone !== undefined && phone !== null && String(phone).trim().length > 0) {
        if (!/^\d{10}$/.test(String(phone).replace(/\D/g, '').slice(-10))) {
            errors.push('Phone must be 10 digits when provided');
        }
    }

    if (errors.length > 0) return failValidation(res, 'insurer admin provision', errors);

    next();
};

// Request Logging Middleware
const requestLogger = (req, res, next) => {
    const startTime = Date.now();

    res.on('finish', () => {
        const duration = Date.now() - startTime;
        logger.debug(`${req.method} ${req.originalUrl}`, {
            statusCode: res.statusCode,
            duration: `${duration}ms`,
            ip: req.ip
        });
    });

    next();
};

module.exports = {
    validateUserRegistration,
    validatePolicyCreation,
    validateClaimSubmission,
    validateKycSubmission,
    validateActivityStatePayload,
    validateProfileUpdate,
    validatePaymentOrderPayload,
    validatePaymentVerificationPayload,
    validateDemoClaimSimulation,
    validateInsurerAdminProvision,
    requestLogger
};
