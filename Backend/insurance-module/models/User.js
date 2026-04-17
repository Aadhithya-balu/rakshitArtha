const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Name is required'],
        trim: true,
        minlength: [2, 'Name must be at least 2 characters']
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        lowercase: true,
        match: [/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/, 'Invalid email format']
    },
    phone: {
        type: String,
        required: [true, 'Phone is required'],
        match: [/^[0-9]{10}$/, 'Phone must be 10 digits']
    },
    location: {
        type: String,
        required: [true, 'Location is required']
    },
    latitude: Number,
    longitude: Number,
    workerType: {
        type: String,
        enum: ['GIG', 'EMPLOYEE'],
        default: 'GIG'
    },
    role: {
        type: String,
        enum: ['WORKER', 'INSURER_ADMIN'],
        default: 'WORKER'
    },
    platform: {
        type: String,
        enum: ['SWIGGY', 'ZOMATO', 'UBER', 'RIKSHAW', 'OTHER'],
        required: true
    },
    city: {
        type: String,
        default: null
    },
    deliveryZone: {
        type: String,
        default: null
    },
    zoneType: {
        type: String,
        default: null
    },
    workingHours: {
        type: String,
        default: null
    },
    workStartHour: {
        type: Number,
        min: 0,
        max: 23,
        default: null
    },
    workEndHour: {
        type: Number,
        min: 0,
        max: 23,
        default: null
    },
    isOvernightShift: {
        type: Boolean,
        default: false
    },
    workingDays: {
        type: String,
        default: null
    },
    avgDailyHours: {
        type: String,
        default: null
    },
    dailyIncome: {
        type: Number,
        default: null
    },
    activityConsent: {
        type: Boolean,
        default: false
    },
    weatherCrossCheckConsent: {
        type: Boolean,
        default: true
    },
    activityTelemetry: {
        accelerometerVariance: { type: Number, default: null },
        idleRatio: { type: Number, default: null },
        foregroundAppMinutes: { type: Number, default: null },
        motionConsistencyScore: { type: Number, default: null },
        sampleCount: { type: Number, default: 0 },
        collectedAt: { type: Date, default: null },
        deviceMotionAvailable: { type: Boolean, default: false },
        sourcePlatform: { type: String, default: null },
        activityStatus: { type: String, default: null },
        activityFactor: { type: Number, default: null },
        activeOrders: { type: Number, default: null },
        earnings: { type: Number, default: null },
        idleDuration: { type: Number, default: null },
        avgOrdersPerHour: { type: Number, default: null },
        earningsTrend: { type: Number, default: null },
        lastUpdated: { type: Date, default: null }
    },
    activityStateHistory: [{
        state: {
            type: String,
            enum: ['MOVING', 'IDLE', 'WALKING'],
            required: true
        },
        recordedAt: { type: Date, default: Date.now },
        source: { type: String, default: 'foreground-service' },
        accelerometerVariance: { type: Number, default: null },
        idleRatio: { type: Number, default: null },
        motionConsistencyScore: { type: Number, default: null },
        sampleCount: { type: Number, default: 0 },
        deviceMotionAvailable: { type: Boolean, default: false }
    }],
    currentActivityState: {
        state: {
            type: String,
            enum: ['MOVING', 'IDLE', 'WALKING'],
            default: 'IDLE'
        },
        recordedAt: { type: Date, default: null },
        source: { type: String, default: 'foreground-service' },
        accelerometerVariance: { type: Number, default: null },
        idleRatio: { type: Number, default: null },
        motionConsistencyScore: { type: Number, default: null },
        sampleCount: { type: Number, default: 0 },
        deviceMotionAvailable: { type: Boolean, default: false }
    },
    kyc: {
        verified: { type: Boolean, default: false },
        verifiedAt: Date,
        documentType: String,
        documentIdMasked: String,
        documentImage: String,
        profileImage: String
    },
    profileImage: {
        type: String,
        default: null
    },
    themePreference: {
        type: String,
        enum: ['light', 'dark', 'system'],
        default: 'system'
    },
    deviceTokens: [{
        token: { type: String, required: true },
        platform: { type: String, default: 'web' },
        createdAt: { type: Date, default: Date.now }
    }],
    notificationPreferences: {
        email: { type: Boolean, default: true },
        sms: { type: Boolean, default: false },
        push: { type: Boolean, default: true }
    },
    riskProfile: {
        historicalClaims: { type: Number, default: 0 },
        fraudScore: { type: Number, default: 0, min: 0, max: 100 },
        reputationScore: { type: Number, default: 100 }
    },
    insurerLoginDetails: {
        lastLoginAt: { type: Date, default: null },
        lastLoginIp: { type: String, default: null },
        lastLoginUserAgent: { type: String, default: null },
        loginCount: { type: Number, default: 0 }
    },
    accountStatus: {
        type: String,
        enum: ['ACTIVE', 'SUSPENDED', 'VERIFICATION_PENDING'],
        default: 'VERIFICATION_PENDING'
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});



module.exports = mongoose.model('User', userSchema);
