const Claim = require('../models/Claim');
const Policy = require('../models/Policy');
const Payout = require('../models/Payout');
const User = require('../models/User');
const DemoWorkflowRun = require('../models/DemoWorkflowRun');
const { asyncHandler, APIError } = require('../utils/errorHandler');
const { RESPONSE_CODES, ERRORS, POLICY_STATUS } = require('../utils/constants');

const DEMO_CLAIM_AMOUNT = 800;

function generatePayoutId() {
    const now = Date.now().toString(36).toUpperCase();
    const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `DEMO-${now}-${randomPart}`;
}

async function ensureDemoPolicy(userId) {
    let policy = await Policy.findOne({
        userId,
        status: POLICY_STATUS.ACTIVE,
        paymentStatus: 'PAID'
    }).sort({ updatedAt: -1, createdAt: -1 });

    if (policy) return policy;

    const now = new Date();
    const expiryDate = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000));

    policy = await Policy.create({
        userId,
        plan: 'GIG_STANDARD',
        workerType: 'GIG',
        sourceType: 'DEMO',
        status: POLICY_STATUS.ACTIVE,
        weeklyPremium: 99,
        coverageAmount: 2500,
        riskFactor: 1,
        startDate: now,
        expiryDate,
        paymentMode: 'WEEKLY',
        paymentStatus: 'PAID',
        paymentProvider: 'DEMO',
        amountPaid: 99,
        billingHistory: [{
            cycleStart: now,
            cycleEnd: expiryDate,
            amount: 99,
            status: 'PAID',
            provider: 'DEMO',
            paidAt: now
        }]
    });

    return policy;
}

function buildDemoSteps(startTime = new Date()) {
    const baseTime = startTime.getTime();
    const stepTemplate = [
        { stepKey: 'CLAIM_SUBMITTED', title: 'Claim Submitted', message: 'Worker claim request captured in system queue.' },
        { stepKey: 'ML_RISK_ANALYSIS', title: 'ML Risk Analysis', message: 'Risk model evaluated disruption and income-loss signals.' },
        { stepKey: 'FRAUD_DETECTION', title: 'Fraud Detection', message: 'Fraud layers passed with low anomaly score.' },
        { stepKey: 'AUTO_APPROVAL', title: 'Auto Approval', message: 'Rules engine auto-approved the claim for instant settlement.' },
        { stepKey: 'PAYOUT_INITIATED', title: 'Payout Initiated', message: 'Payout transaction created and marked successful.' },
        { stepKey: 'NOTIFICATION_SENT', title: 'Notification Sent', message: 'Push notification delivered to the worker app.' }
    ];

    return stepTemplate.map((step, index) => ({
        ...step,
        status: 'SUCCESS',
        timestamp: new Date(baseTime + (index * 1000))
    }));
}

exports.runDemoWorkflow = asyncHandler(async (req, res) => {
    const { userId } = req.body || {};

    if (!userId) {
        throw new APIError('User ID is required for demo workflow', RESPONSE_CODES.BAD_REQUEST);
    }

    const user = await User.findById(userId);
    if (!user) {
        throw new APIError(ERRORS.USER_NOT_FOUND, RESPONSE_CODES.NOT_FOUND);
    }

    const now = new Date();
    const steps = buildDemoSteps(now);

    const notification = {
        title: 'Claim Approved',
        message: 'Demo payout of Rs.800 has been credited successfully.',
        severity: 'INFO',
        sentAt: new Date(now.getTime() + 1200)
    };

    const demoRun = await DemoWorkflowRun.create({
        userId: user._id,
        policyId: null,
        claimId: null,
        payoutId: null,
        claimAmount: DEMO_CLAIM_AMOUNT,
        payoutAmount: DEMO_CLAIM_AMOUNT,
        notification,
        steps,
        status: 'COMPLETED'
    });

    return res.status(RESPONSE_CODES.SUCCESS).json({
        success: true,
        message: 'Deterministic demo workflow completed successfully.',
        data: {
            runId: demoRun._id,
            userId: user._id,
            claimId: null,
            payoutId: null,
            claimAmount: DEMO_CLAIM_AMOUNT,
            payoutAmount: DEMO_CLAIM_AMOUNT,
            steps,
            notification,
            workflowStatus: 'COMPLETED',
            insurerDashboardImpact: {
                totalClaimsIncrement: 0,
                totalPayoutIncrement: 0
            }
        }
    });
});

exports.getDemoState = asyncHandler(async (req, res) => {
    const userId = req.query.userId || req.params.userId;

    if (!userId) {
        throw new APIError('User ID is required to fetch demo state', RESPONSE_CODES.BAD_REQUEST);
    }

    const latestRun = await DemoWorkflowRun.findOne({ userId }).sort({ createdAt: -1 });

    return res.status(RESPONSE_CODES.SUCCESS).json({
        success: true,
        data: {
            active: Boolean(latestRun),
            run: latestRun
        }
    });
});

exports.resetDemoWorkflow = asyncHandler(async (req, res) => {
    const { userId } = req.body || {};

    if (!userId) {
        throw new APIError('User ID is required to reset demo workflow', RESPONSE_CODES.BAD_REQUEST);
    }

    const runDeleteResult = await DemoWorkflowRun.deleteMany({ userId });

    return res.status(RESPONSE_CODES.SUCCESS).json({
        success: true,
        message: 'Demo workflow data reset successfully.',
        data: {
            removedRuns: runDeleteResult.deletedCount || 0,
            removedClaims: 0,
            removedPayouts: 0
        }
    });
});
