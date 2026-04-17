const loadEnv = require('../config/loadEnv');
const connectDB = require('../config/db');
const User = require('../models/User');
const Policy = require('../models/Policy');
const Claim = require('../models/Claim');
const RiskData = require('../models/RiskData');
const FraudLog = require('../models/FraudLog');

loadEnv();

async function main() {
    await connectDB();

    const demoEmails = ['demo.realtime.success@gigcover.ai', 'demo.realtime.fraud@gigcover.ai'];
    const existingUsers = await User.find({ email: { $in: demoEmails } }).select('_id');
    const existingUserIds = existingUsers.map((user) => user._id);

    if (existingUserIds.length) {
        await FraudLog.deleteMany({ userId: { $in: existingUserIds } });
        await Claim.deleteMany({ userId: { $in: existingUserIds } });
        await Policy.deleteMany({ userId: { $in: existingUserIds } });
        await RiskData.deleteMany({ userId: { $in: existingUserIds } });
        await User.deleteMany({ _id: { $in: existingUserIds } });
    }

    const [successUser, fraudUser] = await User.create([
        {
            name: 'Realtime Success Demo',
            email: 'demo.realtime.success@gigcover.ai',
            phone: '9000000001',
            location: 'Whitefield, Bengaluru, IN',
            latitude: 12.9698,
            longitude: 77.7500,
            workerType: 'GIG',
            platform: 'ZOMATO',
            dailyIncome: 1200,
            accountStatus: 'ACTIVE',
            kyc: {
                verified: true,
                verifiedAt: new Date(),
                documentType: 'AADHAR'
            }
        },
        {
            name: 'Realtime Fraud Demo',
            email: 'demo.realtime.fraud@gigcover.ai',
            phone: '9000000002',
            location: 'Whitefield, Bengaluru, IN',
            latitude: 12.9698,
            longitude: 77.7500,
            workerType: 'GIG',
            platform: 'ZOMATO',
            dailyIncome: 250,
            accountStatus: 'ACTIVE',
            kyc: {
                verified: true,
                verifiedAt: new Date(),
                documentType: 'AADHAR'
            }
        }
    ]);

    const policyBase = {
        plan: 'GIG_PREMIUM',
        workerType: 'GIG',
        status: 'ACTIVE',
        weeklyPremium: 45,
        coverageAmount: 2000,
        riskFactor: 1,
        triggerTypes: ['HEAVY_RAIN', 'HIGH_POLLUTION', 'TRAFFIC_BLOCKED'],
        triggerThresholds: {
            rainfall: 50,
            aqi: 200,
            blockageRadius: 2
        },
        startDate: new Date(),
        expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        paymentMode: 'WEEKLY',
        paymentStatus: 'PAID',
        paymentProvider: 'RAZORPAY',
        amountPaid: 45,
        lastPaymentId: 'demo-payment-paid',
        lastPaymentAt: new Date(),
        nextPaymentDue: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        billingHistory: [{
            cycleStart: new Date(),
            cycleEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            amount: 45,
            status: 'PAID',
            provider: 'RAZORPAY',
            razorpayPaymentId: 'demo-payment-paid',
            paidAt: new Date()
        }]
    };

    const successPolicy = await Policy.create({
        ...policyBase,
        userId: successUser._id
    });

    const fraudPolicy = await Policy.create({
        ...policyBase,
        userId: fraudUser._id
    });

    const now = Date.now();
    await Claim.create([
        {
            policyId: fraudPolicy._id,
            userId: fraudUser._id,
            claimType: 'TRAFFIC_BLOCKED',
            status: 'APPROVED',
            riskScore: 78,
            fraudScore: 10,
            triggerEvidence: {
                weatherData: { rainfall: 0, aqi: 150, temperature: 30, timestamp: new Date(now - 20 * 60 * 1000) },
                locationData: { latitude: 12.9698, longitude: 77.7500, address: 'Whitefield, Bengaluru, IN', timestamp: new Date(now - 20 * 60 * 1000) },
                activityData: { deliveriesCompleted: 4, workingHours: 3, timestamp: new Date(now - 20 * 60 * 1000) }
            },
            approvedAmount: 500,
            reviewedAt: new Date(now - 20 * 60 * 1000)
        },
        {
            policyId: fraudPolicy._id,
            userId: fraudUser._id,
            claimType: 'HIGH_POLLUTION',
            status: 'APPROVED',
            riskScore: 74,
            fraudScore: 15,
            triggerEvidence: {
                weatherData: { rainfall: 0, aqi: 240, temperature: 31, timestamp: new Date(now - 10 * 60 * 1000) },
                locationData: { latitude: 12.9698, longitude: 77.7500, address: 'Whitefield, Bengaluru, IN', timestamp: new Date(now - 10 * 60 * 1000) },
                activityData: { deliveriesCompleted: 5, workingHours: 3, timestamp: new Date(now - 10 * 60 * 1000) }
            },
            approvedAmount: 550,
            reviewedAt: new Date(now - 10 * 60 * 1000)
        }
    ]);

    console.log(JSON.stringify({
        successUserId: String(successUser._id),
        successPolicyId: String(successPolicy._id),
        fraudUserId: String(fraudUser._id),
        fraudPolicyId: String(fraudPolicy._id)
    }, null, 2));

    process.exit(0);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
