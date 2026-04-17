const mongoose = require('mongoose');

const riskDataSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    policyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Policy'
    },
    
    // Environmental Risk
    weatherData: {
        rainfall: Number,
        temperature: Number,
        humidity: Number,
        aqi: Number,
        windSpeed: Number,
        neighboringRainfall: Number,
        providerAgreementScore: Number,
        trustedSource: String,
        providerSources: [String],
        sourceSpreadRain: Number,
        sourceSpreadAqi: Number
    },
    
    // Location Risk
    locationData: {
        latitude: Number,
        longitude: Number,
        address: String,
        zone: String,
        riskZone: {
            type: String,
            enum: ['LOW', 'MEDIUM', 'HIGH'],
            default: 'MEDIUM'
        }
    },
    
    // Activity Risk
    activityData: {
        activeDeliveries: Number,
        workingHours: Number,
        avgDeliveryTime: Number,
        routeBlockages: Number,
        distanceCovered: Number
    },
    
    // Aggregated Metrics
    riskMetrics: {
        environmentalRisk: { type: Number, min: 0, max: 100 },
        locationRisk: { type: Number, min: 0, max: 100 },
        activityRisk: { type: Number, min: 0, max: 100 },
        overallRisk: { type: Number, min: 0, max: 100 }
    },
    
    dataSource: {
        type: String,
        enum: ['IMD', 'OPENWEATHER', 'OPENMETEO', 'WEATHERAPI', 'MULTI_SOURCE', 'GPS', 'PLATFORM_DATA', 'MANUAL'],
        default: 'MANUAL'
    },
    
    timestamp: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now }
});

riskDataSchema.index({ userId: 1, createdAt: -1 });
riskDataSchema.index({ policyId: 1 });
riskDataSchema.index({ 'riskMetrics.overallRisk': 1 });

module.exports = mongoose.model('RiskData', riskDataSchema);
