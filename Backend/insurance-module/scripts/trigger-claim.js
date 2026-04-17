const connectDB = require('../config/db');
const User = require('../models/User');
const Policy = require('../models/Policy');
const Claim = require('../models/Claim');
const RiskData = require('../models/RiskData');
const { fraudDetectionService } = require('../services/fraudDetectionService');
const { payoutService } = require('../services/payoutService');
const { CLAIM_STATUS, POLICY_STATUS } = require('../utils/constants');

const ALLOWED_FLAGS = new Set([
    'LOCATION_MISMATCH',
    'FREQUENCY_ANOMALY',
    'AMOUNT_ANOMALY',
    'DUPLICATE_CLAIM'
]);

function parseArgs() {
    const args = process.argv.slice(2);
    const result = { email: null, type: 'HEAVY_RAIN' };
    for (let i = 0; i < args.length; i += 1) {
        const arg = args[i];
        const next = args[i + 1];
        if (arg === '--email' && next) {
            result.email = next;
            i += 1;
        } else if (arg === '--type' && next) {
            result.type = next;
            i += 1;
        }
    }
    return result;
}

async function run() {
    const { email, type } = parseArgs();
    if (!email) {
        throw new Error('Usage: node scripts/trigger-claim.js --email user@example.com --type HEAVY_RAIN');
    }

    await connectDB();

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
        throw new Error(`User not found for email ${email}`);
    }

    const policy = await Policy.findOne({ userId: user._id, status: POLICY_STATUS.ACTIVE }).sort({ createdAt: -1 });
    if (!policy) {
        throw new Error(`No active policy found for ${email}`);
    }

    const latestRisk = await RiskData.findOne({ userId: user._id }).sort({ createdAt: -1, timestamp: -1 });
    const riskScore = latestRisk?.riskMetrics?.overallRisk ?? 35;
    const triggerEvidence = {
        weatherData: {
            rainfall: latestRisk?.weatherData?.rainfall ?? (type === 'HEAVY_RAIN' ? 85 : 0),
            aqi: latestRisk?.weatherData?.aqi ?? (type === 'HIGH_POLLUTION' ? 210 : 80),
            temperature: latestRisk?.weatherData?.temperature ?? 30,
            timestamp: latestRisk?.timestamp || new Date()
        },
        locationData: {
            latitude: latestRisk?.locationData?.latitude ?? user.latitude,
            longitude: latestRisk?.locationData?.longitude ?? user.longitude,
            address: latestRisk?.locationData?.address || user.location,
            timestamp: latestRisk?.timestamp || new Date()
        },
        activityData: {
            deliveriesCompleted: latestRisk?.activityData?.activeDeliveries ?? (type === 'TRAFFIC_BLOCKED' ? 2 : 6),
            workingHours: latestRisk?.activityData?.workingHours ?? 6,
            timestamp: latestRisk?.timestamp || new Date()
        }
    };

    const fraudAnalysis = await fraudDetectionService.analyzeClaim({
        userId: user._id,
        policyId: policy._id,
        claimType: type,
        riskScore,
        triggerEvidence,
        expectedLoss: Math.round(policy.coverageAmount * 0.3)
    });

    const filteredFlags = (fraudAnalysis.flags || []).filter((flag) => ALLOWED_FLAGS.has(flag));
    const approvedAmount = Math.min(policy.coverageAmount, Math.round(policy.coverageAmount * 0.35));

    const claim = await Claim.create({
        policyId: policy._id,
        userId: user._id,
        claimType: type,
        riskScore,
        triggerEvidence,
        fraudScore: fraudAnalysis.score,
        fraudFlags: filteredFlags,
        fraudFlagDescription: fraudAnalysis.description,
        status: fraudAnalysis.decision === 'REJECTED' ? CLAIM_STATUS.REJECTED : CLAIM_STATUS.APPROVED,
        approvedAmount: fraudAnalysis.decision === 'REJECTED' ? 0 : approvedAmount,
        approvalNotes: fraudAnalysis.decision === 'REJECTED' ? undefined : 'Manual terminal trigger',
        approvedBy: fraudAnalysis.decision === 'REJECTED' ? undefined : 'TERMINAL_TEST',
        reviewedAt: new Date(),
        rejectionReason: fraudAnalysis.decision === 'REJECTED'
            ? 'Rejected by fraud detection'
            : undefined
    });

    if (fraudAnalysis.decision === 'APPROVED') {
        await payoutService.processPayout({
            userId: user._id,
            claimId: claim._id,
            amount: approvedAmount,
            method: 'WALLET'
        });
        claim.status = CLAIM_STATUS.PAID;
        claim.payoutAmount = approvedAmount;
        claim.payoutMethod = 'WALLET';
        claim.payoutDate = new Date();
        await claim.save();
    }

    console.log(JSON.stringify({
        success: true,
        claimId: String(claim._id),
        status: claim.status,
        payoutAmount: claim.payoutAmount || 0,
        fraudScore: claim.fraudScore,
        fraudFlags: claim.fraudFlags
    }, null, 2));
}

run()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error.message || error);
        process.exit(1);
    });
