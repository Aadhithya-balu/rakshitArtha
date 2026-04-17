const ClaimWorkflow = require('../models/ClaimWorkflow');
const FraudCheck = require('../models/FraudCheck');
const Claim = require('../models/Claim');
const { asyncHandler, APIError } = require('../utils/errorHandler');
const logger = require('../utils/logger');
const { RESPONSE_CODES, ERRORS } = require('../utils/constants');

/**
 * Get complete workflow for a claim
 * GET /claim/:claimId/workflow
 */
exports.getClaimWorkflow = asyncHandler(async (req, res) => {
    const { claimId } = req.params;

    const workflow = await ClaimWorkflow.findOne({ claimId })
        .populate('userId', 'name email')
        .populate('policyId', 'plan coverageAmount');

    if (!workflow) {
        throw new APIError('Workflow not found for this claim', RESPONSE_CODES.NOT_FOUND);
    }

    logger.debug('Claim workflow retrieved', { claimId });

    res.status(RESPONSE_CODES.SUCCESS).json({
        success: true,
        data: {
            claimId: workflow.claimId,
            userId: workflow.userId,
            policyId: workflow.policyId,
            claimType: workflow.claimType,
            claimStatus: workflow.claimStatus,
            overallStatus: workflow.overallStatus,
            currentStep: workflow.currentStep,
            startedAt: workflow.startedAt,
            completedAt: workflow.completedAt,
            totalDuration: workflow.totalDuration,
            steps: workflow.steps,
            timeline: workflow.getTimeline(),
            rejectionDetails: workflow.rejectionDetails,
            stepCount: workflow.steps.length,
            successCount: workflow.steps.filter(s => s.status === 'SUCCESS').length,
            failedCount: workflow.steps.filter(s => s.status === 'FAILED').length
        }
    });
});

/**
 * Get fraud checks for a claim
 * GET /claim/:claimId/fraud-checks
 */
exports.getClaimFraudChecks = asyncHandler(async (req, res) => {
    const { claimId } = req.params;

    const fraudCheck = await FraudCheck.findOne({ claimId });

    if (!fraudCheck) {
        throw new APIError('Fraud checks not found for this claim', RESPONSE_CODES.NOT_FOUND);
    }

    logger.debug('Claim fraud checks retrieved', { claimId });

    res.status(RESPONSE_CODES.SUCCESS).json({
        success: true,
        data: {
            claimId: fraudCheck.claimId,
            overallScore: fraudCheck.overallScore,
            overallStatus: fraudCheck.overallStatus,
            riskTier: fraudCheck.riskTier,
            fraudFlags: fraudCheck.fraudFlags,
            layers: fraudCheck.layers,
            layerDetails: fraudCheck.getLayerDetails(),
            summary: fraudCheck.summary,
            checkedAt: fraudCheck.checkedAt
        }
    });
});

/**
 * Get user's claim workflows
 * GET /user/:userId/claims/workflows
 */
exports.getUserClaimWorkflows = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { skip = 0, limit = 10, status } = req.query;

    const query = { userId };
    if (status) {
        query.overallStatus = status;
    }

    const workflows = await ClaimWorkflow.find(query)
        .sort({ createdAt: -1 })
        .skip(parseInt(skip))
        .limit(parseInt(limit));

    const total = await ClaimWorkflow.countDocuments(query);

    logger.debug('User claim workflows retrieved', { userId, count: workflows.length });

    res.status(RESPONSE_CODES.SUCCESS).json({
        success: true,
        data: workflows.map(workflow => ({
            claimId: workflow.claimId,
            claimType: workflow.claimType,
            overallStatus: workflow.overallStatus,
            currentStep: workflow.currentStep,
            startedAt: workflow.startedAt,
            completedAt: workflow.completedAt,
            totalDuration: workflow.totalDuration,
            stepCount: workflow.steps.length,
            successCount: workflow.steps.filter(s => s.status === 'SUCCESS').length,
            failedAtStep: workflow.rejectionDetails?.failedAtStep,
            rejectionReason: workflow.rejectionDetails?.reason
        })),
        pagination: {
            total,
            skip: parseInt(skip),
            limit: parseInt(limit)
        }
    });
});

/**
 * Get claim with workflow and fraud details
 * GET /claim/:claimId/complete-status
 */
exports.getClaimCompleteStatus = asyncHandler(async (req, res) => {
    const { claimId } = req.params;

    const claim = await Claim.findById(claimId)
        .populate('userId', 'name email phone')
        .populate('policyId', 'plan coverageAmount');

    if (!claim) {
        throw new APIError(ERRORS.CLAIM_NOT_FOUND, RESPONSE_CODES.NOT_FOUND);
    }

    const workflow = await ClaimWorkflow.findOne({ claimId });
    const fraudCheck = await FraudCheck.findOne({ claimId });

    logger.debug('Claim complete status retrieved', { claimId });

    res.status(RESPONSE_CODES.SUCCESS).json({
        success: true,
        data: {
            claim: {
                id: claim._id,
                type: claim.claimType,
                status: claim.status,
                amount: claim.approvedAmount || claim.payoutAmount,
                createdAt: claim.createdAt,
                rejectionReason: claim.rejectionReason
            },
            workflow: workflow ? {
                overallStatus: workflow.overallStatus,
                currentStep: workflow.currentStep,
                steps: workflow.steps,
                timeline: workflow.getTimeline(),
                rejectionDetails: workflow.rejectionDetails,
                completedAt: workflow.completedAt,
                totalDuration: workflow.totalDuration
            } : null,
            fraudCheck: fraudCheck ? {
                overallScore: fraudCheck.overallScore,
                overallStatus: fraudCheck.overallStatus,
                riskTier: fraudCheck.riskTier,
                fraudFlags: fraudCheck.fraudFlags,
                layers: fraudCheck.layers,
                layerDetails: fraudCheck.getLayerDetails(),
                summary: fraudCheck.summary
            } : null
        }
    });
});

