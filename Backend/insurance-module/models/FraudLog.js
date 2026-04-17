const mongoose = require('mongoose');

const fraudLogSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    policyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Policy'
    },
    claimId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Claim'
    },
    
    // Fraud Detection Details
    fraudType: {
        type: String,
        enum: [
            'LOCATION_MISMATCH',
            'CLAIM_FREQUENCY_ANOMALY',
            'AMOUNT_ANOMALY',
            'DUPLICATE_CLAIM',
            'VELOCITY_FRAUD',
            'PATTERN_ANOMALY',
            'DEVICE_MISMATCH',
            'TIME_ANOMALY',
            'BEHAVIORAL_ANOMALY',
            'PLATFORM_DATA_MISMATCH',
            'OFFICIAL_DATA_MISMATCH',
            'FRAUD_RING_PATTERN',
            'ML_ANOMALY'
        ],
        required: true
    },
    
    fraudScore: {
        type: Number,
        min: 0,
        max: 100,
        required: true
    },
    
    severity: {
        type: String,
        enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
        default: 'LOW'
    },
    
    // Detection Evidence
    evidence: {
        expectedLocation: String,
        actualLocation: String,
        distanceMismatch: Number,
        claimFrequency: Number,
        historicalClaimAmount: Number,
        currentClaimAmount: Number,
        anomalyPercentage: Number,
        details: mongoose.Schema.Types.Mixed
    },
    
    // Decision
    decision: {
        type: String,
        enum: ['APPROVED', 'FLAGGED_FOR_REVIEW', 'REJECTED', 'PENDING'],
        default: 'PENDING'
    },
    
    reviewedBy: String,
    reviewedAt: Date,
    reviewNotes: String,
    
    // Action Taken
    actionTaken: {
        type: String,
        enum: ['CLAIM_APPROVED', 'CLAIM_REJECTED', 'ACCOUNT_SUSPENDED', 'MANUAL_REVIEW_REQUIRED', 'NONE'],
        default: 'NONE'
    },
    
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

fraudLogSchema.index({ userId: 1, createdAt: -1 });
fraudLogSchema.index({ claimId: 1 });
fraudLogSchema.index({ fraudScore: -1 });
fraudLogSchema.index({ decision: 1 });

module.exports = mongoose.model('FraudLog', fraudLogSchema);
