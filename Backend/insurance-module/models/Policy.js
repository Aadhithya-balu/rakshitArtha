const mongoose = require('mongoose');

const policySchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'User ID is required']
    },
    plan: {
        type: String,
        enum: ['BASIC', 'STANDARD', 'PREMIUM', 'GIG_BASIC', 'GIG_STANDARD', 'GIG_PREMIUM'],
        required: [true, 'Plan is required']
    },
    workerType: {
        type: String,
        enum: ['GIG', 'EMPLOYEE'],
        default: 'GIG'
    },
    status: {
        type: String,
        enum: ['ACTIVE', 'SUSPENDED', 'EXPIRED', 'CANCELLED'],
        default: 'ACTIVE'
    },
    // Premium & Coverage
    weeklyPremium: {
        type: Number,
        required: true,
        min: 0
    },
    coverageAmount: {
        type: Number,
        required: true,
        min: 0
    },
    riskFactor: {
        type: Number,
        default: 1,
        min: 0.5,
        max: 2.0
    },
    
    // Policy Duration
    startDate: {
        type: Date,
        default: Date.now
    },
    expiryDate: {
        type: Date,
        required: true
    },
    
    // Triggers & Coverage
    triggerTypes: [{
        type: String,
        enum: ['HEAVY_RAIN', 'HIGH_POLLUTION', 'DISASTER', 'TRAFFIC_BLOCKED']
    }],
    triggerThresholds: {
        rainfall: { type: Number, default: 50 },  // mm
        aqi: { type: Number, default: 200 },
        blockageRadius: { type: Number, default: 2 }  // km
    },
    
    // Payment Terms
    paymentMode: {
        type: String,
        enum: ['WEEKLY', 'MONTHLY'],
        default: 'WEEKLY'
    },
    paymentStatus: {
        type: String,
        enum: ['PENDING', 'PAID', 'FAILED'],
        default: 'PENDING'
    },
    paymentProvider: {
        type: String,
        enum: ['RAZORPAY', 'DEMO'],
        default: 'RAZORPAY'
    },
    sourceType: {
        type: String,
        enum: ['LIVE', 'DEMO'],
        default: 'LIVE'
    },
    normalizedPlanCode: {
        type: String,
        default: null
    },
    lockedPayableAmount: {
        type: Number,
        min: 0,
        default: null
    },
    pricingBreakdown: {
        normalizedPlan: String,
        basePremium: Number,
        baseCoverage: Number,
        riskFactor: Number,
        riskMultiplierApplied: Number,
        seasonalMultiplierApplied: Number,
        workerMultiplierApplied: Number,
        dynamicPlan: Boolean
    },
    razorpayOrderId: String,
    lastPaymentId: String,
    lastPaymentAt: Date,
    nextPaymentDue: Date,
    amountPaid: { type: Number, default: 0 },
    billingHistory: [{
        cycleStart: Date,
        cycleEnd: Date,
        amount: Number,
        status: {
            type: String,
            enum: ['PENDING', 'PAID', 'FAILED'],
            default: 'PENDING'
        },
        provider: {
            type: String,
            enum: ['RAZORPAY', 'DEMO'],
            default: 'RAZORPAY'
        },
        razorpayOrderId: String,
        razorpayPaymentId: String,
        paidAt: Date
    }],
    
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

policySchema.index({ userId: 1 });
policySchema.index({ status: 1 });
policySchema.index({ expiryDate: 1 });

module.exports = mongoose.model('Policy', policySchema);
