const mongoose = require('mongoose');

const demoWorkflowStepSchema = new mongoose.Schema({
    stepKey: {
        type: String,
        required: true
    },
    title: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['PENDING', 'RUNNING', 'SUCCESS', 'FAILED'],
        default: 'SUCCESS'
    },
    message: {
        type: String,
        required: true
    },
    timestamp: {
        type: Date,
        required: true
    }
}, { _id: false });

const demoWorkflowRunSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    policyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Policy',
        default: null
    },
    claimId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Claim',
        default: null
    },
    payoutId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Payout',
        default: null
    },
    claimAmount: {
        type: Number,
        default: 800
    },
    payoutAmount: {
        type: Number,
        default: 800
    },
    notification: {
        title: String,
        message: String,
        severity: {
            type: String,
            default: 'INFO'
        },
        sentAt: Date
    },
    steps: [demoWorkflowStepSchema],
    status: {
        type: String,
        enum: ['COMPLETED', 'RESET'],
        default: 'COMPLETED'
    },
    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

demoWorkflowRunSchema.pre('save', function onSave(next) {
    this.updatedAt = new Date();
    next();
});

demoWorkflowRunSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('DemoWorkflowRun', demoWorkflowRunSchema);
