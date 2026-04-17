module.exports = {
    // Plan Configuration - Now with Income-Based Adjustments
    PLANS: {
        BASIC: {
            premium: 20,
            coverage: 500,
            maxClaims: 3,
            claimWindow: 30, // days
            incomeMultiplier: 2 // Coverage = daily_income * 2
        },
        STANDARD: {
            premium: 30,
            coverage: 1000,
            maxClaims: 5,
            claimWindow: 30,
            incomeMultiplier: 3
        },
        PREMIUM: {
            premium: 50,
            coverage: 2000,
            maxClaims: 10,
            claimWindow: 30,
            incomeMultiplier: 5
        },
        GIG_BASIC: {
            premium: 20,
            coverage: 600,
            maxClaims: 3,
            claimWindow: 30,
            incomeMultiplier: 2.5
        },
        GIG_STANDARD: {
            premium: 30,
            coverage: 1200,
            maxClaims: 5,
            claimWindow: 30,
            incomeMultiplier: 3.5
        },
        GIG_PREMIUM: {
            premium: 45,
            coverage: 2000,
            maxClaims: 8,
            claimWindow: 30,
            incomeMultiplier: 5
        }
    },

    // NEW: Worker Type Classification (GIG WORKERS ONLY - Swiggy, Zomato, Delivery Partner)
    WORKER_TYPES: {
        DELIVERY_BIKE: {
            name: 'Delivery (Bike/Scooter)',
            platform: ['SWIGGY', 'ZOMATO', 'DELIVERY_PARTNER'],
            outdoorPercentage: 95,
            weatherSensitivity: 1.0,      // Standard sensitivity
            activationFactor: 0.85        // Can partially work indoors/wait
        },
        DELIVERY_ON_FOOT: {
            name: 'Delivery (Walking)',
            platform: ['SWIGGY', 'ZOMATO'],
            outdoorPercentage: 100,
            weatherSensitivity: 1.0,      // Standard outdoor delivery
            activationFactor: 0.90
        },
        DELIVERY_VEHICLE: {
            name: 'Delivery (Vehicle)',
            platform: ['DELIVERY_PARTNER', 'SWIGGY'],
            outdoorPercentage: 30,        // Mostly in vehicle
            weatherSensitivity: 0.6,      // Less affected by weather
            activationFactor: 0.5         // Can mostly avoid weather
        }
    },

    // NEW: Activity-Based Claim Validation
    ACTIVITY_BASELINE: {
        REQUIRED_ACTIVITY_LEVEL: 0.6, // Worker needs 60% of normal activity during disruption
        MIN_GPS_POINTS: 10, // Minimum GPS signals during claim window
        MAX_STATIONARY_TIME_PERCENT: 0.3, // Max 30% time standing still during working hours
        SUSPICIOUS_LOCATION_JUMP: 50, // km (suspicious teleport)
    },

    // NEW: Seasonal & Regional Adjustments
    SEASONAL_FACTORS: {
        MONSOON: { // June-Sept in India
            months: [6, 7, 8, 9],
            rainfallMultiplier: 1.2, // Rain claims worth 20% more in monsoon
            pollutionMultiplier: 0.8 // Pollution lower in monsoon
        },
        WINTER: { // Dec-Feb
            months: [12, 1, 2],
            rainfallMultiplier: 0.8,
            pollutionMultiplier: 1.4 // Higher pollution (Delhi fog)
        },
        SUMMER: { // Mar-May
            months: [3, 4, 5],
            rainfallMultiplier: 0.5,
            pollutionMultiplier: 1.0
        }
    },

    // Trigger Thresholds (Graduated System - No Binary Cliffs)
    TRIGGERS: {
        RAINFALL: {
            name: 'Heavy Rain',
            // Graduated thresholds instead of binary
            thresholds: [
                { min: 0, max: 25, claimPercent: 0, label: 'Light' },
                { min: 25, max: 40, claimPercent: 25, label: 'Moderate' },
                { min: 40, max: 60, claimPercent: 60, label: 'Heavy' },
                { min: 60, max: 100, claimPercent: 90, label: 'Extreme' },
                { min: 100, max: Infinity, claimPercent: 100, label: 'Catastrophic' }
            ],
            minDuration: 1.5, // hours (more realistic)
            baseline: { // Regional baselines (mm/day average)
                MUMBAI: 80,
                BANGALORE: 40,
                DELHI: 30,
                HYDERABAD: 50,
                KOLKATA: 60,
                DEFAULT: 35
            }
        },
        HIGH_POLLUTION: {
            name: 'High Air Pollution',
            // Graduated by AQI
            thresholds: [
                { min: 0, max: 100, claimPercent: 0, label: 'Good' },
                { min: 100, max: 150, claimPercent: 15, label: 'Moderate' },
                { min: 150, max: 200, claimPercent: 45, label: 'Poor' },
                { min: 200, max: 300, claimPercent: 75, label: 'Very Poor' },
                { min: 300, max: Infinity, claimPercent: 100, label: 'Severe' }
            ],
            minDuration: 2, // hours
            baseline: { // City baseline AQI (historical average)
                MUMBAI: 120,
                BANGALORE: 80,
                DELHI: 140,
                HYDERABAD: 90,
                KOLKATA: 110,
                DEFAULT: 100
            }
        },
        DISASTER: {
            name: 'Natural Disaster',
            threshold: null, // Categorical
            types: ['FLOOD', 'EARTHQUAKE', 'CYCLONE'],
            claimPercent: 100 // Full coverage for disasters
        },
        TRAFFIC_BLOCKED: {
            name: 'Traffic Blockage',
            // Graduated by blocked area
            thresholds: [
                { min: 0, max: 2, claimPercent: 0, label: 'Minor' },
                { min: 2, max: 5, claimPercent: 30, label: 'Moderate' },
                { min: 5, max: 10, claimPercent: 70, label: 'Severe' },
                { min: 10, max: Infinity, claimPercent: 100, label: 'Gridlock' }
            ],
            minDuration: 1.5 // hours
        },
        CURFEW: {
            name: 'Curfew',
            threshold: null,
            minDuration: 2,
            claimPercent: 100
        },
        STRIKE: {
            name: 'Strike/Protest',
            threshold: null,
            minDuration: 2,
            claimPercent: 100
        },
        UNEXPECTED_EVENT: {
            name: 'Unexpected Event',
            threshold: null,
            minDuration: 1,
            claimPercent: 80 // 80% for unverified events
        }
    },

    // Risk Scoring Rules
    RISK_SCORING: {
        HISTORICAL_CLAIMS: {
            weight: 0.2,
            scale: [
                { claims: 0, score: 0 },
                { claims: 1, score: 10 },
                { claims: 3, score: 25 },
                { claims: 5, score: 40 },
                { claims: 10, score: 70 }
            ]
        },
        LOCATION_RISK: {
            weight: 0.25,
            zones: {
                HIGH: 50,
                MEDIUM: 25,
                LOW: 5
            }
        },
        WEATHER_RISK: {
            weight: 0.25,
            thresholds: {
                rainfall: 50,
                aqi: 200,
                temperature: 45
            }
        },
        ACTIVITY_RISK: {
            weight: 0.3,
            metrics: {
                lowActivity: 20,
                normalActivity: 10,
                highActivity: 5
            }
        }
    },

    // Fraud Detection Rules
    FRAUD_RULES: {
        LOCATION_MISMATCH: {
            enabled: true,
            maxDistanceKm: 5,
            severity: 'HIGH'
        },
        CLAIM_FREQUENCY: {
            enabled: true,
            maxClaimsPerWeek: 2,
            severity: 'MEDIUM'
        },
        DUPLICATE_CLAIM: {
            enabled: true,
            windowHours: 48,
            severity: 'CRITICAL'
        },
        AMOUNT_ANOMALY: {
            enabled: true,
            deviationPercent: 300, // percent of average
            severity: 'MEDIUM'
        },
        VELOCITY_FRAUD: {
            enabled: true,
            maxClaimsPerDay: 3,
            severity: 'HIGH'
        },
        PATTERN_ANOMALY: {
            enabled: true,
            minHistoryDays: 30,
            severity: 'MEDIUM'
        }
    },

    // API Response Codes
    RESPONSE_CODES: {
        SUCCESS: 200,
        CREATED: 201,
        BAD_REQUEST: 400,
        UNAUTHORIZED: 401,
        FORBIDDEN: 403,
        NOT_FOUND: 404,
        CONFLICT: 409,
        INTERNAL_SERVER_ERROR: 500,
        SERVICE_UNAVAILABLE: 503
    },

    // Error Messages
    ERRORS: {
        INVALID_INPUT: 'Invalid input provided',
        USER_NOT_FOUND: 'User not found',
        POLICY_NOT_FOUND: 'Policy not found',
        CLAIM_NOT_FOUND: 'Claim not found',
        UNAUTHORIZED: 'Unauthorized access',
        DUPLICATE_EMAIL: 'Email already registered',
        POLICY_EXPIRED: 'Policy has expired',
        CLAIM_LIMIT_EXCEEDED: 'Claim limit exceeded for this period',
        DB_ERROR: 'Database error occurred',
        FRAUD_SUSPECTED: 'Claim flagged for fraud review',
        TRIGGER_NOT_MET: 'Trigger conditions not met',
        API_ERROR: 'External API error'
    },

    // Status Enums
    USER_STATUS: {
        ACTIVE: 'ACTIVE',
        SUSPENDED: 'SUSPENDED',
        VERIFICATION_PENDING: 'VERIFICATION_PENDING'
    },

    POLICY_STATUS: {
        ACTIVE: 'ACTIVE',
        SUSPENDED: 'SUSPENDED',
        EXPIRED: 'EXPIRED',
        CANCELLED: 'CANCELLED'
    },

    CLAIM_STATUS: {
        SUBMITTED: 'SUBMITTED',
        UNDER_REVIEW: 'UNDER_REVIEW',
        APPROVED: 'APPROVED',
        REJECTED: 'REJECTED',
        PAID: 'PAID'
    },

    FRAUD_SEVERITY: {
        LOW: 0,
        MEDIUM: 1,
        HIGH: 2,
        CRITICAL: 3
    },

    // Default Values
    DEFAULTS: {
        POLICY_DURATION_DAYS: 365,
        RISK_FACTOR_MIN: 0.5,
        RISK_FACTOR_MAX: 2.0,
        FRAUD_SCORE_THRESHOLD: 60,
        MANUAL_REVIEW_THRESHOLD: 40,
        API_TIMEOUT_MS: 10000,
        LOG_RETENTION_DAYS: 90,
        FRAUD_APPROVAL_THRESHOLD: 60,
        FRAUD_LAYER_COUNT: 6
    }
};