/**
 * Internal: Create or update workflow for a claim (called from automation)
 * POST /claim/:claimId/workflow/init
 */
exports.initializeClaimWorkflow = asyncHandler(async (req, res) => {
    const { claimId } = req.params;
    const { claimType, userId, policyId, triggerEvidence } = req.body;

    let workflow = await ClaimWorkflow.findOne({ claimId });

    if (!workflow) {
        workflow = new ClaimWorkflow({
            claimId,
            userId,
            policyId,
            claimType,
            triggerEvidence,
            currentStep: 'POLICY_VALIDATION',
            overallStatus: 'IN_PROGRESS'
        });
    }

    await workflow.save();

    res.status(RESPONSE_CODES.SUCCESS).json({
        success: true,
        data: workflow
    });
});

/**
 * Internal: Log a workflow step
 * POST /claim/:claimId/workflow/step
 */
exports.logWorkflowStep = asyncHandler(async (req, res) => {
    const { claimId } = req.params;
    const { stepName, status, message, reason, data, nextStep, duration } = req.body;

    const workflow = await ClaimWorkflow.findOne({ claimId });
    if (!workflow) {
        throw new APIError('Workflow not found', RESPONSE_CODES.NOT_FOUND);
    }

    workflow.addStep({
        stepName,
        status,
        message,
        reason,
        data,
        nextStep,
        duration
    });

    await workflow.save();

    logger.debug('Workflow step logged', { claimId, stepName, status });

    res.status(RESPONSE_CODES.SUCCESS).json({
        success: true,
        data: workflow
    });
});

/**
 * Internal: Log fraud checks
 * POST /claim/:claimId/fraud-checks/log
 */
exports.logFraudChecks = asyncHandler(async (req, res) => {
    const { claimId } = req.params;
    const { userId, policyId, layers, overallScore, riskTier } = req.body;

    let fraudCheck = await FraudCheck.findOne({ claimId });

    if (!fraudCheck) {
        fraudCheck = new FraudCheck({
            claimId,
            userId,
            policyId,
            layers,
            overallScore,
            riskTier: riskTier || 'GREEN',
            overallStatus: overallScore >= 60 ? 'FAIL' : 'PASS'
        });
    } else {
        fraudCheck.layers = layers;
        fraudCheck.overallScore = overallScore;
        fraudCheck.riskTier = riskTier || 'GREEN';
        fraudCheck.overallStatus = overallScore >= 60 ? 'FAIL' : 'PASS';
    }

    // Calculate fraud flags
    const fraudFlags = [];
    Object.entries(fraudCheck.layers).forEach(([key, layer]) => {
        if (layer.status === 'FAIL') {
            const flagMap = {
                policyActiveCheck: 'POLICY_INACTIVE',
                locationValidation: 'LOCATION_MISMATCH',
                duplicateClaimCheck: 'DUPLICATE_CLAIM',
                activityValidation: 'BEHAVIORAL_ANOMALY',
                timeWindowValidation: 'IMPACT_MISMATCH',
                anomalyDetection: 'ML_ANOMALY'
            };
            if (flagMap[key]) {
                fraudFlags.push(flagMap[key]);
            }
        }
    });

    fraudCheck.fraudFlags = fraudFlags;
    fraudCheck.calculateSummary();

    await fraudCheck.save();

    logger.debug('Fraud checks logged', { claimId, overallScore });

    res.status(RESPONSE_CODES.SUCCESS).json({
        success: true,
        data: fraudCheck
    });
});

/**
 * Internal: Mark workflow as completed
 * PUT /claim/:claimId/workflow/complete
 */
exports.completeClaimWorkflow = asyncHandler(async (req, res) => {
    const { claimId } = req.params;

    const workflow = await ClaimWorkflow.findOne({ claimId });
    if (!workflow) {
        throw new APIError('Workflow not found', RESPONSE_CODES.NOT_FOUND);
    }

    workflow.completeWorkflow();
    await workflow.save();

    logger.debug('Workflow completed', { claimId });

    res.status(RESPONSE_CODES.SUCCESS).json({
        success: true,
        data: workflow
    });
});

/**
 * Internal: Mark workflow as rejected
 * PUT /claim/:claimId/workflow/reject
 */
exports.rejectClaimWorkflow = asyncHandler(async (req, res) => {
    const { claimId } = req.params;
    const { failedAtStep, reason, evidence } = req.body;

    const workflow = await ClaimWorkflow.findOne({ claimId });
    if (!workflow) {
        throw new APIError('Workflow not found', RESPONSE_CODES.NOT_FOUND);
    }

    workflow.rejectWorkflow(failedAtStep, reason, evidence);
    await workflow.save();

    logger.debug('Workflow rejected', { claimId, failedAtStep, reason });

    res.status(RESPONSE_CODES.SUCCESS).json({
        success: true,
        data: workflow
    });
});
