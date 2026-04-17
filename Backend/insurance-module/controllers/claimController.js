const Claim = require('../models/Claim');
const Policy = require('../models/Policy');
const User = require('../models/User');
const Payment = require('../models/Payment');
const FraudLog = require('../models/FraudLog');
const axios = require('axios');
const { asyncHandler, APIError } = require('../utils/errorHandler');
const logger = require('../utils/logger');
const { fraudDetectionService } = require('../services/fraudDetectionService');
const payoutService = require('../services/payoutService');
const { weatherService } = require('../services/weatherService');
const { mlFraudDetectionModel } = require('../services/mlFraudDetectionModel');
const { workflowLogger } = require('../services/workflowLoggingService');
const { parseWorkingHours, getOverlapHours, buildDisruptionWindow } = require('../utils/timeParser');
const { CLAIM_STATUS, POLICY_STATUS, RESPONSE_CODES, ERRORS, DEFAULTS, PLANS } = require('../utils/constants');

const WORKFLOW_STEPS = {
    POLICY_VALIDATION: 'POLICY_VALIDATION',
    DISRUPTION_DETECTION: 'DISRUPTION_DETECTION',
    DURATION_CALCULATION: 'DURATION_CALCULATION',
    LOSS_CALCULATION: 'LOSS_CALCULATION',
    FRAUD_DETECTION: 'FRAUD_DETECTION',
    CLAIM_CREATION: 'CLAIM_CREATION',
    PAYOUT_PROCESSING: 'PAYOUT_PROCESSING'
};

async function safeWorkflowCall(operation, context) {
    try {
        await operation();
    } catch (error) {
        logger.warn('Workflow logging skipped due to logger/API error', {
            context,
            error: error.message
        });
    }
}

// Submit Claim
exports.submitClaim = asyncHandler(async (req, res) => {
    const { policyId, claimType, riskScore, triggerEvidence } = req.body;

    // Validate policy
    const policy = await Policy.findById(policyId).populate('userId');
    if (!policy) {
        throw new APIError(ERRORS.POLICY_NOT_FOUND, RESPONSE_CODES.NOT_FOUND);
    }

    // Check policy status
    if (policy.status !== POLICY_STATUS.ACTIVE) {
        throw new APIError(
            `Cannot claim on ${policy.status.toLowerCase()} policy`,
            RESPONSE_CODES.FORBIDDEN
        );
    }

    if (policy.paymentStatus !== 'PAID' || policy.paymentProvider !== 'RAZORPAY') {
        throw new APIError(
            'Claims require an active policy with completed Razorpay payment',
            RESPONSE_CODES.FORBIDDEN
        );
    }

    // Check policy not expired
    if (new Date() > policy.expiryDate) {
        throw new APIError(ERRORS.POLICY_EXPIRED, RESPONSE_CODES.FORBIDDEN);
    }

    // Check claim limit
    const claimsThisMonth = await Claim.countDocuments({
        policyId,
        createdAt: {
            $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        }
    });

    const planConfig = require('../utils/constants').PLANS[policy.plan];
    if (claimsThisMonth >= planConfig.maxClaims) {
        throw new APIError(ERRORS.CLAIM_LIMIT_EXCEEDED, RESPONSE_CODES.FORBIDDEN);
    }

    // Run fraud detection
    const fraudAnalysis = await fraudDetectionService.analyzeClaim({
        userId: policy.userId._id,
        policyId,
        claimType,
        riskScore,
        triggerEvidence
    });

    logger.debug('Fraud analysis completed', {
        policyId,
        fraudScore: fraudAnalysis.score,
        flags: fraudAnalysis.flags
    });

    // Create claim
    const claim = await Claim.create({
        policyId,
        userId: policy.userId._id,
        claimType,
        riskScore,
        sourceType: 'LIVE',
        triggerEvidence,
        fraudScore: fraudAnalysis.score,
        fraudFlags: fraudAnalysis.flags,
        fraudFlagDescription: fraudAnalysis.description,
        fraudReviewTier: fraudAnalysis.reviewTier || 'GREEN',
        fraudNextAction: fraudAnalysis.nextAction || 'AUTO_APPROVE',
        fraudLayerEvidence: fraudAnalysis.layers,
        fraudLayerCount: fraudAnalysis.layerCount || 6,
        status: fraudAnalysis.nextAction === 'MANUAL_REVIEW' ? CLAIM_STATUS.UNDER_REVIEW : CLAIM_STATUS.SUBMITTED
    });

    const disruptionType = triggerEvidence?.disruptionType || claimType || 'UNKNOWN';
    const disruptionDurationHours = Number(
        triggerEvidence?.durationHours ||
        triggerEvidence?.payoutComputation?.durationHours ||
        0
    );
    const estimatedLoss = Number(
        triggerEvidence?.payoutComputation?.estimatedLoss ||
        triggerEvidence?.estimatedLoss ||
        0
    );

    await safeWorkflowCall(async () => {
        await workflowLogger.initializeWorkflow(claim._id, {
            claimType,
            userId: policy.userId._id,
            policyId,
            triggerEvidence
        });

        await workflowLogger.logStep(claim._id, {
            stepName: WORKFLOW_STEPS.POLICY_VALIDATION,
            status: 'SUCCESS',
            message: 'Policy is active and payment is complete.',
            data: {
                policyStatus: policy.status,
                paymentStatus: policy.paymentStatus,
                expiryDate: policy.expiryDate
            },
            nextStep: WORKFLOW_STEPS.DISRUPTION_DETECTION
        });

        await workflowLogger.logStep(claim._id, {
            stepName: WORKFLOW_STEPS.DISRUPTION_DETECTION,
            status: disruptionType && disruptionType !== 'NONE' ? 'SUCCESS' : 'PENDING',
            message: disruptionType && disruptionType !== 'NONE'
                ? `Disruption trigger detected: ${disruptionType}`
                : 'Awaiting disruption trigger verification.',
            data: {
                disruptionType,
                durationHours: disruptionDurationHours,
                locationData: triggerEvidence?.locationData || null,
                weatherData: triggerEvidence?.weatherData || null
            },
            nextStep: WORKFLOW_STEPS.DURATION_CALCULATION
        });

        await workflowLogger.logStep(claim._id, {
            stepName: WORKFLOW_STEPS.DURATION_CALCULATION,
            status: disruptionDurationHours > 0 ? 'SUCCESS' : 'PENDING',
            message: disruptionDurationHours > 0
                ? `Duration calculated as ${disruptionDurationHours} hour(s).`
                : 'Duration pending based on incoming disruption evidence.',
            data: {
                durationHours: disruptionDurationHours
            },
            nextStep: WORKFLOW_STEPS.LOSS_CALCULATION
        });

        await workflowLogger.logStep(claim._id, {
            stepName: WORKFLOW_STEPS.LOSS_CALCULATION,
            status: estimatedLoss > 0 ? 'SUCCESS' : 'PENDING',
            message: estimatedLoss > 0
                ? `Estimated loss calculated: ₹${estimatedLoss.toFixed(2)}`
                : 'Loss estimate pending with complete duration evidence.',
            data: {
                estimatedLoss,
                payoutComputation: triggerEvidence?.payoutComputation || null
            },
            nextStep: WORKFLOW_STEPS.FRAUD_DETECTION
        });

        await workflowLogger.logFraudDetection(claim._id, {
            userId: policy.userId._id,
            policyId,
            overallScore: fraudAnalysis.score,
            riskTier: fraudAnalysis.reviewTier || 'GREEN',
            fraudFlags: fraudAnalysis.flags,
            layers: fraudAnalysis.layers,
            layerCount: fraudAnalysis.layerCount || 6,
            passedLayers: Math.max((fraudAnalysis.layerCount || 6) - (fraudAnalysis.flags?.length || 0), 0),
            failedLayers: fraudAnalysis.flags?.length || 0
        });

        await workflowLogger.logClaimCreation(claim._id, {
            type: claim.claimType,
            status: claim.status,
            approvedAmount: claim.approvedAmount || 0
        });

        await workflowLogger.logStep(claim._id, {
            stepName: WORKFLOW_STEPS.PAYOUT_PROCESSING,
            status: 'PENDING',
            message: 'Claim recorded. Payout will run after review/approval.',
            data: {
                currentClaimStatus: claim.status
            }
        });
    }, `submit-claim:${claim._id}`);

    // Log fraud analysis
    if (fraudAnalysis.score > DEFAULTS.FRAUD_SCORE_THRESHOLD) {
        await FraudLog.create({
            userId: policy.userId._id,
            policyId,
            claimId: claim._id,
            fraudType: fraudAnalysis.primaryFlag || 'PATTERN_ANOMALY',
            fraudScore: fraudAnalysis.score,
            severity: getSeverityLevel(fraudAnalysis.score),
            evidence: fraudAnalysis.evidence,
            decision: fraudAnalysis.score > 70 ? 'FLAGGED_FOR_REVIEW' : 'APPROVED'
        });

        logger.warn('High fraud risk detected', {
            claimId: claim._id,
            fraudScore: fraudAnalysis.score,
            flags: fraudAnalysis.flags
        });
    }

    res.status(RESPONSE_CODES.CREATED).json({
        success: true,
        message: 'Claim submitted successfully. Under review.',
        data: {
            claimId: claim._id,
            status: claim.status,
            fraudScore: claim.fraudScore,
            reviewTier: claim.fraudReviewTier,
            nextAction: claim.fraudNextAction,
            estimatedProcessingTime: '24-48 hours'
        }
    });
});


