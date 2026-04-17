const mongoose = require('mongoose');

const claimWorkflowSchema = new mongoose.Schema({
    claimId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Claim',
        required: true,
        unique: true,
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
        required: true,
        index: true
    },
    
    // Workflow Steps with complete status tracking
    steps: [{
        stepName: {
            type: String,
            enum: [
                'POLICY_VALIDATION',
                'DISRUPTION_DETECTION',
                'DURATION_CALCULATION',
                'LOSS_CALCULATION',
                'FRAUD_DETECTION',
                'CLAIM_CREATION',
                'PAYOUT_PROCESSING'
            ],
            required: true
        },
        status: {
            type: String,
            enum: ['SUCCESS', 'FAILED', 'PENDING'],
            default: 'PENDING'
        },
        timestamp: {
            type: Date,
            default: Date.now
        },
        message: String, // Detailed explanation
        reason: String, // If failed, why?
        data: mongoose.Schema.Types.Mixed, // Step-specific data
        duration: Number // Duration in ms
    }],

    // Current step
    currentStep: {
        type: String,
        enum: [
            'POLICY_VALIDATION',
            'DISRUPTION_DETECTION',
            'DURATION_CALCULATION',
            'LOSS_CALCULATION',
            'FRAUD_DETECTION',
            'CLAIM_CREATION',
            'PAYOUT_PROCESSING',
            'COMPLETED',
            'REJECTED'
        ],
        default: 'POLICY_VALIDATION'
    },

    // Overall workflow status
    overallStatus: {
        type: String,
        enum: ['IN_PROGRESS', 'COMPLETED', 'FAILED', 'REJECTED'],
        default: 'IN_PROGRESS'
    },

    // Rejection details (if workflow failed)
    rejectionDetails: {
        failedAtStep: String,
        reason: String,
        evidence: mongoose.Schema.Types.Mixed
    },

    // Timeline metadata
    startedAt: {
        type: Date,
        default: Date.now
    },
    completedAt: Date,
    totalDuration: Number, // in ms

    // Metadata
    claimType: String,
    claimStatus: String,
    triggerEvidence: mongoose.Schema.Types.Mixed,

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

claimWorkflowSchema.index({ claimId: 1 });
claimWorkflowSchema.index({ userId: 1 });
claimWorkflowSchema.index({ policyId: 1 });
claimWorkflowSchema.index({ overallStatus: 1 });
claimWorkflowSchema.index({ 'steps.status': 1 });

// Helper method to get all steps for timeline
claimWorkflowSchema.methods.getTimeline = function () {
    return this.steps.map(step => ({
        stepName: step.stepName,
        status: step.status,
        timestamp: step.timestamp,
        message: step.message,
        reason: step.reason
    }));
};

// Helper method to add a step
claimWorkflowSchema.methods.addStep = function (stepData) {
    this.steps.push({
        stepName: stepData.stepName,
        status: stepData.status,
        message: stepData.message,
        reason: stepData.reason,
        data: stepData.data,
        timestamp: new Date(),
        duration: stepData.duration || 0
    });
    this.currentStep = stepData.nextStep || stepData.stepName;
    this.updatedAt = new Date();
    return this;
};

// Helper method to mark workflow as completed
claimWorkflowSchema.methods.completeWorkflow = function () {
    this.overallStatus = 'COMPLETED';
    this.currentStep = 'COMPLETED';
    this.completedAt = new Date();
    this.totalDuration = this.completedAt - this.startedAt;
    this.updatedAt = new Date();
    return this;
};

// Helper method to mark workflow as failed/rejected
claimWorkflowSchema.methods.rejectWorkflow = function (failedAtStep, reason, evidence = null) {
    this.overallStatus = 'REJECTED';
    this.currentStep = 'REJECTED';
    this.completedAt = new Date();
    this.totalDuration = this.completedAt - this.startedAt;
    this.rejectionDetails = {
        failedAtStep,
        reason,
        evidence
    };
    this.updatedAt = new Date();
    return this;
};

module.exports = mongoose.model('ClaimWorkflow', claimWorkflowSchema);
