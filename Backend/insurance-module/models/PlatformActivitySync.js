const mongoose = require('mongoose');

const platformActivitySyncSchema = new mongoose.Schema(
    {
        sourcePlatform: {
            type: String,
            enum: ['SWIGGY', 'ZOMATO', 'UBER'],
            required: true,
            index: true,
        },
        platformUserId: {
            type: String,
            required: true,
            trim: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        weeklyIncome: {
            type: Number,
            required: true,
            min: 0,
        },
        weeklyHours: {
            type: Number,
            required: true,
            min: 0,
        },
        activityStatus: {
            type: String,
            default: 'UNKNOWN',
            index: true,
        },
        activeOrders: {
            type: Number,
            default: 0,
            min: 0,
        },
        earnings: {
            type: Number,
            default: 0,
            min: 0,
        },
        rideOrOrderCount: {
            type: Number,
            default: 0,
            min: 0,
        },
        idleDuration: {
            type: Number,
            default: null,
        },
        avgOrdersPerHour: {
            type: Number,
            default: null,
        },
        earningsTrend: {
            type: Number,
            default: null,
        },
        lastActive: {
            type: Date,
            default: null,
        },
        syncTimestamp: {
            type: Date,
            default: Date.now,
            index: true,
        },
        lastUpdated: {
            type: Date,
            default: Date.now,
            index: true,
        },
        location: {
            city: { type: String, default: null },
            latitude: { type: Number, default: null },
            longitude: { type: Number, default: null },
            label: { type: String, default: null },
        },
        authType: {
            type: String,
            enum: ['oauth2', 'api-key', 'mock', 'webhook'],
            default: 'mock',
        },
        syncStatus: {
            type: String,
            enum: ['SUCCESS', 'FAILED', 'SKIPPED'],
            default: 'SUCCESS',
            index: true,
        },
        errorMessage: {
            type: String,
            default: null,
        },
        lastAutomationSyncAt: {
            type: Date,
            default: null,
        },
        rawPayload: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

platformActivitySyncSchema.index({ sourcePlatform: 1, platformUserId: 1 }, { unique: true });
platformActivitySyncSchema.index({ userId: 1, syncTimestamp: -1 });

module.exports = mongoose.model('PlatformActivitySync', platformActivitySyncSchema);