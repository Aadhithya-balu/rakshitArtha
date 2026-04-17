const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'User ID is required'],
        index: true
    },
    accountHolderName: {
        type: String,
        trim: true,
        default: null
    },
    bankName: {
        type: String,
        trim: true,
        default: null
    },
    accountNumber: {
        type: String,
        trim: true,
        default: null
    },
    ifscCode: {
        type: String,
        trim: true,
        uppercase: true,
        default: null
    },
    upiId: {
        type: String,
        trim: true,
        lowercase: true,
        default: null
    },
    isVerified: {
        type: Boolean,
        default: false
    },
    verificationMethod: {
        type: String,
        enum: ['MANUAL', 'MICRO_DEPOSIT', null],
        default: 'MANUAL'
    },
    verifiedAt: {
        type: Date,
        default: null
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

paymentSchema.pre('save', function saveUpdatedAt(next) {
    this.updatedAt = new Date();
    if (this.isVerified && !this.verifiedAt) {
        this.verifiedAt = new Date();
    }
    next();
});

paymentSchema.index({ userId: 1 }, { unique: true });

module.exports = mongoose.model('Payment', paymentSchema);
