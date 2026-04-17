const mongoose = require('mongoose');

const payoutSchema = new mongoose.Schema({
    payoutId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    referenceId: {
        type: String,
        required: true,
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    claimId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Claim',
        required: true,
        index: true
    },
    sourceType: {
        type: String,
        enum: ['LIVE', 'DEMO'],
        default: 'LIVE'
    },
    grossAmount: {
        type: Number,
        required: true,
        min: 0
    },
    fee: {
        type: Number,
        default: 0,
        min: 0
    },
    netAmount: {
        type: Number,
        required: true,
        min: 0
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    method: {
        type: String,
        enum: ['BANK_TRANSFER', 'UPI', 'WALLET', 'CHEQUE'],
        required: true
    },
    workerUPI: {
        type: String,
        default: null
    },
    beneficiaryBank: {
        type: String,
        default: null
    },
    beneficiaryAccountLast4: {
        type: String,
        default: null
    },
    status: {
        type: String,
        enum: ['PENDING', 'PROCESSING', 'SUCCESS', 'FAILED'],
        default: 'PENDING',
        index: true
    },
    retryCount: {
        type: Number,
        default: 0,
        min: 0
    },
    lastFailureReason: {
        type: String,
        default: null
    },
    completedAt: {
        type: Date,
        default: null
    },
    failedAt: {
        type: Date,
        default: null
    },
    statusHistory: [{
        status: {
            type: String,
            enum: ['PENDING', 'PROCESSING', 'SUCCESS', 'FAILED'],
            required: true
        },
        timestamp: {
            type: Date,
            default: Date.now
        },
        message: {
            type: String,
            default: ''
        }
    }],
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

payoutSchema.pre('save', function saveUpdatedAt(next) {
    this.updatedAt = new Date();
    next();
});

payoutSchema.index({ userId: 1, createdAt: -1 });
payoutSchema.index({ claimId: 1 });
payoutSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Payout', payoutSchema);