// Get Claim Details
exports.getClaimDetails = asyncHandler(async (req, res) => {
    const { claimId } = req.params;

    const claim = await Claim.findById(claimId)
        .populate('policyId', 'plan weeklyPremium coverageAmount')
        .populate('userId', 'name email phone');

    if (!claim) {
        throw new APIError(ERRORS.CLAIM_NOT_FOUND, RESPONSE_CODES.NOT_FOUND);
    }

    logger.debug('Claim details retrieved', { claimId });

    res.status(RESPONSE_CODES.SUCCESS).json({
        success: true,
        data: claim
    });
});

// Get User Claims
exports.getUserClaims = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { status, skip = 0, limit = 10 } = req.query;

    const query = { userId, sourceType: { $ne: 'DEMO' } };
    if (status) {
        query.status = status;
    }

    const claims = await Claim.find(query)
        .sort({ createdAt: -1 })
        .skip(parseInt(skip))
        .limit(parseInt(limit));

    const total = await Claim.countDocuments(query);

    logger.debug('User claims retrieved', { userId, count: claims.length });

    res.status(RESPONSE_CODES.SUCCESS).json({
        success: true,
        data: claims,
        pagination: {
            total,
            skip: parseInt(skip),
            limit: parseInt(limit)
        }
    });
});

// Approve Claim
exports.approveClaim = asyncHandler(async (req, res) => {
    const { claimId } = req.params;
    const { approvedAmount, approvedBy, notes } = req.body;

    const claim = await Claim.findById(claimId).populate('policyId');
    if (!claim) {
        throw new APIError(ERRORS.CLAIM_NOT_FOUND, RESPONSE_CODES.NOT_FOUND);
    }

    if (claim.status !== CLAIM_STATUS.SUBMITTED && claim.status !== CLAIM_STATUS.UNDER_REVIEW) {
        throw new APIError('Claim cannot be approved in current status', RESPONSE_CODES.FORBIDDEN);
    }

    // Validate approved amount
    const maxAmount = claim.policyId.coverageAmount;
    if (approvedAmount > maxAmount) {
        throw new APIError(
            `Approved amount cannot exceed coverage amount (${maxAmount})`,
            RESPONSE_CODES.BAD_REQUEST
        );
    }

    claim.status = CLAIM_STATUS.APPROVED;
    claim.approvedAmount = approvedAmount;
    claim.approvedBy = approvedBy;
    claim.approvalNotes = notes;
    claim.reviewedAt = new Date();

    await claim.save();

    await safeWorkflowCall(async () => {
        await workflowLogger.logStep(claim._id, {
            stepName: WORKFLOW_STEPS.PAYOUT_PROCESSING,
            status: 'PENDING',
            message: 'Claim approved. Payout processing is queued.',
            data: {
                approvedAmount: claim.approvedAmount,
                approvedBy,
                reviewedAt: claim.reviewedAt
            }
        });
    }, `approve-claim:${claim._id}`);

    logger.info('Claim approved', {
        claimId,
        approvedAmount,
        approvedBy
    });

    res.status(RESPONSE_CODES.SUCCESS).json({
        success: true,
        message: 'Claim approved successfully',
        data: {
            claimId: claim._id,
            status: claim.status,
            approvedAmount: claim.approvedAmount
        }
    });
});

