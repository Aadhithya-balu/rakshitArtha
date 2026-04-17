const mongoose = require('mongoose');

const fraudCheckSchema = new mongoose.Schema({
    claimId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Claim',
        required: true,
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    policyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Policy',
        required: true
    },

    // Overall fraud assessment
    overallScore: {
        type: Number,
        min: 0,
        max: 100,
        required: true
    },
    overallStatus: {
        type: String,
        enum: ['PASS', 'FAIL', 'MANUAL_REVIEW'],
        default: 'PASS'
    },
    riskTier: {
        type: String,
        enum: ['GREEN', 'YELLOW', 'RED'],
        default: 'GREEN'
    },

    // 6-Layer Fraud Detection Results
    layers: {
        // Layer 1: Policy Active Check
        policyActiveCheck: {
            layerName: { type: String, default: 'Policy Active Check' },
            status: { type: String, enum: ['PASS', 'FAIL'], default: 'PASS' },
            score: { type: Number, min: 0, max: 100, default: 0 },
            explanation: String,
            details: {
                policyStatus: String,
                isActive: Boolean,
                expiryDate: Date,
                paymentStatus: String
            }
        },

        // Layer 2: Location Validation
        locationValidation: {
            layerName: { type: String, default: 'Location Validation' },
            status: { type: String, enum: ['PASS', 'FAIL'], default: 'PASS' },
            score: { type: Number, min: 0, max: 100, default: 0 },
            explanation: String,
            details: {
                gpsSpoofingDetected: Boolean,
                suddenTravelDetected: Boolean,
                claimLatitude: Number,
                claimLongitude: Number,
                userLatitude: Number,
                userLongitude: Number,
                distanceKm: Number,
                speedMph: Number,
                isWithinZone: Boolean
            }
        },

        // Layer 3: Duplicate Claim Check
        duplicateClaimCheck: {
            layerName: { type: String, default: 'Duplicate Claim Check' },
            status: { type: String, enum: ['PASS', 'FAIL'], default: 'PASS' },
            score: { type: Number, min: 0, max: 100, default: 0 },
            explanation: String,
            details: {
                previousClaimsCount: Number,
                recentApprovedClaims: [{
                    claimId: mongoose.Schema.Types.ObjectId,
                    claimType: String,
                    approvedDate: Date
                }],
                overlapPeriod: String,
                isDuplicate: Boolean
            }
        },

        // Layer 4: Activity Validation (Motion/Activity Detection)
        activityValidation: {
            layerName: { type: String, default: 'Activity Validation' },
            status: { type: String, enum: ['PASS', 'FAIL'], default: 'PASS' },
            score: { type: Number, min: 0, max: 100, default: 0 },
            explanation: String,
            details: {
                motionDetected: Boolean,
                accelerometerVariance: Number,
                idleRatio: Number,
                motionConsistencyScore: Number,
                expectedBehavior: String,
                anomalies: [String]
            }
        },

        // Layer 5: Time Window Validation (Overlapping Claims)
        timeWindowValidation: {
            layerName: { type: String, default: 'Time Window Validation' },
            status: { type: String, enum: ['PASS', 'FAIL'], default: 'PASS' },
            score: { type: Number, min: 0, max: 100, default: 0 },
            explanation: String,
            details: {
                claimTime: Date,
                overlapWindow: String,
                overlappingClaims: [{
                    claimId: mongoose.Schema.Types.ObjectId,
                    claimType: String,
                    time: Date
                }],
                hasOverlap: Boolean,
                timeConsistency: String
            }
        },

        // Layer 6: Anomaly Detection (Pattern-Based or AI)
        anomalyDetection: {
            layerName: { type: String, default: 'Anomaly Detection' },
            status: { type: String, enum: ['PASS', 'FAIL'], default: 'PASS' },
            score: { type: Number, min: 0, max: 100, default: 0 },
            explanation: String,
            details: {
                mlScore: Number,
                mlConfidence: Number,
                anomalousPatterns: [String],
                behavioralAnomalies: [String],
                fraudRingPattern: Boolean,
                mlComponents: mongoose.Schema.Types.Mixed
            }
        }
    },

    // Triggered Fraud Flags
    fraudFlags: {
        type: [String],
        enum: [
            'LOCATION_MISMATCH',
            'BEHAVIORAL_PHYSICS_MISMATCH',
            'BEHAVIORAL_ANOMALY',
            'APPROX_PLATFORM_MISMATCH',
            'PLATFORM_DATA_MISMATCH',
            'IMPACT_MISMATCH',
            'OFFICIAL_DATA_MISMATCH',
            'FRAUD_RING_PATTERN',
            'ML_ANOMALY',
            'DUPLICATE_CLAIM',
            'POLICY_INACTIVE',
            'GPS_SPOOFING'
        ],
        default: []
    },

    // Summary
    summary: {
        passedLayers: Number,
        failedLayers: Number,
        totalLayers: { type: Number, default: 6 },
        riskAssessment: String
    },

    // Metadata
    checkedAt: { type: Date, default: Date.now },
    evidence: mongoose.Schema.Types.Mixed,

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

fraudCheckSchema.index({ claimId: 1 });
fraudCheckSchema.index({ userId: 1 });
fraudCheckSchema.index({ policyId: 1 });
fraudCheckSchema.index({ overallStatus: 1 });
fraudCheckSchema.index({ riskTier: 1 });

// Helper method to calculate summary
fraudCheckSchema.methods.calculateSummary = function () {
    const layers = Object.keys(this.layers);
    const passedLayers = layers.filter(key => this.layers[key].status === 'PASS').length;
    const failedLayers = layers.filter(key => this.layers[key].status === 'FAIL').length;

    this.summary = {
        passedLayers,
        failedLayers,
        totalLayers: 6,
        riskAssessment: failedLayers === 0 ? 'LOW RISK' : failedLayers >= 2 ? 'HIGH RISK' : 'MEDIUM RISK'
    };

    return this;
};

// Helper method to get layer details for display
fraudCheckSchema.methods.getLayerDetails = function () {
    return Object.entries(this.layers).map(([key, layer]) => ({
        id: key,
        name: layer.layerName,
        status: layer.status,
        score: layer.score,
        explanation: layer.explanation,
        details: layer.details
    }));
};

module.exports = mongoose.model('FraudCheck', fraudCheckSchema);
