const User = require('../models/User');
const Policy = require('../models/Policy');
const Claim = require('../models/Claim');
const RiskData = require('../models/RiskData');
const connectDB = require('../config/db');
const logger = require('../utils/logger');

const seedDatabase = async () => {
    try {
        await connectDB();

        // Clear existing data
        await User.deleteMany({});
        await Policy.deleteMany({});
        await Claim.deleteMany({});
        await RiskData.deleteMany({});

        logger.info('Cleared existing data');

        // Create sample users
        const users = await User.create([
            {
                name: 'Rajesh Kumar',
                email: 'rajesh@swiggy.com',
                phone: '9876543210',
                location: 'Mumbai, Bandra',
                platform: 'SWIGGY',
                latitude: 19.0760,
                longitude: 72.8777,
                workerType: 'GIG',
                accountStatus: 'ACTIVE',
                kyc: {
                    verified: true,
                    verifiedAt: new Date(),
                    documentType: 'AADHAR'
                }
            },
            {
                name: 'Priya Singh',
                email: 'priya@zomato.com',
                phone: '9876543211',
                location: 'Bangalore, Whitefield',
                platform: 'ZOMATO',
                latitude: 12.9698,
                longitude: 77.6549,
                workerType: 'GIG',
                accountStatus: 'ACTIVE',
                kyc: {
                    verified: true,
                    verifiedAt: new Date(),
                    documentType: 'AADHAR'
                }
            },
            {
                name: 'Amit Patel',
                email: 'amit@rikshaw.com',
                phone: '9876543212',
                location: 'Delhi, Connaught Place',
                platform: 'RIKSHAW',
                latitude: 28.6315,
                longitude: 77.2197,
                workerType: 'GIG',
                accountStatus: 'ACTIVE',
                kyc: {
                    verified: true,
                    verifiedAt: new Date(),
                    documentType: 'AADHAR'
                }
            }
        ]);

        logger.info('Created 3 sample users');

        // Create sample policies
        const policies = await Policy.create([
            {
                userId: users[0]._id,
                plan: 'GIG_STANDARD',
                workerType: 'GIG',
                status: 'ACTIVE',
                weeklyPremium: 99,
                coverageAmount: 1200,
                riskFactor: 1.0,
                triggerTypes: ['HEAVY_RAIN', 'HIGH_POLLUTION'],
                startDate: new Date(),
                expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
                nextPaymentDue: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            },
            {
                userId: users[1]._id,
                plan: 'GIG_PREMIUM',
                workerType: 'GIG',
                status: 'ACTIVE',
                weeklyPremium: 149,
                coverageAmount: 2500,
                riskFactor: 1.2,
                triggerTypes: ['HEAVY_RAIN', 'HIGH_POLLUTION', 'DISASTER'],
                startDate: new Date(),
                expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
                nextPaymentDue: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            },
            {
                userId: users[2]._id,
                plan: 'GIG_BASIC',
                workerType: 'GIG',
                status: 'ACTIVE',
                weeklyPremium: 59,
                coverageAmount: 600,
                riskFactor: 1.0,
                triggerTypes: ['TRAFFIC_BLOCKED'],
                startDate: new Date(),
                expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
                nextPaymentDue: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            }
        ]);

        logger.info('Created 3 sample policies');

        // Create sample claims
        const claims = await Claim.create([
            {
                policyId: policies[0]._id,
                userId: users[0]._id,
                claimType: 'HEAVY_RAIN',
                status: 'APPROVED',
                riskScore: 80,
                fraudScore: 15,
                triggerEvidence: {
                    weatherData: {
                        rainfall: 65,
                        aqi: 150,
                        temperature: 28,
                        timestamp: new Date()
                    },
                    locationData: {
                        latitude: 19.0760,
                        longitude: 72.8777,
                        address: 'Bandra, Mumbai',
                        timestamp: new Date()
                    },
                    activityData: {
                        deliveriesCompleted: 8,
                        workingHours: 6,
                        timestamp: new Date()
                    }
                },
                approvedAmount: 1000,
                approvedBy: 'admin@insurance.com',
                reviewedAt: new Date()
            },
            {
                policyId: policies[1]._id,
                userId: users[1]._id,
                claimType: 'HIGH_POLLUTION',
                status: 'SUBMITTED',
                riskScore: 70,
                fraudScore: 25,
                triggerEvidence: {
                    weatherData: {
                        rainfall: 10,
                        aqi: 250,
                        temperature: 35,
                        timestamp: new Date()
                    },
                    locationData: {
                        latitude: 12.9698,
                        longitude: 77.6549,
                        address: 'Whitefield, Bangalore',
                        timestamp: new Date()
                    },
                    activityData: {
                        deliveriesCompleted: 5,
                        workingHours: 4,
                        timestamp: new Date()
                    }
                }
            }
        ]);

        logger.info('Created 2 sample claims');

        // Create sample risk data
        const riskData = await RiskData.create([
            {
                userId: users[0]._id,
                policyId: policies[0]._id,
                weatherData: {
                    rainfall: 45,
                    temperature: 28,
                    humidity: 75,
                    aqi: 150,
                    windSpeed: 15
                },
                locationData: {
                    latitude: 19.0760,
                    longitude: 72.8777,
                    address: 'Bandra, Mumbai',
                    zone: 'HIGH_TRAFFIC',
                    riskZone: 'MEDIUM'
                },
                riskMetrics: {
                    environmentalRisk: 45,
                    locationRisk: 35,
                    activityRisk: 25,
                    overallRisk: 35
                }
            },
            {
                userId: users[1]._id,
                policyId: policies[1]._id,
                weatherData: {
                    rainfall: 0,
                    temperature: 35,
                    humidity: 60,
                    aqi: 220,
                    windSpeed: 8
                },
                locationData: {
                    latitude: 12.9698,
                    longitude: 77.6549,
                    address: 'Whitefield, Bangalore',
                    zone: 'TECH_PARK',
                    riskZone: 'HIGH'
                },
                riskMetrics: {
                    environmentalRisk: 70,
                    locationRisk: 40,
                    activityRisk: 30,
                    overallRisk: 46
                }
            }
        ]);

        logger.info('Created sample risk data');

        logger.info('✅ Database seeding completed successfully!');
        process.exit(0);
    } catch (error) {
        logger.error('❌ Database seeding failed:', error);
        process.exit(1);
    }
};

seedDatabase();