// Reject Claim
exports.rejectClaim = asyncHandler(async (req, res) => {
    const { claimId } = req.params;
    const { reason, rejectedBy } = req.body;

    const claim = await Claim.findById(claimId);
    if (!claim) {
        throw new APIError(ERRORS.CLAIM_NOT_FOUND, RESPONSE_CODES.NOT_FOUND);
    }

    if (claim.status !== CLAIM_STATUS.SUBMITTED && claim.status !== CLAIM_STATUS.UNDER_REVIEW) {
        throw new APIError('Claim cannot be rejected in current status', RESPONSE_CODES.FORBIDDEN);
    }

    claim.status = CLAIM_STATUS.REJECTED;
    claim.rejectionReason = reason;
    claim.approvedBy = rejectedBy;
    claim.reviewedAt = new Date();

    await claim.save();

    await safeWorkflowCall(async () => {
        await workflowLogger.rejectWorkflow(
            claim._id,
            WORKFLOW_STEPS.FRAUD_DETECTION,
            reason,
            {
                claimStatus: claim.status,
                rejectedBy,
                reviewedAt: claim.reviewedAt
            }
        );
    }, `reject-claim:${claim._id}`);

    logger.info('Claim rejected', {
        claimId,
        reason
    });

    res.status(RESPONSE_CODES.SUCCESS).json({
        success: true,
        message: 'Claim rejected successfully',
        data: {
            claimId: claim._id,
            status: claim.status,
            reason: claim.rejectionReason
        }
    });
});

// Process Payout
exports.processPayout = asyncHandler(async (req, res) => {
    const { claimId } = req.params;

    const claim = await Claim.findById(claimId).populate('userId');
    if (!claim) {
        throw new APIError(ERRORS.CLAIM_NOT_FOUND, RESPONSE_CODES.NOT_FOUND);
    }

    if (claim.status !== CLAIM_STATUS.APPROVED) {
        throw new APIError('Only approved claims can be paid out', RESPONSE_CODES.FORBIDDEN);
    }

    try {
        const paymentDetails = await Payment.findOne({ userId: claim.userId._id });
        if (!paymentDetails) {
            throw new APIError('No payment details found', RESPONSE_CODES.BAD_REQUEST);
        }

        const resolvedMethod = paymentDetails.upiId ? 'UPI' : 'BANK_TRANSFER';

        await payoutService.processPayout({
            userId: claim.userId._id,
            claimId: claim._id,
            amount: claim.approvedAmount,
            method: resolvedMethod,
            workerUPI: paymentDetails.upiId,
            beneficiaryBank: paymentDetails.bankName,
            beneficiaryAccountLast4: paymentDetails.accountNumber ? paymentDetails.accountNumber.slice(-4) : null
        });

        claim.status = CLAIM_STATUS.PAID;
        claim.payoutAmount = claim.approvedAmount;
        claim.payoutMethod = resolvedMethod;
        claim.payoutDate = new Date();

        await claim.save();

        await safeWorkflowCall(async () => {
            await workflowLogger.logPayoutProcessing(claim._id, {
                amount: claim.payoutAmount,
                method: claim.payoutMethod,
                status: claim.status,
                transactionId: null
            }, true);
            await workflowLogger.completeWorkflow(claim._id);
        }, `process-payout-success:${claim._id}`);

        logger.info('Payout processed successfully', {
            claimId,
            amount: claim.approvedAmount,
            method: claim.payoutMethod
        });

        res.status(RESPONSE_CODES.SUCCESS).json({
            success: true,
            message: 'Payout processed successfully',
            data: {
                claimId: claim._id,
                status: claim.status,
                payoutAmount: claim.payoutAmount,
                payoutDate: claim.payoutDate,
                payoutMethod: claim.payoutMethod
            }
        });
    } catch (error) {
        logger.error('Payout processing failed', { claimId, error: error.message });

        await safeWorkflowCall(async () => {
            await workflowLogger.logPayoutProcessing(claimId, {
                amount: claim.approvedAmount,
                method: claim.payoutMethod || 'BANK_TRANSFER',
                status: 'FAILED',
                reason: error.message
            }, false);
        }, `process-payout-failure:${claimId}`);

        if (error instanceof APIError) {
            throw error;
        }
        throw new APIError('Failed to process payout', RESPONSE_CODES.INTERNAL_SERVER_ERROR);
    }
});

// Helper function to get severity level
function getSeverityLevel(fraudScore) {
    if (fraudScore >= 80) return 'CRITICAL';
    if (fraudScore >= 60) return 'HIGH';
    if (fraudScore >= 40) return 'MEDIUM';
    return 'LOW';
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function toRiskLabel(score) {
    if (score >= 80) return 'EXTREME';
    if (score >= 60) return 'HIGH';
    if (score >= 35) return 'MEDIUM';
    return 'LOW';
}

function getMockRiskPreset(user = null) {
    const normalizedEmail = String(user?.email || '').trim().toLowerCase();
    const normalizedName = String(user?.name || '').trim().toLowerCase();
    const presets = {
        'mock.low@rakshitartha.test': {
            label: 'LOW',
            fraudScore: 20,
            reviewTier: 'GREEN',
            nextAction: 'AUTO_APPROVE',
        },
        'mock.medium@rakshitartha.test': {
            label: 'MEDIUM',
            fraudScore: 52,
            reviewTier: 'YELLOW',
            nextAction: 'ASK_CONTEXT',
        },
        'mock.high@rakshitartha.test': {
            label: 'HIGH',
            fraudScore: 90,
            reviewTier: 'RED',
            nextAction: 'MANUAL_REVIEW',
        },
    };

    if (presets[normalizedEmail]) return presets[normalizedEmail];

    if (normalizedName.includes('mock high risk')) return presets['mock.high@rakshitartha.test'];
    if (normalizedName.includes('mock medium risk')) return presets['mock.medium@rakshitartha.test'];
    if (normalizedName.includes('mock low risk')) return presets['mock.low@rakshitartha.test'];

    return null;
}

const ALLOWED_RULE_DISRUPTIONS = new Set([
    'HEAVY_RAIN',
    'THUNDERSTORM',
    'EXTREME_HEAT',
    'FLOODING',
    'HIGH_POLLUTION',
    'CURFEW',
    'STRIKE',
    'UNEXPECTED_EVENT',
    'MARKET_CLOSURE',
    'PLATFORM_DOWNTIME',
    'TRAFFIC_BLOCKED'
]);

const OTHER_ALLOWED_REASONS = new Set([
    'CURFEW',
    'STRIKE',
    'UNEXPECTED_EVENT',
    'MARKET_CLOSURE',
    'PLATFORM_DOWNTIME'
]);

exports.simulateDemoClaim = asyncHandler(async (req, res) => {
    const {
        userId,
        selectedPlan = 'GIG_STANDARD',
        disruptionType,
        otherReason,
        rainfall = 0,
        aqi = 0,
        traffic = 0,
        lostIncome = 0,
        inputMode = 'live',
        manualFraudScore = null
    } = req.body;

    const isManualMode = String(inputMode || '').toLowerCase() === 'manual';

    if (!userId) {
        throw new APIError('User ID is required', RESPONSE_CODES.BAD_REQUEST);
    }

    const user = await User.findById(userId);
    if (!user) {
        throw new APIError(ERRORS.USER_NOT_FOUND, RESPONSE_CODES.NOT_FOUND);
    }

    const mockRiskPreset = getMockRiskPreset(user);
    const isMockRiskUser = Boolean(mockRiskPreset);

    const requestedPolicyId = req.body.policyId || null;
    let candidatePolicy = null;

    if (requestedPolicyId) {
        candidatePolicy = await Policy.findOne({ _id: requestedPolicyId, userId: user._id });
    }

    if (!candidatePolicy) {
        candidatePolicy = await Policy.findOne({
            userId: user._id,
            status: POLICY_STATUS.ACTIVE,
            paymentStatus: 'PAID'
        }).sort({ updatedAt: -1, startDate: -1, createdAt: -1 });
    }

    if (!candidatePolicy) {
        candidatePolicy = await Policy.findOne({ userId: user._id })
            .sort({ updatedAt: -1, startDate: -1, createdAt: -1 });
    }

    const hasSuccessfulBillingRecord = Boolean(
        Number(candidatePolicy?.amountPaid || 0) > 0 ||
        (Array.isArray(candidatePolicy?.billingHistory) &&
            candidatePolicy.billingHistory.some((entry) =>
                entry?.status === 'PAID' &&
                (entry?.provider === 'RAZORPAY' || String(entry?.razorpayPaymentId || '').startsWith('pay_'))
            ))
    );

    const hasRazorpayCompletion = Boolean(
        candidatePolicy?.paymentProvider === 'RAZORPAY' &&
        String(candidatePolicy?.lastPaymentId || '').startsWith('pay_') &&
        !String(candidatePolicy?.lastPaymentId || '').startsWith('pay_demo_')
    );

    const policyPaymentVerified = Boolean(
        candidatePolicy &&
        candidatePolicy.status === POLICY_STATUS.ACTIVE &&
        candidatePolicy.paymentStatus === 'PAID' &&
        (
            isMockRiskUser
                ? true
                : (hasRazorpayCompletion && hasSuccessfulBillingRecord)
        )
    );

    // ====== FETCH REAL WEATHER DATA ======
    let realWeatherData = null;
    let realAqiData = null;
    let workerCapabilityCheck = { canWork: true, issues: [], severity: 'INFO' };
    
        if (!isManualMode && user.latitude && user.longitude) {
      try {
        // Fetch real weather data from external APIs
        realWeatherData = await weatherService.getWeatherData(user.latitude, user.longitude, user.location);
        realAqiData = await weatherService.getAQIData(user.latitude, user.longitude, user.location);
        
        // Check if worker can work in current conditions
        workerCapabilityCheck = weatherService.canWorkerOperateInConditions(user, realWeatherData, realAqiData);
        
        logger.info('Real weather data fetched', {
          userId: user._id,
          weather: realWeatherData?.source || 'none',
          aqi: realAqiData?.source || 'none',
          canWork: workerCapabilityCheck.canWork
        });
      } catch (error) {
        logger.warn('Failed to fetch real weather data', { error: error.message });
        // Continue with manual data if real fetch fails
      }
    }

    // ====== USE REAL DATA OR FALLBACK TO MANUAL ======
    // Prefer real data, fallback to manual input
    const effectiveRainfall = realWeatherData?.precipitation ?? (Number(rainfall) || 0);
    const effectiveAqi = realAqiData?.aqi ?? (Number(aqi) || 0);
    const effectiveWindSpeed = realWeatherData?.windSpeed ?? 0;
    const effectiveTemperature = realWeatherData?.temperature ?? Number(req.body.temperature || 30);

    const normalizedDisruption = String(disruptionType || '').toUpperCase();
    const normalizedOtherReason = String(otherReason || '').toUpperCase();
    const effectiveDisruption = normalizedDisruption === 'OTHER'
        ? normalizedOtherReason
        : normalizedDisruption;

    const baselineIncome = Number(user.dailyIncome || 0);
    const normalizedLostIncome = Math.max(0, Number(lostIncome) || 0);
    const incomeLossPercent = baselineIncome > 0
        ? clamp(Math.round((normalizedLostIncome / baselineIncome) * 100), 0, 100)
        : 0;

    // ====== CHECK WORKER CAPABILITY ======
    // If worker cannot work in current conditions, automatically reject
    const workerCanWork = workerCapabilityCheck.canWork;

    // ====== WEATHER TRIGGER WITH REAL DATA ======
    const weatherTriggerPassed =
        (effectiveDisruption === 'HEAVY_RAIN' && effectiveRainfall >= 50) ||
        (effectiveDisruption === 'HIGH_POLLUTION' && effectiveAqi >= 300) ||
        (effectiveDisruption === 'TRAFFIC_BLOCKED' && traffic >= 4) ||
        ['THUNDERSTORM', 'EXTREME_HEAT', 'FLOODING', 'CURFEW', 'STRIKE', 'UNEXPECTED_EVENT', 'MARKET_CLOSURE', 'PLATFORM_DOWNTIME'].includes(effectiveDisruption);

    const disruptionInRules = ALLOWED_RULE_DISRUPTIONS.has(effectiveDisruption);
    const otherReasonValid =
        normalizedDisruption !== 'OTHER' ||
        OTHER_ALLOWED_REASONS.has(normalizedOtherReason);

    const disruptionDetected = policyPaymentVerified && disruptionInRules && otherReasonValid && weatherTriggerPassed && workerCanWork;
    const incomeLossValidated = policyPaymentVerified && baselineIncome > 0 && normalizedLostIncome > 0 && incomeLossPercent >= 5;
    const parsedShift = parseWorkingHours(user?.workingHours || '');
    const disruptionWindow = buildDisruptionWindow({
        start: req.body?.disruptionStartHour,
        end: req.body?.disruptionEndHour,
        durationHours: Number(req.body?.disruptionHours) || (effectiveDisruption === 'HEAVY_RAIN' ? 4 : 3),
    });
    const overlapHours = parsedShift ? getOverlapHours(parsedShift, disruptionWindow) : 0;
    const disruptionHours = Math.max(Number(req.body?.disruptionHours || 3), 0.1);
    const overlapRatio = parsedShift ? clamp(overlapHours / disruptionHours, 0, 1) : 0;

    const triggerEvidence = {
        weatherData: {
            rainfall: effectiveRainfall,
            aqi: effectiveAqi,
            temperature: effectiveTemperature,
            windSpeed: effectiveWindSpeed,
            source: realWeatherData?.source || 'MANUAL_INPUT',
            timestamp: new Date()
        },
        activityData: {
            deliveriesCompleted: Math.max(0, 20 - Math.round(traffic * 2)),
            workingHours: Number(req.body.workingHours || 8),
            timestamp: new Date()
        },
        motionData: {
            accelerometerVariance: Number(req.body.accelerometerVariance ?? 0.62),
            idleRatio: Number(req.body.idleRatio ?? 0.28),
            motionConsistencyScore: Number(req.body.motionConsistencyScore ?? 0.74)
        },
        locationData: {
            latitude: user.latitude,
            longitude: user.longitude,
            address: user.location,
            timestamp: new Date()
        },
        workerCapabilityCheck: workerCapabilityCheck,
        auditTrace: {
            shift: user?.workingHours || null,
            disruption: `${disruptionWindow.startHour.toFixed(2)}-${disruptionWindow.endHour.toFixed(2)}`,
            overlapHours: Number(overlapHours.toFixed(3)),
            overlapRatio: Number(overlapRatio.toFixed(3))
        }
    };

    let fraudAnalysis = {
        decision: 'REJECTED',
        score: 0,
        description: 'Skipped because no active paid policy was found.',
        flags: ['POLICY_PAYMENT_NOT_VERIFIED'],
        layers: {
            policyPayment: {
                triggered: true,
                score: 100,
                reason: 'No active paid policy found for demo claim simulation.'
            }
        }
    };

    if (policyPaymentVerified) {
        const riskSignalScore = clamp(
            Math.round(
                (effectiveRainfall > 0 ? effectiveRainfall / 2 : 0) +
                (effectiveAqi > 0 ? effectiveAqi / 10 : 0) +
                (Number(traffic) || 0) * 10
            ),
            0,
            100
        );

        const parsedManualFraudScore = Number(manualFraudScore);
        const effectiveManualFraudScore = mockRiskPreset
            ? Number(mockRiskPreset.fraudScore)
            : parsedManualFraudScore;
        const hasManualFraudScore = (isManualMode || Boolean(mockRiskPreset)) && Number.isFinite(effectiveManualFraudScore);

        if (hasManualFraudScore) {
            const appliedManualFraudScore = clamp(effectiveManualFraudScore, 0, 100);
            const manualReviewTier =
                appliedManualFraudScore >= 70 ? 'RED' :
                appliedManualFraudScore >= 45 ? 'YELLOW' : 'GREEN';
            const manualNextAction =
                appliedManualFraudScore >= 70 ? 'MANUAL_REVIEW' :
                appliedManualFraudScore >= 45 ? 'ASK_CONTEXT' : 'AUTO_APPROVE';

            const resolvedReviewTier = mockRiskPreset?.reviewTier || manualReviewTier;
            const resolvedNextAction = mockRiskPreset?.nextAction || manualNextAction;

            fraudAnalysis = {
                decision: appliedManualFraudScore >= 80 ? 'REJECTED' : 'APPROVED',
                score: appliedManualFraudScore,
                description: mockRiskPreset
                    ? `Mock risk preset (${mockRiskPreset.label}) was applied for deterministic workflow testing.`
                    : 'Manual fraud score was provided and applied for manual-entry simulation mode.',
                flags: appliedManualFraudScore >= 70 ? ['MANUAL_FRAUD_SCORE_HIGH'] : [],
                reviewTier: resolvedReviewTier,
                nextAction: resolvedNextAction,
                layers: {
                    manualScoreOverride: {
                        triggered: appliedManualFraudScore >= 70,
                        score: appliedManualFraudScore,
                        reason: mockRiskPreset
                            ? `Fraud score locked by mock preset: ${mockRiskPreset.label}.`
                            : 'Fraud score entered manually by user for manual mode.'
                    },
                    riskSignal: {
                        triggered: riskSignalScore >= 70,
                        score: riskSignalScore,
                        reason: `Derived risk signal from manual inputs (rain=${effectiveRainfall}, aqi=${effectiveAqi}, traffic=${traffic}).`
                    }
                },
                layerCount: 2,
                evidence: {
                    manualFraudScore: appliedManualFraudScore,
                    mode: mockRiskPreset ? 'mock-preset' : 'manual',
                    mockRiskPreset: mockRiskPreset?.label || null,
                    riskSignalScore
                }
            };
        } else {
        // Initialize ML model on first use
        if (!mlFraudDetectionModel.isLoaded) {
          await mlFraudDetectionModel.initialize();
        }

        // Get ML fraud score
        const mlFraudScore = await mlFraudDetectionModel.predictFraudScore({
          locationDistance: 0, // placeholder
          claimAmount: normalizedLostIncome,
          riskScore: clamp(
            Math.round(
              (effectiveRainfall > 0 ? effectiveRainfall / 2 : 0) +
              (effectiveAqi > 0 ? effectiveAqi / 10 : 0) +
              (Number(traffic) || 0) * 10
            ),
            0,
            100
          ),
          daysToExpiry: Math.max(0, Math.floor((candidatePolicy.expiryDate - new Date()) / (1000 * 60 * 60 * 24))),
          claimsInPast30days: 0, // Query from db if needed
          lossRatioPercent: incomeLossPercent
        });

        // Run hybrid fraud detection (ML + rules)
        fraudAnalysis = await fraudDetectionService.analyzeClaim({
            userId: user._id,
            policyId: candidatePolicy?._id || null,
            claimType: disruptionInRules ? effectiveDisruption : 'UNEXPECTED_EVENT',
            riskScore: riskSignalScore,
            triggerEvidence,
            expectedLoss: normalizedLostIncome,
            mlScore: mlFraudScore.score
        });

        // Log ML fraud score
        logger.info('ML fraud detection score', {
          userId: user._id,
          mlScore: mlFraudScore.score,
          model: mlFraudScore.model,
          interpretation: mlFraudScore.interpretation
        });
                }
    }

    const allFraudLayersPassed = policyPaymentVerified && fraudAnalysis.decision !== 'REJECTED';
    const shouldRejectCoverageReason = !disruptionInRules || !otherReasonValid;
    const shouldReject = !policyPaymentVerified || shouldRejectCoverageReason || !disruptionDetected || !incomeLossValidated || !allFraudLayersPassed;

    // Plan-based payout multipliers (basic low, standard med, premium high)
    const planMultipliers = {
      'GIG_BASIC': 0.6,
      'BASIC': 0.6,
      'GIG_STANDARD': 0.85,
      'STANDARD': 0.85,
      'GIG_PREMIUM': 1.1,
      'PREMIUM': 1.1
    };
const planKey = selectedPlan;
    const planMultiplier = planMultipliers[selectedPlan] || 0.85;
    const severityMultiplier =
        effectiveDisruption === 'FLOODING' || effectiveDisruption === 'CURFEW' ? 1.6 :
        effectiveDisruption === 'THUNDERSTORM' || effectiveDisruption === 'STRIKE' ? 1.4 :
        effectiveDisruption === 'HIGH_POLLUTION' ? 1.1 : 1.2;
    const demoDisruptionWindow = buildDisruptionWindow({
        start: req.body?.disruptionStartHour,
        end: req.body?.disruptionEndHour,
        durationHours: Number(req.body?.disruptionHours) || (effectiveDisruption === 'HEAVY_RAIN' ? 4 : 3),
    });
    const demoParsedShift = parseWorkingHours(user?.workingHours || '');
    const demoOverlapHours = demoParsedShift ? getOverlapHours(demoParsedShift, demoDisruptionWindow) : demoDisruptionWindow ? Number(req.body?.disruptionHours || 3) : 0;
    const demoDisruptionHours = Math.max(Number(req.body?.disruptionHours || 3), 0.1);
    const demoOverlapRatio = demoParsedShift ? clamp(demoOverlapHours / demoDisruptionHours, 0, 1) : 1;
    const hasOverlap = demoOverlapRatio > 0;

    const rawClaimAmount = Math.round(normalizedLostIncome * severityMultiplier * planMultiplier * demoOverlapRatio);
    const maxCoverage = {
      'GIG_BASIC': 600,
      'BASIC': 500,
      'GIG_STANDARD': 1200,
      'STANDARD': 1000,
      'GIG_PREMIUM': 2500,
      'PREMIUM': 2000
    }[selectedPlan] || 1200;
    const claimAmount = shouldReject || !hasOverlap ? 0 : Math.min(maxCoverage, rawClaimAmount);
    const computedRiskScore = clamp(
        Math.round(
            (effectiveRainfall > 0 ? effectiveRainfall / 2 : 0) +
            (effectiveAqi > 0 ? effectiveAqi / 10 : 0) +
            (Number(traffic) || 0) * 10
        ),
        0,
        100
    );

    const payoutRiskPolicy = (() => {
        const reviewTier = String(fraudAnalysis.reviewTier || '').toUpperCase();
        const nextAction = String(fraudAnalysis.nextAction || '').toUpperCase();

        if (
            (reviewTier === 'RED' || nextAction === 'MANUAL_REVIEW') &&
            (Number(fraudAnalysis.score || 0) >= 95 || computedRiskScore >= 95)
        ) {
            return {
                allowAutoPayout: false,
                capAmount: null,
                reason: 'Extreme-risk claim routed to manual review before payout.'
            };
        }

        if (
            reviewTier === 'RED' ||
            nextAction === 'MANUAL_REVIEW' ||
            Number(fraudAnalysis.score || 0) >= 75 ||
            computedRiskScore >= 80
        ) {
            return {
                allowAutoPayout: true,
                capAmount: 300,
                reason: 'High-risk claim allowed for strict capped auto payout.'
            };
        }

        if (
            reviewTier === 'YELLOW' ||
            nextAction === 'ASK_CONTEXT' ||
            Number(fraudAnalysis.score || 0) >= 55 ||
            computedRiskScore >= 65
        ) {
            return {
                allowAutoPayout: true,
                capAmount: 600,
                reason: 'Medium/high-risk claim allowed for capped auto payout.'
            };
        }

        return {
            allowAutoPayout: true,
            capAmount: null,
            reason: 'Risk lane allows full automated payout.'
        };
    })();

    const autoPayoutAmount = !shouldReject && payoutRiskPolicy.capAmount != null
        ? Math.min(claimAmount, payoutRiskPolicy.capAmount)
        : claimAmount;
    const autoPayoutCapApplied = !shouldReject && payoutRiskPolicy.capAmount != null && autoPayoutAmount < claimAmount;

    const workflow = {
        policyPaymentVerified: {
            passed: policyPaymentVerified,
            reason: policyPaymentVerified
                ? 'Active policy with completed payment was verified.'
                : 'No active paid policy found. Demo claim rejected at step 1.'
        },
        disruptionDetected: {
            passed: disruptionDetected,
            reason: disruptionDetected
                ? 'Disruption threshold validated by rules and sensor inputs.'
                : !policyPaymentVerified
                ? 'Skipped because policy payment verification failed.'
                : shouldRejectCoverageReason
                ? 'Reason is outside covered parametric rules.'
                : 'Trigger threshold not met for selected disruption.'
        },
        incomeLossValidated: {
            passed: incomeLossValidated,
            reason: incomeLossValidated
                ? `Income loss validated at ${incomeLossPercent}%.`
                : !policyPaymentVerified
                ? 'Skipped because policy payment verification failed.'
                : 'Income loss is below minimum validation threshold.'
        },
        fraudLayers: fraudAnalysis.layers,
        fraudDecision: {
            passed: allFraudLayersPassed,
            score: fraudAnalysis.score,
            reason: fraudAnalysis.description,
            reviewTier: fraudAnalysis.reviewTier,
            nextAction: fraudAnalysis.nextAction
        },
        payoutCalculated: {
            passed: !shouldReject,
            amount: claimAmount,
            plan: planKey,
            reason: shouldReject
                ? 'Claim rejected before payout calculation.'
                : !hasOverlap
                ? 'No disruption during working hours'
                : `Claim amount computed from selected plan, validated loss, overlap ratio ${demoOverlapRatio.toFixed(2)}, and review lane ${fraudAnalysis.reviewTier || 'GREEN'}.`
        },
        payoutSent: {
            passed: !shouldReject,
            reason: shouldReject ? 'No payout sent due to rejection.' : 'Payout queued for wallet transfer.'
        },
        payoutRiskPolicy: {
            passed: payoutRiskPolicy.allowAutoPayout,
            riskScore: computedRiskScore,
            fraudTier: fraudAnalysis.reviewTier || 'UNKNOWN',
            capAmount: payoutRiskPolicy.capAmount,
            reason: payoutRiskPolicy.reason,
        },
        notificationSent: {
            passed: true,
            reason: 'Push/in-app notification event emitted.'
        }
    };

    try {
        const automationBase = process.env.AUTOMATION_API_URL || 'http://localhost:3000';
        const deviceTokens = (user?.deviceTokens || [])
            .map((entry) => entry?.token)
            .filter((token) => typeof token === 'string' && token.trim().length > 0);
        await axios.post(`${automationBase}/api/v1/automation/notifications/send`, {
            userId: user._id,
            type: shouldReject ? 'claim_rejected' : 'claim_approved',
            message: shouldReject
                ? 'Demo claim rejected after workflow checks.'
                : `Demo claim approved. Payout estimate: Rs ${claimAmount}.`,
            data: {
                title: shouldReject ? 'Claim Rejected' : 'Claim Approved',
                severity: shouldReject ? 'MEDIUM' : 'INFO',
                zone: user.location || 'Your zone',
                claimAmount,
                selectedPlan: planKey,
                disruptionType: effectiveDisruption,
                fraudScore: fraudAnalysis.score,
                auditTrace: {
                    shift: user?.workingHours || null,
                    disruption: `${demoDisruptionWindow.startHour.toFixed(2)}-${demoDisruptionWindow.endHour.toFixed(2)}`,
                    overlapHours: Number(demoOverlapHours.toFixed(3)),
                    overlapRatio: Number(demoOverlapRatio.toFixed(3))
                }
            },
            deviceTokens
        }, { timeout: 5000 });
    } catch (error) {
        workflow.notificationSent = {
            passed: false,
            reason: 'Automation notification API unavailable; in-app notification fallback can be used.'
        };
    }

    // ====== AUTOMATED PAYOUT TRIGGER ======
    let claimRecord = null;
    let payoutStatus = 'pending';
    let payoutTransactionId = null;

    const motionConsentMissing = !Boolean(user?.activityConsent);
    const blockedByRiskPolicy = !payoutRiskPolicy.allowAutoPayout;
    if (motionConsentMissing) {
        workflow.payoutSent = {
            passed: false,
            reason: 'Automated payout blocked. Enable motion detection consent in profile settings.'
        };
        try {
            const automationBase = process.env.AUTOMATION_API_URL || 'http://localhost:3000';
            const deviceTokens = (user?.deviceTokens || [])
                .map((entry) => entry?.token)
                .filter((token) => typeof token === 'string' && token.trim().length > 0);
            await axios.post(`${automationBase}/api/v1/automation/notifications/send`, {
                userId: user._id,
                type: 'motion_consent_required',
                message: 'Enable motion detection to receive automated payouts.',
                data: {
                    title: 'Motion Detection Required',
                    severity: 'HIGH',
                    zone: user.location || 'Your zone'
                },
                deviceTokens
            }, { timeout: 5000 });
        } catch (error) {}
    }

    if (!shouldReject && !motionConsentMissing && blockedByRiskPolicy) {
        workflow.payoutSent = {
            passed: false,
            reason: 'Automated payout blocked by high-risk policy. Claim routed for manual review.'
        };

        try {
            claimRecord = await Claim.create({
                policyId: candidatePolicy._id,
                userId: user._id,
                claimType: effectiveDisruption,
                riskScore: computedRiskScore,
                sourceType: 'LIVE',
                triggerEvidence,
                fraudScore: fraudAnalysis.score,
                fraudFlags: fraudAnalysis.flags,
                fraudFlagDescription: fraudAnalysis.description,
                fraudReviewTier: fraudAnalysis.reviewTier || 'RED',
                fraudNextAction: 'MANUAL_REVIEW',
                fraudLayerEvidence: fraudAnalysis.layers,
                status: CLAIM_STATUS.UNDER_REVIEW,
                approvalNotes: 'Auto payout blocked by risk policy. Manual review required.'
            });

            payoutStatus = 'manual_review';
        } catch (manualReviewError) {
            logger.error('Failed to create manual-review claim for high-risk payout block', {
                userId: user._id,
                error: manualReviewError.message
            });
        }
    }

    if (!shouldReject && !motionConsentMissing && !blockedByRiskPolicy && allFraudLayersPassed && disruptionDetected && incomeLossValidated && claimAmount > 0) {
        try {
            // Create claim record
            claimRecord = await Claim.create({
                policyId: candidatePolicy._id,
                userId: user._id,
                claimType: effectiveDisruption,
                riskScore: computedRiskScore,
                sourceType: 'LIVE',
                triggerEvidence,
                fraudScore: fraudAnalysis.score,
                fraudFlags: fraudAnalysis.flags,
                fraudFlagDescription: fraudAnalysis.description,
                fraudReviewTier: fraudAnalysis.reviewTier || 'GREEN',
                fraudNextAction: 'AUTO_APPROVE',
                fraudLayerEvidence: fraudAnalysis.layers,
                status: CLAIM_STATUS.APPROVED,
                approvedAmount: autoPayoutAmount,
                approvedBy: 'SYSTEM_AUTO',
                approvalNotes: autoPayoutCapApplied
                    ? `Risk policy cap applied. Computed claim: Rs ${claimAmount}; auto payout capped to Rs ${autoPayoutAmount}.`
                    : 'Approved by automated payout lane.',
                reviewedAt: new Date()
            });

            logger.info('Claim auto-approved', {
                claimId: claimRecord._id,
                amount: claimAmount,
                disruption: effectiveDisruption
            });

            // Trigger automated payout
            try {
                const paymentDetails = await Payment.findOne({ userId: user._id });
                const payoutMethod = paymentDetails?.upiId
                    ? 'UPI'
                    : paymentDetails?.bankName
                    ? 'BANK_TRANSFER'
                    : 'WALLET';
                const payoutResult = await payoutService.processPayout({
                    userId: user._id,
                    claimId: claimRecord._id,
                    amount: autoPayoutAmount,
                    method: payoutMethod,
                    workerUPI: paymentDetails?.upiId || null,
                    beneficiaryBank: paymentDetails?.bankName || null,
                    beneficiaryAccountLast4: paymentDetails?.accountNumber ? paymentDetails.accountNumber.slice(-4) : null
                });

                // Update claim with payout info
                claimRecord.status = CLAIM_STATUS.PAID;
                claimRecord.payoutAmount = autoPayoutAmount;
                claimRecord.payoutMethod = payoutMethod;
                claimRecord.payoutDate = new Date();
                await claimRecord.save();

                payoutStatus = 'completed';
                payoutTransactionId = payoutResult?.transactionId || null;

                logger.info('Automated payout processed', {
                    claimId: claimRecord._id,
                    amount: autoPayoutAmount,
                    transactionId: payoutTransactionId
                });
            } catch (payoutError) {
                logger.error('Automated payout failed', {
                    claimId: claimRecord._id,
                    error: payoutError.message
                });
                payoutStatus = 'failed';
                claimRecord.status = CLAIM_STATUS.APPROVED; // Remains approved, manual payout later
                await claimRecord.save();
            }
        } catch (claimError) {
            logger.error('Failed to auto-approve claim', {
                userId: user._id,
                error: claimError.message
            });
        }
    }

    res.status(RESPONSE_CODES.SUCCESS).json({
        success: true,
        message: shouldReject ? 'Demo claim rejected by workflow checks' : 'Demo claim processed and AUTOMATICALLY APPROVED',
        data: {
            selectedPlan: planKey,
            riskLabel: toRiskLabel(fraudAnalysis.score),
            disruptionType: effectiveDisruption,
            baselineIncome,
            lostIncome: normalizedLostIncome,
            incomeLossPercent,
            approved: !shouldReject,
            rejectionReason: !policyPaymentVerified
                ? 'No active paid policy found. Please activate policy with payment before running demo claim.'
                : shouldRejectCoverageReason
                ? 'This disruption reason is outside policy rules. Income-loss payout rejected.'
                : !workerCanWork
                ? `Cannot work in current conditions: ${workerCapabilityCheck.issues.join('; ')}`
                : shouldReject
                ? 'Workflow checks failed'
                : null,
            claimAmount,
            fraudScore: fraudAnalysis.score,
            fraudFlags: fraudAnalysis.flags,
            workflow,
            automation: {
                claimCreated: claimRecord ? true : false,
                claimId: claimRecord?._id,
                payoutStatus: payoutStatus,
                transactionId: payoutTransactionId,
                autoPayoutTriggered: !shouldReject && !motionConsentMissing && !blockedByRiskPolicy && allFraudLayersPassed && disruptionDetected,
                motionConsentRequired: motionConsentMissing,
                riskPolicyBlocked: blockedByRiskPolicy,
                autoPayoutAmount,
                autoPayoutCapApplied,
                payoutRiskPolicyReason: payoutRiskPolicy.reason,
                mockRiskPresetApplied: mockRiskPreset?.label || null,
            }
        }
    });
});

module.exports = exports;






