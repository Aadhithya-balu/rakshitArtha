const axios = require('axios');
const RiskData = require('../models/RiskData');
const Policy = require('../models/Policy');
const Claim = require('../models/Claim');
const FraudLog = require('../models/FraudLog');
const { calculatePremium } = require('./premiumService');
const { payoutService } = require('./payoutService');
const { CLAIM_STATUS } = require('../utils/constants');
const { fraudDetectionService } = require('./fraudDetectionService');
const {
    parseWorkingHours,
    getShiftDurationHours,
    getShiftRiskMultiplier,
    getShiftType,
    getOverlapHours,
    getPeakHoursOverlapHours,
    buildDisruptionWindow,
} = require('../utils/timeParser');

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function normalizeAxiosError(error) {
    return {
        message: error?.message || 'Unknown error',
        code: error?.code || null,
        status: error?.response?.status || null,
        statusText: error?.response?.statusText || null,
        data: error?.response?.data || null
    };
}

function averageNumeric(values = []) {
    const nums = values.filter((value) => typeof value === 'number' && Number.isFinite(value));
    if (!nums.length) return null;
    return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function roundNumber(value, digits = 2) {
    if (typeof value !== 'number' || Number.isNaN(value)) return null;
    return Number(value.toFixed(digits));
}

function getActivityTelemetry(user = {}) {
    const telemetry = user?.activityTelemetry || {};
    const hasMotionTelemetry = user?.activityConsent && telemetry && (
        typeof telemetry.accelerometerVariance === 'number' ||
        typeof telemetry.idleRatio === 'number' ||
        typeof telemetry.foregroundAppMinutes === 'number' ||
        typeof telemetry.motionConsistencyScore === 'number' ||
        typeof telemetry.activityFactor === 'number' ||
        typeof telemetry.activeOrders === 'number'
    );
    const hasPlatformTelemetry = typeof telemetry.activityFactor === 'number' || typeof telemetry.activeOrders === 'number' || typeof telemetry.earnings === 'number';
    const hasTelemetry = hasMotionTelemetry || hasPlatformTelemetry;

    const inferredActivityFactor = typeof telemetry.activityFactor === 'number'
        ? telemetry.activityFactor
        : typeof telemetry.activeOrders === 'number'
            ? clamp(0.35 + (telemetry.activeOrders / 30) - clamp((telemetry.idleDuration || 0) / 180, 0, 0.35), 0.05, 1)
            : null;

    return {
        hasTelemetry: Boolean(hasTelemetry),
        accelerometerVariance: typeof telemetry.accelerometerVariance === 'number' ? telemetry.accelerometerVariance : null,
        idleRatio: typeof telemetry.idleRatio === 'number' ? telemetry.idleRatio : null,
        foregroundAppMinutes: typeof telemetry.foregroundAppMinutes === 'number' ? telemetry.foregroundAppMinutes : null,
        motionConsistencyScore: typeof telemetry.motionConsistencyScore === 'number' ? telemetry.motionConsistencyScore : null,
        sampleCount: typeof telemetry.sampleCount === 'number' ? telemetry.sampleCount : 0,
        collectedAt: telemetry.collectedAt || null,
        deviceMotionAvailable: Boolean(telemetry.deviceMotionAvailable),
        activityFactor: typeof inferredActivityFactor === 'number' ? Number(inferredActivityFactor.toFixed(3)) : null,
        activeOrders: typeof telemetry.activeOrders === 'number' ? telemetry.activeOrders : null,
        earnings: typeof telemetry.earnings === 'number' ? telemetry.earnings : null,
        idleDuration: typeof telemetry.idleDuration === 'number' ? telemetry.idleDuration : null,
        avgOrdersPerHour: typeof telemetry.avgOrdersPerHour === 'number' ? telemetry.avgOrdersPerHour : null,
        earningsTrend: typeof telemetry.earningsTrend === 'number' ? telemetry.earningsTrend : null,
        activityStatus: telemetry.activityStatus || null,
        sourcePlatform: telemetry.sourcePlatform || null,
    };
}

function mapRiskLevel(score) {
    if (score >= 70) return 'HIGH';
    if (score >= 40) return 'MEDIUM';
    return 'LOW';
}

function buildTrafficProfile(platform = 'OTHER') {
    const hour = new Date().getHours();
    const peakHour = (hour >= 8 && hour <= 10) || (hour >= 18 && hour <= 21);
    const baseBlockages = peakHour ? 3 : 1;
    const platformBoost = ['SWIGGY', 'ZOMATO', 'UBER'].includes(platform.toUpperCase()) ? 1 : 0;
    const routeBlockages = clamp(baseBlockages + platformBoost, 0, 5);

    return {
        activeDeliveries: peakHour ? 8 : 5,
        workingHours: peakHour ? 8 : 6,
        avgDeliveryTime: peakHour ? 32 : 24,
        routeBlockages,
        distanceCovered: peakHour ? 48 : 30
    };
}

function calculateEnvironmentalRisk({ rainfall, aqi, temperature, windSpeed }) {
    let risk = 0;

    if (rainfall > 50) risk += Math.min(((rainfall - 50) / 50) * 40, 40);
    if (aqi > 200) risk += Math.min(((aqi - 200) / 100) * 35, 35);
    if (temperature > 45 || temperature < 5) risk += 15;
    else if (temperature > 40 || temperature < 10) risk += 10;
    if (windSpeed > 50) risk += 10;

    return clamp(Math.round(risk), 0, 100);
}

function calculateLocationRisk(user) {
    const location = (user.location || '').toLowerCase();
    const hotspotRules = [
        {
            terms: ['electronic city', 'whitefield', 'bellandur', 'marathahalli', 'koramangala', 'indiranagar', 'sarjapur'],
            score: 92
        },
        {
            terms: ['t. nagar', 't nagar', 'omr', 'velachery', 'anna nagar', 'adyar'],
            score: 68
        },
        {
            terms: ['ukkadam', 'gandhipuram', 'peelamedu', 'race course'],
            score: 58
        },
        {
            terms: ['sai baba colony', 'rs puram', 'sukrawarpettai'],
            score: 32
        },
        {
            terms: ['mumbai', 'bandra', 'andheri', 'powai'],
            score: 48
        },
        {
            terms: ['delhi', 'connaught', 'gurugram', 'noida'],
            score: 40
        }
    ];

    let score = 22;

    if (location.includes('bangalore') || location.includes('bengaluru')) {
        score = Math.max(score, 72);
    }
    if (location.includes('chennai')) {
        score = Math.max(score, 52);
    }
    if (location.includes('coimbatore')) {
        score = Math.max(score, 34);
    }

    for (const rule of hotspotRules) {
        if (rule.terms.some((term) => location.includes(term))) {
            score = Math.max(score, rule.score);
        }
    }

    return clamp(score, 0, 100);
}

function calculateActivityRisk(user, trafficProfile) {
    const platform = (user.platform || '').toUpperCase();
    let risk = ['SWIGGY', 'ZOMATO', 'UBER'].includes(platform) ? 28 : 20;
    risk += trafficProfile.routeBlockages * 8;
    const parsedShift = parseWorkingHours(user?.workingHours || '');
    const shiftDurationHours = getShiftDurationHours(parsedShift);
    risk *= getShiftRiskMultiplier(parsedShift);
    if (shiftDurationHours >= 10) risk += 6;
    else if (shiftDurationHours >= 8) risk += 3;
    const telemetry = getActivityTelemetry(user);
    if (telemetry.activityFactor != null) {
        risk += clamp((1 - telemetry.activityFactor) * 16, 0, 16);
    }
    if (telemetry.activityStatus === 'IDLE') {
        risk += 10;
    }
    return clamp(risk, 0, 100);
}

function calculateHistoricalRisk(claimCount) {
    return clamp(claimCount * 12, 0, 60);
}

function aggregateRisk({ environmentalRisk, locationRisk, activityRisk, historicalRisk }) {
    const zoneBoost = locationRisk >= 80 ? 15 : locationRisk >= 60 ? 8 : 0;
    return clamp(
        Math.round(
            environmentalRisk * 0.1 +
            locationRisk * 0.6 +
            activityRisk * 0.2 +
            historicalRisk * 0.1 +
            zoneBoost
        ),
        0,
        100
    );
}


function getEstimatedDailyIncome(platform = 'OTHER') {
    switch ((platform || '').toUpperCase()) {
        case 'SWIGGY':
            return 1200;
        case 'ZOMATO':
            return 1100;
        case 'UBER':
            return 1150;
        case 'RIKSHAW':
            return 950;
        default:
            return 850;
    }
}

function computeWeatherSeverity(weatherData = {}, trafficProfile = {}) {
    const rainfallSeverity = clamp(((weatherData.rainfall || 0) - 20) / 70, 0, 1);
    const aqiSeverity = clamp(((weatherData.aqi || 0) - 100) / 220, 0, 1);
    const trafficSeverity = clamp((trafficProfile.routeBlockages || 0) / 5, 0, 1);
    return {
        rainfallSeverity: Number(rainfallSeverity.toFixed(3)),
        aqiSeverity: Number(aqiSeverity.toFixed(3)),
        trafficSeverity: Number(trafficSeverity.toFixed(3))
    };
}

function getWorkerCategory(user = {}) {
    const platform = String(user?.platform || '').toUpperCase();
    if (['SWIGGY', 'ZOMATO', 'AMAZON', 'FLIPKART', 'ZEPTO', 'BLINKIT', 'DUNZO'].includes(platform)) {
        return 'OUTDOOR_DELIVERY';
    }
    if (platform.includes('RIKSHAW') || platform.includes('DRIVER')) {
        return 'TRANSPORT_DRIVER';
    }
    return 'GENERAL_GIG';
}

function getPersonalizedThresholds(user = {}, overallRisk = 0) {
    const category = getWorkerCategory(user);
    const location = String(user?.location || '').toLowerCase();
    const monsoonZone = ['mumbai', 'chennai', 'kochi', 'coimbatore', 'bengaluru', 'bangalore'].some((term) => location.includes(term));
    const rainfallBase = category === 'TRANSPORT_DRIVER' ? 38 : category === 'OUTDOOR_DELIVERY' ? 42 : 48;
    const aqiBase = category === 'OUTDOOR_DELIVERY' ? 165 : 185;
    const trafficBase = category === 'OUTDOOR_DELIVERY' ? 3 : 4;
    return {
        rainfall: clamp(rainfallBase + (monsoonZone ? 8 : 0), 35, 60),
        aqi: clamp(aqiBase + (overallRisk >= 70 ? 10 : 0), 150, 220),
        traffic: trafficBase
    };
}

function resolveDisruptionProbability({ overallRisk = 0, rainfall = 0, aqi = 0, traffic = 0, peakHoursOverlap = 0, shiftRiskMultiplier = 1 }) {
    return clamp(
        0.45 +
        clamp(Number(overallRisk) / 180, 0, 0.35) +
        clamp(Number(rainfall) / 300, 0, 0.12) +
        clamp(Number(aqi) / 1200, 0, 0.08) +
        clamp(Number(traffic) / 10, 0, 0.08) +
        clamp(Number(peakHoursOverlap) / 8, 0, 0.08) +
        clamp(Number(shiftRiskMultiplier) - 1, 0, 0.18),
        0.2,
        1.35
    );
}

function isWithinWorkingWindow(workingHours, now = new Date()) {
    const parsedShift = parseWorkingHours(workingHours || '');
    if (!parsedShift) return true;
    const current = now.getHours() + (now.getMinutes() / 60);
    return getOverlapHours(parsedShift, {
        startHour: current,
        endHour: current + 0.01,
        isOvernight: false,
    }) > 0;
}

function computeOutdoorExposure(user, trafficProfile = {}) {
    const workerCategory = getWorkerCategory(user);
    const deliveries = clamp((trafficProfile.activeDeliveries || 0) / 10, 0, 1);
    const distance = clamp((trafficProfile.distanceCovered || 0) / 50, 0, 1);
    const hours = clamp((trafficProfile.workingHours || 0) / 8, 0, 1);
    const categoryWeight = workerCategory === 'TRANSPORT_DRIVER' ? 1 : workerCategory === 'OUTDOOR_DELIVERY' ? 0.9 : 0.55;
    const heuristicExposure = clamp((deliveries * 0.4 + distance * 0.35 + hours * 0.25) * categoryWeight, 0, 1);
    const telemetry = getActivityTelemetry(user);

    if (!telemetry.hasTelemetry) {
        return Number(heuristicExposure.toFixed(3));
    }

    if (telemetry.activityFactor != null) {
        const platformExposure = clamp(telemetry.activityFactor * 0.65 + heuristicExposure * 0.35, 0, 1);
        if (telemetry.activityStatus === 'IDLE') {
            return Number(clamp(platformExposure * 0.72, 0, 1).toFixed(3));
        }
        return Number(platformExposure.toFixed(3));
    }

    const motionStrength = clamp(
        (telemetry.motionConsistencyScore ?? 0) * 0.5 +
        (telemetry.accelerometerVariance ?? 0) * 0.35 +
        (1 - (telemetry.idleRatio ?? 1)) * 0.15,
        0,
        1
    );
    const foregroundWeight = telemetry.foregroundAppMinutes == null
        ? 0.8
        : clamp(telemetry.foregroundAppMinutes / 180, 0.15, 1);

    return Number(clamp(
        heuristicExposure * 0.45 + motionStrength * 0.4 + foregroundWeight * 0.15,
        0,
        1
    ).toFixed(3));
}

function buildMotionEvidence(user, impactAssessment = null) {
    const telemetry = getActivityTelemetry(user);
    if (telemetry.hasTelemetry) {
        return {
            accelerometerVariance: roundNumber(telemetry.accelerometerVariance ?? 0, 3),
            idleRatio: roundNumber(telemetry.idleRatio ?? 0, 3),
            foregroundAppMinutes: roundNumber(telemetry.foregroundAppMinutes ?? 0, 2),
            motionConsistencyScore: roundNumber(
                telemetry.motionConsistencyScore ??
                clamp((telemetry.accelerometerVariance || 0) * 0.7 + (1 - (telemetry.idleRatio || 1)) * 0.5, 0, 1),
                3
            ),
            sampleCount: telemetry.sampleCount || 0,
            collectedAt: telemetry.collectedAt,
            source: 'CONSENTED_DEVICE_TELEMETRY',
            deviceMotionAvailable: telemetry.deviceMotionAvailable
        };
    }

    return {
        accelerometerVariance: roundNumber((impactAssessment?.outdoorExposure || 0) * 0.85, 3),
        idleRatio: roundNumber(1 - (impactAssessment?.outdoorExposure || 0), 3),
        foregroundAppMinutes: null,
        motionConsistencyScore: roundNumber(((impactAssessment?.outdoorExposure || 0) + (impactAssessment?.workerImpact || 0)) / 2, 3),
        sampleCount: 0,
        collectedAt: null,
        source: 'HEURISTIC_FALLBACK',
        deviceMotionAvailable: false
    };
}

function assessDisruptionImpactEligibility(user, riskRecord, trigger, overallRisk, futureRiskSummary = null) {
    const trafficProfile = riskRecord?.activityData || {};
    const weatherData = riskRecord?.weatherData || {};
    const outdoorExposure = computeOutdoorExposure(user, trafficProfile);
    const workerImpact = computeWorkerImpact(user, trafficProfile, trigger.claimType);
    const parsedShift = parseWorkingHours(user?.workingHours || '');
    const disruptionDurationHours = Number(trigger?.durationHours || trigger?.duration || 0);
    const disruptionWindow = buildDisruptionWindow({
        start: trigger?.disruptionStartHour,
        end: trigger?.disruptionEndHour,
        durationHours: disruptionDurationHours,
    });
    const overlapHours = parsedShift
        ? getOverlapHours(parsedShift, disruptionWindow)
        : disruptionDurationHours;
    const workingWindowAligned = overlapHours > 0 || disruptionDurationHours === 0;
    const personalizedThresholds = getPersonalizedThresholds(user, overallRisk);
    const futurePeakRisk = Number(futureRiskSummary?.max_risk_score || 0);
    const providerAgreement = Number(weatherData.providerAgreementScore ?? 0.5);
    const rainfallConfidence = clamp((weatherData.rainfall || 0) / Math.max(personalizedThresholds.rainfall, 1), 0, 2);
    const pollutionConfidence = clamp((weatherData.aqi || 0) / Math.max(personalizedThresholds.aqi, 1), 0, 2);
    const triggerConfidence = trigger.claimType === 'HEAVY_RAIN'
        ? rainfallConfidence
        : trigger.claimType === 'HIGH_POLLUTION'
            ? pollutionConfidence
            : clamp((trafficProfile.routeBlockages || 0) / Math.max(personalizedThresholds.traffic, 1), 0, 2);
    const disruptionWindowConfidence = clamp((overallRisk * 0.55 + futurePeakRisk * 0.45) / 100, 0, 1);
    const incomeDisruptionConfidence = Number(clamp(
        workerImpact * 0.45 +
        outdoorExposure * 0.25 +
        disruptionWindowConfidence * 0.18 +
        Math.min(triggerConfidence, 1) * 0.07 +
        providerAgreement * 0.05,
        0,
        1
    ).toFixed(3));

    const reasons = [];
    if (!workingWindowAligned) reasons.push('current disruption is outside the worker’s stated working window');
    if (outdoorExposure < 0.22) reasons.push('worker appears indoors or insufficiently exposed to outdoor disruption');
    if (workerImpact < 0.22) reasons.push('actual work/income impact signal is too weak');
    if (triggerConfidence < 1) reasons.push('disruption intensity is below the worker-specific threshold');
    if (providerAgreement < 0.35) reasons.push('weather providers do not agree strongly enough on disruption severity');

    return {
        eligible: workingWindowAligned && outdoorExposure >= 0.22 && workerImpact >= 0.22 && triggerConfidence >= 1 && providerAgreement >= 0.35,
        workingWindowAligned,
        overlapHours: Number(overlapHours.toFixed(3)),
        shiftType: getShiftType(parsedShift),
        outdoorExposure,
        workerImpact,
        triggerConfidence: Number(triggerConfidence.toFixed(3)),
        providerAgreement: Number(providerAgreement.toFixed(3)),
        incomeDisruptionConfidence,
        personalizedThresholds,
        reasons
    };
}

function computeWorkerImpact(user, trafficProfile = {}, triggerType = null) {
    const baselineIncome = Number(user?.dailyIncome || getEstimatedDailyIncome(user?.platform));
    const normalizedHours = clamp((trafficProfile.workingHours || 0) / 8, 0, 1);
    const normalizedDeliveries = clamp((trafficProfile.activeDeliveries || 0) / 10, 0, 1);
    const routeStress = clamp((trafficProfile.routeBlockages || 0) / 5, 0, 1);
    let impact = 0.2 + routeStress * 0.35 + (1 - normalizedDeliveries) * 0.25 + (1 - normalizedHours) * 0.2;
    const telemetry = getActivityTelemetry(user);
    if (telemetry.activityFactor != null) {
        impact += clamp((1 - telemetry.activityFactor) * 0.18, 0, 0.18);
    }

    if (triggerType === 'HEAVY_RAIN') impact += 0.08;
    if (triggerType === 'HIGH_POLLUTION') impact += 0.04;
    if (baselineIncome >= 1200) impact += 0.03;

    return Number(clamp(impact, 0.08, 1).toFixed(3));
}

function computePersonalizationMultiplier(user, overallRisk = 0, futureRiskScore = 0) {
    const baseIncome = Number(user?.dailyIncome || getEstimatedDailyIncome(user?.platform));
    const incomeFactor = baseIncome >= 1400 ? 1.08 : baseIncome >= 1000 ? 1.03 : 0.98;
    const zoneFactor = overallRisk >= 75 ? 1.12 : overallRisk >= 55 ? 1.06 : 1.0;
    const forecastFactor = futureRiskScore >= 70 ? 1.08 : futureRiskScore >= 45 ? 1.04 : 1.0;
    return Number(clamp(incomeFactor * zoneFactor * forecastFactor, 0.9, 1.25).toFixed(3));
}

function computeAuthenticityMultiplier(fraudAnalysis) {
    const fraudScore = Number(fraudAnalysis?.score || 0);
    if (fraudAnalysis?.decision === 'REJECTED') return 0;
    return Number(clamp(1 - (fraudScore / 140), 0.45, 1).toFixed(3));
}

function getDynamicRiskFactor(overallRisk, weatherData, trafficProfile) {
    const riskBase = overallRisk / 100;
    const severity = computeWeatherSeverity(weatherData, trafficProfile);
    const rainfallBoost = severity.rainfallSeverity * 0.24;
    const pollutionBoost = severity.aqiSeverity * 0.18;
    const trafficBoost = severity.trafficSeverity * 0.14;
    return clamp(Number((0.9 + riskBase + rainfallBoost + pollutionBoost + trafficBoost).toFixed(2)), 0.85, 2.0);
}

function getTriggerCandidates(policy, weatherData, trafficProfile, overallRisk) {
    const candidates = [];
    const severity = computeWeatherSeverity(weatherData, trafficProfile);

    if (severity.rainfallSeverity >= 0.2) {
        candidates.push({
            claimType: 'HEAVY_RAIN',
            severity: Number(clamp(0.35 + severity.rainfallSeverity * 0.55, 0.2, 0.92).toFixed(3)),
            triggerValue: weatherData?.rainfall || 0
        });
    }

    if (severity.aqiSeverity >= 0.22) {
        candidates.push({
            claimType: 'HIGH_POLLUTION',
            severity: Number(clamp(0.28 + severity.aqiSeverity * 0.5, 0.18, 0.85).toFixed(3)),
            triggerValue: weatherData?.aqi || 0
        });
    }

    if (severity.trafficSeverity >= 0.45 || overallRisk >= 70) {
        candidates.push({
            claimType: 'TRAFFIC_BLOCKED',
            severity: Number(clamp(0.25 + Math.max(severity.trafficSeverity, overallRisk / 100) * 0.45, 0.2, 0.82).toFixed(3)),
            triggerValue: trafficProfile?.routeBlockages || 0
        });
    }

    if ((weatherData?.temperature || 0) >= 42) {
        candidates.push({
            claimType: 'EXTREME_HEAT',
            severity: Number(clamp(0.2 + (((weatherData?.temperature || 0) - 42) / 8), 0.2, 0.85).toFixed(3)),
            triggerValue: weatherData?.temperature || 0
        });
    }

    if ((trafficProfile?.activeDeliveries || 0) <= 2 && overallRisk >= 45) {
        candidates.push({
            claimType: 'PLATFORM_DOWNTIME',
            severity: Number(clamp(0.22 + ((overallRisk - 45) / 120), 0.22, 0.72).toFixed(3)),
            triggerValue: trafficProfile?.activeDeliveries || 0
        });
    }

    return candidates;
}

async function updatePolicyPricing(activePolicy, user, overallRisk, weatherData, trafficProfile) {
    if (!activePolicy) {
        return null;
    }

    const riskFactor = getDynamicRiskFactor(overallRisk, weatherData, trafficProfile);
    const parsedShift = parseWorkingHours(user?.workingHours || '');
    const weeklyHours = getShiftDurationHours(parsedShift) > 0 ? getShiftDurationHours(parsedShift) * 7 : 40;
    const peakHoursOverlap = Number(getPeakHoursOverlapHours(parsedShift) || 0);
    const disruptionProbability = resolveDisruptionProbability({
        overallRisk,
        rainfall: weatherData?.rainfall,
        aqi: weatherData?.aqi,
        traffic: trafficProfile?.routeBlockages,
        peakHoursOverlap,
        shiftRiskMultiplier: getShiftRiskMultiplier(parsedShift),
    });
    const pricing = calculatePremium(activePolicy.plan, riskFactor, user.workerType || 'GIG', {
        workingHours: user?.workingHours,
        weeklyHours,
        shiftRiskMultiplier: getShiftRiskMultiplier(parsedShift),
        zoneSafetyScore: overallRisk,
        rainfallForecast: weatherData?.rainfall,
        predictedDisruptionHours: Math.max(Number(trafficProfile?.workingHours || 0), 0),
        peakHoursOverlap,
        disruptionProbability,
        platformActivity: user?.activityTelemetry,
    });

    activePolicy.riskFactor = riskFactor;
    activePolicy.weeklyPremium = pricing.weeklyPremium;
    activePolicy.coverageAmount = pricing.coverageAmount;
    activePolicy.normalizedPlanCode = pricing.pricingBreakdown.normalizedPlan;
    activePolicy.lockedPayableAmount = pricing.pricingBreakdown.lockedPayableAmount;
    activePolicy.pricingBreakdown = pricing.pricingBreakdown;
    activePolicy.updatedAt = new Date();
    await activePolicy.save();

    return {
        policy: activePolicy,
        pricing,
        riskFactor
    };
}

async function autoProcessTriggeredClaim(user, activePolicy, riskRecord, trigger, fraudAnalysis, context = {}) {
    const duplicateWindowStart = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const existingClaim = await Claim.findOne({
        userId: user._id,
        policyId: activePolicy._id,
        claimType: trigger.claimType,
        createdAt: { $gte: duplicateWindowStart }
    }).sort({ createdAt: -1 });

    if (existingClaim) {
        return {
            claim: existingClaim,
            wasDuplicate: true
        };
    }

    const futureRiskScore = context.futureRiskScore || 0;
    const workerImpact = computeWorkerImpact(user, riskRecord?.activityData, trigger.claimType);
    const personalizationMultiplier = computePersonalizationMultiplier(
        user,
        riskRecord?.riskMetrics?.overallRisk || 0,
        futureRiskScore
    );
    const authenticityMultiplier = computeAuthenticityMultiplier(fraudAnalysis);
    const parsedShift = parseWorkingHours(user?.workingHours || '');
    const disruptionDurationHours = Number(trigger?.durationHours || trigger?.duration || 0);
    const disruptionWindow = buildDisruptionWindow({
        start: trigger?.disruptionStartHour,
        end: trigger?.disruptionEndHour,
        durationHours: disruptionDurationHours,
    });
    const overlapHours = parsedShift
        ? getOverlapHours(parsedShift, disruptionWindow)
        : disruptionDurationHours;
    const overlapRatio = disruptionDurationHours > 0 ? clamp(overlapHours / disruptionDurationHours, 0, 1) : 1;
    const estimatedLoss = Math.round(
        getEstimatedDailyIncome(user.platform) *
        trigger.severity *
        workerImpact *
        overlapRatio *
        personalizationMultiplier
    );
    const peakHoursOverlap = Number(getPeakHoursOverlapHours(parsedShift) || 0);
    const disruptionProbability = resolveDisruptionProbability({
        overallRisk: riskRecord?.riskMetrics?.overallRisk || 0,
        rainfall: riskRecord?.weatherData?.rainfall,
        aqi: riskRecord?.weatherData?.aqi,
        traffic: riskRecord?.activityData?.routeBlockages,
        peakHoursOverlap,
        shiftRiskMultiplier: getShiftRiskMultiplier(parsedShift),
    });
    const approvedAmount = Math.min(
        activePolicy.coverageAmount,
        Math.round(estimatedLoss * (0.92 + authenticityMultiplier * 0.28))
    );
    const triggerEvidence = {
        weatherData: {
            rainfall: riskRecord?.weatherData?.rainfall,
            aqi: riskRecord?.weatherData?.aqi,
            temperature: riskRecord?.weatherData?.temperature,
            providerAgreementScore: riskRecord?.weatherData?.providerAgreementScore,
            trustedSource: riskRecord?.weatherData?.trustedSource,
            providerSources: riskRecord?.weatherData?.providerSources,
            timestamp: riskRecord.timestamp
        },
        locationData: {
            latitude: riskRecord?.locationData?.latitude,
            longitude: riskRecord?.locationData?.longitude,
            address: riskRecord?.locationData?.address,
            timestamp: riskRecord.timestamp
        },
        activityData: {
            deliveriesCompleted: riskRecord?.activityData?.activeDeliveries,
            workingHours: riskRecord?.activityData?.workingHours,
            timestamp: riskRecord.timestamp
        },
        motionData: buildMotionEvidence(user),
        payoutComputation: {
            triggerSeverity: trigger.severity,
            workerImpact,
            overlapHours,
            overlapRatio: Number(overlapRatio.toFixed(3)),
            peakHoursOverlap,
            disruptionProbability: Number(disruptionProbability.toFixed(3)),
            personalizationMultiplier,
            authenticityMultiplier,
            estimatedLoss,
            auditTrace: {
                shift: user?.workingHours || null,
                disruption: `${disruptionWindow.startHour.toFixed(2)}-${disruptionWindow.endHour.toFixed(2)}`,
                overlapHours: Number(overlapHours.toFixed(3)),
                overlapRatio: Number(overlapRatio.toFixed(3))
            }
        }
    };
    const claim = await Claim.create({
        policyId: activePolicy._id,
        userId: user._id,
        claimType: trigger.claimType,
        riskScore: riskRecord?.riskMetrics?.overallRisk || 0,
        triggerEvidence,
        fraudScore: fraudAnalysis.score,
        fraudFlags: fraudAnalysis.flags,
        fraudFlagDescription: fraudAnalysis.description,
        fraudReviewTier: fraudAnalysis.reviewTier || 'GREEN',
        fraudNextAction: fraudAnalysis.nextAction || 'AUTO_APPROVE',
        fraudLayerEvidence: fraudAnalysis.layers,
        fraudLayerCount: fraudAnalysis.layerCount || 6,
        status: fraudAnalysis.decision === 'REJECTED'
            ? CLAIM_STATUS.REJECTED
            : fraudAnalysis.nextAction === 'AUTO_APPROVE'
            ? CLAIM_STATUS.APPROVED
            : CLAIM_STATUS.UNDER_REVIEW,
        approvedAmount: fraudAnalysis.decision === 'REJECTED' || fraudAnalysis.nextAction !== 'AUTO_APPROVE' ? 0 : approvedAmount,
        approvalNotes: fraudAnalysis.decision === 'REJECTED'
            ? undefined
            : fraudAnalysis.nextAction !== 'AUTO_APPROVE'
            ? `Claim routed to ${fraudAnalysis.reviewTier} review lane before payout.`
            : `Auto-approved hybrid parametric payout for ${trigger.claimType} using severity ${trigger.severity}, impact ${workerImpact}, personalization ${personalizationMultiplier}`,
        approvedBy: fraudAnalysis.decision === 'REJECTED' ? undefined : 'AUTOMATION_ENGINE',
        reviewedAt: new Date(),
        rejectionReason: fraudAnalysis.decision === 'REJECTED'
            ? 'Auto-rejected by 5-layer fraud detection'
            : undefined
    });

    if (fraudAnalysis.score > 0 || fraudAnalysis.flags.length > 0) {
        await FraudLog.create({
            userId: user._id,
            policyId: activePolicy._id,
            claimId: claim._id,
            fraudType: fraudAnalysis.primaryFlag || 'PATTERN_ANOMALY',
            fraudScore: fraudAnalysis.score,
            severity: fraudAnalysis.score >= 80 ? 'CRITICAL' : fraudAnalysis.score >= 60 ? 'HIGH' : fraudAnalysis.score >= 40 ? 'MEDIUM' : 'LOW',
            evidence: fraudAnalysis.layers,
            decision: fraudAnalysis.decision === 'REJECTED' ? 'REJECTED' : fraudAnalysis.nextAction === 'AUTO_APPROVE' ? 'APPROVED' : 'FLAGGED_FOR_REVIEW',
            actionTaken: fraudAnalysis.decision === 'REJECTED'
                ? 'CLAIM_REJECTED'
                : fraudAnalysis.nextAction === 'AUTO_APPROVE'
                ? 'CLAIM_APPROVED'
                : 'CLAIM_QUEUED_FOR_REVIEW'
        });
    }

    if (fraudAnalysis.decision === 'REJECTED') {
        return {
            claim,
            wasDuplicate: false
        };
    }

    if (fraudAnalysis.nextAction !== 'AUTO_APPROVE') {
        return {
            claim,
            wasDuplicate: false,
            payoutBreakdown: {
                triggerSeverity: trigger.severity,
                workerImpact,
                personalizationMultiplier,
                authenticityMultiplier,
                estimatedLoss,
                approvedAmount: 0,
                reviewTier: fraudAnalysis.reviewTier,
                nextAction: fraudAnalysis.nextAction
            }
        };
    }

    const payoutResult = await payoutService.processPayout({
        userId: user._id,
        claimId: claim._id,
        amount: approvedAmount,
        method: 'WALLET'
    });

    claim.status = CLAIM_STATUS.PAID;
    claim.payoutAmount = approvedAmount;
    claim.payoutMethod = 'WALLET';
    claim.payoutDate = new Date();
    await claim.save();

    return {
        claim,
        payoutResult,
        payoutBreakdown: {
            triggerSeverity: trigger.severity,
            workerImpact,
            personalizationMultiplier,
            authenticityMultiplier,
            estimatedLoss,
            approvedAmount
        },
        wasDuplicate: false
    };
}

async function fetchOpenWeatherSnapshot(latitude, longitude) {
    const apiKey = process.env.WEATHER_API_KEY || process.env.OPENWEATHER_API_KEY;
    if (!apiKey) {
        return null;
    }

    const [weatherRes, airRes] = await Promise.all([
        axios.get('https://api.openweathermap.org/data/2.5/weather', {
            params: { lat: latitude, lon: longitude, appid: apiKey, units: 'metric' },
            timeout: 10000
        }),
        axios.get('https://api.openweathermap.org/data/2.5/air_pollution', {
            params: { lat: latitude, lon: longitude, appid: apiKey },
            timeout: 10000
        })
    ]);

    const weather = weatherRes.data;
    const air = airRes.data;

    return {
        rainfall: weather.rain?.['1h'] || weather.rain?.['3h'] || 0,
        temperature: weather.main?.temp ?? 25,
        humidity: weather.main?.humidity ?? 60,
        windSpeed: weather.wind?.speed ?? 0,
        aqi: (air.list?.[0]?.main?.aqi || 1) * 50,
        address: weather.name || '',
    };
}

async function fetchWeatherApiSnapshot(latitude, longitude) {
    const apiKey = process.env.WEATHERAPI_KEY || process.env.WEATHER_API_COM_KEY;
    if (!apiKey) {
        return null;
    }

    const response = await axios.get('https://api.weatherapi.com/v1/current.json', {
        params: {
            key: apiKey,
            q: `${latitude},${longitude}`,
            aqi: 'yes'
        },
        timeout: 10000
    });

    const current = response.data?.current || {};
    const location = response.data?.location || {};

    return {
        rainfall: current?.precip_mm ?? 0,
        temperature: current?.temp_c ?? 25,
        humidity: current?.humidity ?? 60,
        windSpeed: current?.wind_kph != null ? Number((current.wind_kph / 3.6).toFixed(2)) : 0,
        aqi: current?.air_quality?.['us-epa-index'] != null ? Number(current.air_quality['us-epa-index']) * 50 : 50,
        address: location?.name || ''
    };
}

async function fetchOpenMeteoSnapshot(latitude, longitude) {
    const [weatherRes, airRes] = await Promise.all([
        axios.get('https://api.open-meteo.com/v1/forecast', {
            params: {
                latitude,
                longitude,
                current: 'temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m',
                forecast_days: 1
            },
            timeout: 10000
        }),
        axios.get('https://air-quality-api.open-meteo.com/v1/air-quality', {
            params: {
                latitude,
                longitude,
                current: 'us_aqi'
            },
            timeout: 10000
        })
    ]);

    return {
        rainfall: weatherRes.data?.current?.precipitation ?? 0,
        temperature: weatherRes.data?.current?.temperature_2m ?? 25,
        humidity: weatherRes.data?.current?.relative_humidity_2m ?? 60,
        windSpeed: weatherRes.data?.current?.wind_speed_10m ?? 0,
        aqi: airRes.data?.current?.us_aqi ?? 50,
        address: ''
    };
}

async function fetchImdSnapshot(latitude, longitude) {
    const imdUrl = process.env.IMD_WEATHER_API_URL || process.env.IMD_API_URL;
    if (!imdUrl) {
        return null;
    }

    const headers = {};
    if (process.env.IMD_API_KEY) {
        headers['x-api-key'] = process.env.IMD_API_KEY;
    }
    if (process.env.IMD_API_TOKEN) {
        headers.Authorization = `Bearer ${process.env.IMD_API_TOKEN}`;
    }

    const response = await axios.get(imdUrl, {
        params: { latitude, longitude },
        headers,
        timeout: 12000
    });

    const payload = response.data?.data || response.data || {};
    return {
        rainfall: payload.rainfall_mm ?? payload.rainfall ?? payload.precipitation ?? 0,
        temperature: payload.temperature_c ?? payload.temperature ?? 25,
        humidity: payload.humidity ?? 60,
        windSpeed: payload.wind_speed_mps ?? payload.windSpeed ?? 0,
        aqi: payload.us_aqi ?? payload.aqi ?? 50,
        address: payload.locationName || payload.address || ''
    };
}

function buildConsensusWeatherSnapshot(providerSnapshots = {}) {
    const available = Object.entries(providerSnapshots)
        .filter(([, snapshot]) => snapshot && typeof snapshot === 'object')
        .map(([source, snapshot]) => ({ source, snapshot }));

    if (!available.length) {
        return {
            snapshot: null,
            dataSource: 'MANUAL',
            providerSources: [],
            trustedSource: null,
            providerAgreementScore: 0,
            sourceSpreadRain: null,
            sourceSpreadAqi: null
        };
    }

    const rainValues = available.map(({ snapshot }) => snapshot.rainfall);
    const aqiValues = available.map(({ snapshot }) => snapshot.aqi);
    const avgRain = averageNumeric(rainValues);
    const avgAqi = averageNumeric(aqiValues);
    const avgTemp = averageNumeric(available.map(({ snapshot }) => snapshot.temperature));
    const avgHumidity = averageNumeric(available.map(({ snapshot }) => snapshot.humidity));
    const avgWind = averageNumeric(available.map(({ snapshot }) => snapshot.windSpeed));
    const sourceSpreadRain = avgRain == null
        ? null
        : Math.max(...available.map(({ snapshot }) => Math.abs((snapshot.rainfall ?? avgRain) - avgRain)));
    const sourceSpreadAqi = avgAqi == null
        ? null
        : Math.max(...available.map(({ snapshot }) => Math.abs((snapshot.aqi ?? avgAqi) - avgAqi)));
    const providerAgreementScore = clamp(
        1 - (((sourceSpreadRain || 0) / 80) * 0.6 + ((sourceSpreadAqi || 0) / 200) * 0.4),
        0,
        1
    );
    const trustedSource = providerSnapshots.imd
        ? 'IMD'
        : providerSnapshots.openWeather
            ? 'OPENWEATHER'
            : available[0].source.toUpperCase();

    return {
        snapshot: {
            rainfall: roundNumber(avgRain ?? 0, 2),
            temperature: roundNumber(avgTemp ?? 25, 2),
            humidity: roundNumber(avgHumidity ?? 60, 2),
            windSpeed: roundNumber(avgWind ?? 0, 2),
            aqi: roundNumber(avgAqi ?? 50, 2),
            address: available.find(({ snapshot }) => snapshot.address)?.snapshot.address || '',
            providerAgreementScore: roundNumber(providerAgreementScore, 3),
            trustedSource,
            providerSources: available.map(({ source }) => source.toUpperCase()),
            sourceSpreadRain: roundNumber(sourceSpreadRain, 2),
            sourceSpreadAqi: roundNumber(sourceSpreadAqi, 2)
        },
        dataSource: available.length > 1 ? 'MULTI_SOURCE' : trustedSource,
        providerSources: available.map(({ source }) => source.toUpperCase()),
        trustedSource,
        providerAgreementScore: roundNumber(providerAgreementScore, 3),
        sourceSpreadRain: roundNumber(sourceSpreadRain, 2),
        sourceSpreadAqi: roundNumber(sourceSpreadAqi, 2)
    };
}

async function testExternalConnectivity({
    latitude = 12.9698,
    longitude = 77.75,
    locationText = 'Whitefield, Bengaluru, IN'
} = {}) {
    const openWeatherApiKey = process.env.WEATHER_API_KEY || process.env.OPENWEATHER_API_KEY || null;
    const pythonBaseUrl = process.env.PYTHON_SERVICE_URL || process.env.RISK_PREDICTION_URL || 'http://localhost:5001';
    const diagnostics = {
        coordinates: {
            latitude,
            longitude,
            locationText
        },
        environment: {
            hasOpenWeatherApiKey: Boolean(openWeatherApiKey),
            hasWeatherApiKey: Boolean(process.env.WEATHERAPI_KEY || process.env.WEATHER_API_COM_KEY),
            hasImdApiUrl: Boolean(process.env.IMD_WEATHER_API_URL || process.env.IMD_API_URL),
            pythonServiceUrl: pythonBaseUrl
        },
        services: {}
    };

    try {
        const imdSnapshot = await fetchImdSnapshot(latitude, longitude);
        diagnostics.services.imd = imdSnapshot
            ? {
                ok: true,
                provider: 'IMD',
                rainfall: imdSnapshot.rainfall,
                aqi: imdSnapshot.aqi,
                weatherName: imdSnapshot.address || null
            }
            : {
                ok: false,
                skipped: true,
                reason: 'IMD_WEATHER_API_URL not configured'
            };
    } catch (error) {
        diagnostics.services.imd = {
            ok: false,
            error: normalizeAxiosError(error)
        };
    }

    try {
        const response = await axios.get('https://api.open-meteo.com/v1/forecast', {
            params: {
                latitude,
                longitude,
                current: 'temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m',
                forecast_days: 1
            },
            timeout: 10000
        });

        diagnostics.services.openMeteo = {
            ok: true,
            status: response.status,
            current: response.data?.current || null
        };
    } catch (error) {
        diagnostics.services.openMeteo = {
            ok: false,
            error: normalizeAxiosError(error)
        };
    }

    if (openWeatherApiKey) {
        try {
            const weatherResponse = await axios.get('https://api.openweathermap.org/data/2.5/weather', {
                params: { lat: latitude, lon: longitude, appid: openWeatherApiKey, units: 'metric' },
                timeout: 10000
            });
            const airResponse = await axios.get('https://api.openweathermap.org/data/2.5/air_pollution', {
                params: { lat: latitude, lon: longitude, appid: openWeatherApiKey },
                timeout: 10000
            });

            diagnostics.services.openWeather = {
                ok: true,
                weatherStatus: weatherResponse.status,
                airStatus: airResponse.status,
                weatherName: weatherResponse.data?.name || null,
                rainfall: weatherResponse.data?.rain?.['1h'] || weatherResponse.data?.rain?.['3h'] || 0,
                aqiBucket: airResponse.data?.list?.[0]?.main?.aqi || null
            };
        } catch (error) {
            diagnostics.services.openWeather = {
                ok: false,
                error: normalizeAxiosError(error)
            };
        }
    } else {
        diagnostics.services.openWeather = {
            ok: false,
            error: {
                message: 'WEATHER_API_KEY / OPENWEATHER_API_KEY is not configured',
                code: 'MISSING_API_KEY'
            }
        };
    }

    try {
        const weatherApi = await fetchWeatherApiSnapshot(latitude, longitude);
        diagnostics.services.weatherApi = weatherApi
            ? {
                ok: true,
                rainfall: weatherApi.rainfall,
                aqi: weatherApi.aqi,
                weatherName: weatherApi.address || null
            }
            : {
                ok: false,
                skipped: true,
                reason: 'WEATHERAPI_KEY not configured'
            };
    } catch (error) {
        diagnostics.services.weatherApi = {
            ok: false,
            error: normalizeAxiosError(error)
        };
    }

    try {
        const pythonResponse = await axios.post(`${pythonBaseUrl}/api/predict`, {
            user_id: 'debug-user',
            weather_data: {
                rainfall: 65,
                aqi: 240,
                humidity: 80,
                temperature: 29,
                wind_speed: 8
            },
            location_data: {
                latitude,
                longitude,
                address: locationText
            },
            activity_data: {
                deliveries_completed: 5,
                working_hours: 6,
                avg_speed: 25,
                stops: 4
            },
            historical_claims: 1
        }, {
            timeout: 10000
        });

        diagnostics.services.pythonRiskEngine = {
            ok: true,
            status: pythonResponse.status,
            riskLevel: pythonResponse.data?.risk_level || null,
            disruptionsDetected: pythonResponse.data?.disruptions_detected || [],
            suggestedPayout: pythonResponse.data?.prediction?.suggested_payout_inr ?? null
        };
    } catch (error) {
        diagnostics.services.pythonRiskEngine = {
            ok: false,
            error: normalizeAxiosError(error)
        };
    }

    return diagnostics;
}

async function geocodeLocation(locationText) {
    const apiKey = process.env.WEATHER_API_KEY || process.env.OPENWEATHER_API_KEY;
    if (!apiKey || !locationText) {
        return null;
    }

    try {
        const response = await axios.get('https://api.openweathermap.org/geo/1.0/direct', {
            params: {
                q: locationText,
                limit: 1,
                appid: apiKey
            },
            timeout: 10000
        });

        const match = response.data?.[0];
        if (!match) {
            return null;
        }

        return {
            latitude: match.lat,
            longitude: match.lon,
            address: [match.name, match.state, match.country].filter(Boolean).join(', ')
        };
    } catch (error) {
        return null;
    }
}

function mapModelLevelToScore(level) {
    if (typeof level === 'number' && Number.isFinite(level)) {
        return clamp(Math.round(level), 0, 100);
    }

    switch ((level || '').toUpperCase()) {
        case 'CRITICAL':
            return 95;
        case 'HIGH':
        case 'VERY_HIGH':
            return 80;
        case 'MEDIUM':
            return 60;
        case 'LOW':
            return 30;
        case 'VERY_LOW':
            return 15;
        default:
            return null;
    }
}

async function fetchModelRiskScore({ user, policyId, weatherData, trafficProfile, claimCount }) {
    const baseUrl = process.env.PYTHON_SERVICE_URL || process.env.RISK_PREDICTION_URL || 'http://localhost:5001';
    const latitude = user.latitude;
    const longitude = user.longitude;

    if (latitude == null || longitude == null) {
        return null;
    }

    try {
        const response = await axios.post(`${baseUrl}/api/predict`, {
            user_id: String(user._id),
            policy_id: policyId ? String(policyId) : null,
            weather_data: {
                rainfall: weatherData.rainfall,
                temperature: weatherData.temperature,
                humidity: weatherData.humidity,
                aqi: weatherData.aqi,
                wind_speed: weatherData.windSpeed
            },
            location_data: {
                latitude,
                longitude,
                address: user.location
            },
            activity_data: {
                deliveries_completed: trafficProfile.activeDeliveries,
                working_hours: trafficProfile.workingHours,
                avg_speed: trafficProfile.avgDeliveryTime ? clamp(60 - trafficProfile.avgDeliveryTime, 0, 60) : 0,
                stops: trafficProfile.routeBlockages
            },
            historical_claims: claimCount
        }, {
            timeout: 10000
        });

        const level = response.data?.risk_score ?? response.data?.risk_level ?? response.data?.riskLevel;
        return mapModelLevelToScore(level);
    } catch (error) {
        try {
            const response = await axios.get(`${baseUrl}/predict`, {
                params: {
                    rainfall: weatherData.rainfall || 0,
                    aqi: weatherData.aqi || 0,
                    humidity: weatherData.humidity || 0,
                    temperature: weatherData.temperature || 25,
                    traffic: clamp((trafficProfile.routeBlockages || 0) / 5, 0, 1)
                },
                timeout: 10000
            });

            const level = response.data?.risk_score ?? response.data?.risk_level ?? response.data?.riskLevel;
            return mapModelLevelToScore(level);
        } catch (fallbackError) {
            return null;
        }
    }
}

async function fetchFutureRiskForecast({ user, activePolicy, trafficProfile, claimCount }) {
    const baseUrl = process.env.FUTURE_RISK_API_URL || process.env.RISK_FORECAST_API_URL || 'http://127.0.0.1:8002';

    if (user.latitude == null || user.longitude == null) {
        return null;
    }

    try {
        const response = await axios.post(`${baseUrl}/api/predict-future-risk`, {
            user_id: String(user._id),
            policy_id: activePolicy?._id ? String(activePolicy._id) : null,
            location_data: {
                latitude: user.latitude,
                longitude: user.longitude,
                address: user.location,
                timezone: process.env.TIMEZONE_NAME || 'Asia/Kolkata'
            },
            activity_profile: {
                deliveries_completed: trafficProfile.activeDeliveries,
                working_hours: trafficProfile.workingHours,
                avg_speed: trafficProfile.avgDeliveryTime ? clamp(60 - trafficProfile.avgDeliveryTime, 0, 60) : 0,
                stops: trafficProfile.routeBlockages,
                blocked_routes_pct: clamp((trafficProfile.routeBlockages || 0) * 20, 0, 100),
                avg_route_delay_min: trafficProfile.avgDeliveryTime || 0
            },
            historical_claims: claimCount,
            horizon_hours: 24,
            interval_hours: 3,
            universal_engine_url: process.env.PYTHON_SERVICE_URL || process.env.RISK_PREDICTION_URL || 'http://127.0.0.1:8000'
        }, {
            timeout: 15000
        });

        return response.data;
    } catch (error) {
        return null;
    }
}

function buildForecastAlerts(user, futureRiskData) {
    const payload = futureRiskData?.data || futureRiskData;
    const summary = payload?.summary;

    if (!summary) {
        return {
            generated: false,
            sent: false,
            reason: 'Future risk service unavailable'
        };
    }

    if (!summary.future_disruption_likely) {
        return {
            generated: true,
            sent: false,
            level: 'INFO',
            title: 'Next 24h outlook stable',
            message: `No severe disruption forecast for ${user.platform || 'gig'} operations in the next 24 hours.`,
            peakForecastTimeLocal: summary.peak_forecast_time_local || null,
            maxRiskScore: summary.max_risk_score || 0
        };
    }

    return {
        generated: true,
        sent: false,
        level: summary.max_risk_level === 'CRITICAL' ? 'CRITICAL' : 'WARNING',
        title: 'Next 24h disruption alert',
        message: `Forecast risk peaks at ${summary.max_risk_level} (${summary.max_risk_score}) around ${summary.peak_forecast_time_local}.`,
        peakForecastTimeLocal: summary.peak_forecast_time_local || null,
        maxRiskScore: summary.max_risk_score || 0,
        severeWindowCount: summary.severe_window_count || 0
    };
}

function buildCurrentRiskAlert(user, riskRecord) {
    const overallRisk = riskRecord?.riskMetrics?.overallRisk;
    if (typeof overallRisk !== 'number') {
        return null;
    }

    const zone = riskRecord?.locationData?.address || user.location || 'Your zone';
    const timestamp = riskRecord?.timestamp || new Date().toISOString();

    if (overallRisk >= 80) {
        return {
            id: `current-critical-${user._id}`,
            title: 'Critical risk in your zone',
            description: `Current disruption risk is ${overallRisk}/100. Pause work and wait for safer conditions.`,
            severity: 'Critical',
            timestamp,
            zone
        };
    }

    if (overallRisk >= 60) {
        return {
            id: `current-high-${user._id}`,
            title: 'High risk advisory',
            description: `Current disruption risk is ${overallRisk}/100. Limit exposure and avoid long routes.`,
            severity: 'High',
            timestamp,
            zone
        };
    }

    if (overallRisk >= 35) {
        return {
            id: `current-medium-${user._id}`,
            title: 'Moderate risk advisory',
            description: `Current disruption risk is ${overallRisk}/100. Continue with caution.`,
            severity: 'Medium',
            timestamp,
            zone
        };
    }

    return {
        id: `current-info-${user._id}`,
        title: 'Low risk update',
        description: `Current disruption risk is ${overallRisk}/100. Conditions look stable.`,
        severity: 'Info',
        timestamp,
        zone
    };
}

function mapWorkflowAlertToFeed(user, alert, riskRecord) {
    if (!alert?.generated) {
        return null;
    }

    return {
        id: `forecast-${user._id}`,
        title: alert.title || 'Forecast update',
        description: alert.message || alert.reason || 'No forecast update available.',
        severity: alert.level === 'CRITICAL'
            ? 'Critical'
            : alert.level === 'WARNING'
                ? 'High'
                : alert.level === 'INFO'
                    ? 'Info'
                    : 'Medium',
        timestamp: riskRecord?.timestamp || new Date().toISOString(),
        zone: riskRecord?.locationData?.address || user.location || 'Your zone'
    };
}

async function dispatchForecastAlert(user, alert) {
    if (!alert?.generated) {
        return alert;
    }

    const automationBase = process.env.AUTOMATION_API_URL;
    if (!automationBase) {
        return {
            ...alert,
            sent: false,
            reason: 'AUTOMATION_API_URL not configured'
        };
    }

    try {
        const deviceTokens = (user?.deviceTokens || [])
            .map((entry) => entry?.token)
            .filter((token) => typeof token === 'string' && token.trim().length > 0);

        await axios.post(`${automationBase}/api/v1/automation/notifications/send`, {
            userId: user._id,
            type: alert.level === 'INFO' ? 'forecast_info' : 'forecast_alert',
            message: alert.message,
            data: {
                title: alert.title,
                severity: alert.level || 'INFO',
                zone: user.location || 'Your zone',
                peakForecastTimeLocal: alert.peakForecastTimeLocal,
                maxRiskScore: alert.maxRiskScore
            },
            deviceTokens
        }, {
            timeout: 5000
        });

        return {
            ...alert,
            sent: true
        };
    } catch (error) {
        return {
            ...alert,
            sent: false,
            reason: 'Automation notification API unavailable'
        };
    }
}

async function fetchLiveExternalSignals(latitude, longitude, fallbackWeather = {}, options = {}) {
    let weatherSnapshot = null;
    let dataSource = 'MANUAL';
    let neighboringRainfall = fallbackWeather.neighboringRainfall ?? null;
    let trustedSource = fallbackWeather.trustedSource ?? null;
    let providerSources = fallbackWeather.providerSources ?? [];
    let providerAgreementScore = fallbackWeather.providerAgreementScore ?? null;
    let sourceSpreadRain = fallbackWeather.sourceSpreadRain ?? null;
    let sourceSpreadAqi = fallbackWeather.sourceSpreadAqi ?? null;

    if (latitude != null && longitude != null) {
        const providerSnapshots = {};
        const crossCheckEnabled = options.crossCheck !== false;

        if (!crossCheckEnabled) {
            try {
                const openWeather = await fetchOpenWeatherSnapshot(latitude, longitude);
                if (openWeather) providerSnapshots.openWeather = openWeather;
            } catch (error) {}

            if (!providerSnapshots.openWeather) {
                try {
                    const openMeteo = await fetchOpenMeteoSnapshot(latitude, longitude);
                    if (openMeteo) providerSnapshots.openMeteo = openMeteo;
                } catch (error) {}
            }

            if (!providerSnapshots.openWeather && !providerSnapshots.openMeteo) {
                try {
                    const weatherApi = await fetchWeatherApiSnapshot(latitude, longitude);
                    if (weatherApi) providerSnapshots.weatherApi = weatherApi;
                } catch (error) {}
            }

            if (!providerSnapshots.openWeather && !providerSnapshots.openMeteo && !providerSnapshots.weatherApi) {
                try {
                    const imd = await fetchImdSnapshot(latitude, longitude);
                    if (imd) providerSnapshots.imd = imd;
                } catch (error) {}
            }
        } else {
            try {
                const imd = await fetchImdSnapshot(latitude, longitude);
                if (imd) providerSnapshots.imd = imd;
            } catch (error) {}

            try {
                const openWeather = await fetchOpenWeatherSnapshot(latitude, longitude);
                if (openWeather) providerSnapshots.openWeather = openWeather;
            } catch (error) {}

            try {
                const openMeteo = await fetchOpenMeteoSnapshot(latitude, longitude);
                if (openMeteo) providerSnapshots.openMeteo = openMeteo;
            } catch (error) {}

            try {
                const weatherApi = await fetchWeatherApiSnapshot(latitude, longitude);
                if (weatherApi) providerSnapshots.weatherApi = weatherApi;
            } catch (error) {}
        }

        if (crossCheckEnabled) {
            const consensus = buildConsensusWeatherSnapshot(providerSnapshots);
            if (consensus.snapshot) {
                weatherSnapshot = consensus.snapshot;
                dataSource = consensus.dataSource;
                trustedSource = consensus.trustedSource;
                providerSources = consensus.providerSources;
                providerAgreementScore = consensus.providerAgreementScore;
                sourceSpreadRain = consensus.sourceSpreadRain;
                sourceSpreadAqi = consensus.sourceSpreadAqi;
            }
        } else {
            const firstSource = Object.entries(providerSnapshots).find(([, snapshot]) => snapshot && typeof snapshot === 'object');
            if (firstSource) {
                const [source, snapshot] = firstSource;
                weatherSnapshot = snapshot;
                dataSource = source.toUpperCase();
                trustedSource = source.toUpperCase();
                providerSources = [source.toUpperCase()];
                providerAgreementScore = 1;
                sourceSpreadRain = 0;
                sourceSpreadAqi = 0;
            }
        }

        try {
            const nearbySnapshot = await fetchOpenMeteoSnapshot(latitude + 0.045, longitude + 0.045);
            neighboringRainfall = nearbySnapshot?.rainfall ?? neighboringRainfall;
        } catch (neighborError) {
            neighboringRainfall = neighboringRainfall ?? null;
        }
    }

    return {
        weatherData: {
            rainfall: weatherSnapshot?.rainfall ?? fallbackWeather.rainfall ?? null,
            temperature: weatherSnapshot?.temperature ?? fallbackWeather.temperature ?? null,
            humidity: weatherSnapshot?.humidity ?? fallbackWeather.humidity ?? null,
            aqi: weatherSnapshot?.aqi ?? fallbackWeather.aqi ?? null,
            windSpeed: weatherSnapshot?.windSpeed ?? fallbackWeather.windSpeed ?? null,
            neighboringRainfall,
            trustedSource,
            providerSources,
            providerAgreementScore,
            sourceSpreadRain,
            sourceSpreadAqi
        },
        dataSource,
        address: weatherSnapshot?.address || ''
    };
}

async function computeLiveRiskSnapshot(user) {
    const activePolicy = await Policy.findOne({
        userId: user._id,
        status: 'ACTIVE',
        paymentStatus: 'PAID',
        paymentProvider: 'RAZORPAY'
    }).sort({ createdAt: -1 });
    const claimCount = await Claim.countDocuments({ userId: user._id });
    const latestStored = await RiskData.findOne({ userId: user._id }).sort({ createdAt: -1, timestamp: -1 });

    const geocoded = (user.latitude == null || user.longitude == null)
        ? await geocodeLocation(user.location)
        : null;

    const latitude = user.latitude ?? latestStored?.locationData?.latitude ?? geocoded?.latitude;
    const longitude = user.longitude ?? latestStored?.locationData?.longitude ?? geocoded?.longitude;

    const fallbackWeather = latestStored?.weatherData || {};
    const externalSignals = await fetchLiveExternalSignals(latitude, longitude, fallbackWeather, {
        crossCheck: user.weatherCrossCheckConsent !== false
    });
    const weatherData = externalSignals.weatherData;

    const trafficProfile = buildTrafficProfile(user.platform);
    const environmentalRisk = calculateEnvironmentalRisk(weatherData);
    const locationRisk = calculateLocationRisk(user);
    const activityRisk = calculateActivityRisk(user, trafficProfile);
    const historicalRisk = calculateHistoricalRisk(claimCount);
    const heuristicRisk = aggregateRisk({ environmentalRisk, locationRisk, activityRisk, historicalRisk });
    const modelRisk = await fetchModelRiskScore({
        user,
        policyId: activePolicy?._id,
        weatherData,
        trafficProfile,
        claimCount
    });
    const blendedRisk = modelRisk == null
        ? heuristicRisk
        : Math.round((heuristicRisk * 0.6) + (modelRisk * 0.4));
    const overallRisk = modelRisk == null
        ? heuristicRisk
        : Math.max(blendedRisk, Math.round(heuristicRisk * 0.9));

    let riskRecord = await RiskData.create({
        userId: user._id,
        policyId: activePolicy?._id,
        weatherData,
        locationData: {
            latitude,
            longitude,
            address: externalSignals.address || geocoded?.address || latestStored?.locationData?.address || user.location,
            zone: latestStored?.locationData?.zone || user.location,
            riskZone: mapRiskLevel(overallRisk)
        },
        activityData: trafficProfile,
        riskMetrics: {
            environmentalRisk,
            locationRisk,
            activityRisk,
            overallRisk
        },
        dataSource: externalSignals.dataSource,
        timestamp: new Date()
    });

    return riskRecord;
}

async function runRiskWorkflow(user) {
    const activePolicy = await Policy.findOne({
        userId: user._id,
        status: 'ACTIVE',
        paymentStatus: 'PAID',
        paymentProvider: 'RAZORPAY'
    }).sort({ createdAt: -1 });
    const claimCount = await Claim.countDocuments({ userId: user._id });
    const riskRecord = await computeLiveRiskSnapshot(user);
    const overallRisk = riskRecord?.riskMetrics?.overallRisk || 0;
    const trafficProfile = riskRecord?.activityData || buildTrafficProfile(user.platform);
    const futureRiskRaw = await fetchFutureRiskForecast({
        user,
        activePolicy,
        trafficProfile,
        claimCount
    });
    const futureRisk = futureRiskRaw?.data || futureRiskRaw || null;
    const forecastPeakRisk = futureRisk?.summary?.max_risk_score || 0;
    const pricingRiskScore = Math.max(overallRisk, forecastPeakRisk);
    let alert = buildForecastAlerts(user, futureRisk);
    alert = await dispatchForecastAlert(user, alert);
    const workflow = {
        userId: user._id,
        policyId: activePolicy?._id || null,
        riskRecordId: riskRecord?._id || null,
        status: 'RISK_CAPTURED',
        risk: {
            overallRisk,
            riskZone: riskRecord?.locationData?.riskZone || mapRiskLevel(overallRisk),
            dataSource: riskRecord?.dataSource || 'MANUAL'
        },
        fraudCheck: {
            skipped: true,
            approved: null,
            score: null,
            flags: []
        },
        weeklyPricing: {
            skipped: true,
            applied: false
        },
        claim: {
            skipped: true,
            created: false
        },
        payout: {
            skipped: true,
            processed: false
        }
    };
    workflow.futureRisk = futureRisk ? {
        horizonHours: futureRisk.horizon_hours,
        intervalHours: futureRisk.interval_hours,
        summary: futureRisk.summary,
        forecastWindows: futureRisk.forecast_windows || []
    } : null;
    workflow.alerts = alert;

    if (!activePolicy) {
        workflow.status = 'NO_ACTIVE_POLICY';
        return { riskRecord, workflow };
    }

    const triggerCandidates = getTriggerCandidates(
        activePolicy,
        riskRecord.weatherData,
        riskRecord.activityData,
        overallRisk
    );

    if (triggerCandidates.length === 0) {
        const pricingResult = await updatePolicyPricing(
            activePolicy,
            user,
            pricingRiskScore,
            riskRecord.weatherData,
            riskRecord.activityData
        );
        workflow.weeklyPricing = {
            skipped: false,
            applied: true,
            weeklyPremium: pricingResult.pricing.weeklyPremium,
            coverageAmount: pricingResult.pricing.coverageAmount,
            riskFactor: pricingResult.riskFactor,
            pricingBreakdown: pricingResult.pricing.pricingBreakdown,
            source: forecastPeakRisk > overallRisk ? 'FORECAST_24H' : 'CURRENT_RISK'
        };
        workflow.status = 'FORECAST_MONITORING_ACTIVE';
        workflow.claim.reason = 'No disruption threshold crossed, so claim and payout were skipped.';
        return { riskRecord, workflow };
    }

    const trigger = triggerCandidates[0];
    const impactAssessment = assessDisruptionImpactEligibility(
        user,
        riskRecord,
        trigger,
        overallRisk,
        futureRisk?.summary || null
    );
    workflow.triggerValidation = {
        eligible: impactAssessment.eligible,
        workingWindowAligned: impactAssessment.workingWindowAligned,
        overlapHours: impactAssessment.overlapHours,
        shiftType: impactAssessment.shiftType,
        outdoorExposure: impactAssessment.outdoorExposure,
        workerImpact: impactAssessment.workerImpact,
        triggerConfidence: impactAssessment.triggerConfidence,
        incomeDisruptionConfidence: impactAssessment.incomeDisruptionConfidence,
        personalizedThresholds: impactAssessment.personalizedThresholds,
        reasons: impactAssessment.reasons
    };

    if (!impactAssessment.eligible) {
        const pricingResult = await updatePolicyPricing(
            activePolicy,
            user,
            pricingRiskScore,
            riskRecord.weatherData,
            riskRecord.activityData
        );
        workflow.weeklyPricing = {
            skipped: false,
            applied: true,
            weeklyPremium: pricingResult.pricing.weeklyPremium,
            coverageAmount: pricingResult.pricing.coverageAmount,
            riskFactor: pricingResult.riskFactor,
            pricingBreakdown: pricingResult.pricing.pricingBreakdown,
            source: forecastPeakRisk > overallRisk ? 'FORECAST_24H' : 'CURRENT_RISK'
        };
        workflow.status = 'DISRUPTION_NOT_IMPACTING_WORKER';
        workflow.claim.reason = `Trigger observed but claim was not initiated because ${impactAssessment.reasons.join('; ')}.`;
        workflow.payout.reason = 'No payout because real worker impact was not validated.';
        return { riskRecord, workflow };
    }

    const estimatedLoss = Math.round(getEstimatedDailyIncome(user.platform) * trigger.severity);
    const triggerEvidence = {
        weatherData: {
            rainfall: riskRecord?.weatherData?.rainfall,
            aqi: riskRecord?.weatherData?.aqi,
            temperature: riskRecord?.weatherData?.temperature,
            providerAgreementScore: riskRecord?.weatherData?.providerAgreementScore,
            trustedSource: riskRecord?.weatherData?.trustedSource,
            providerSources: riskRecord?.weatherData?.providerSources,
            timestamp: riskRecord.timestamp
        },
        locationData: {
            latitude: riskRecord?.locationData?.latitude,
            longitude: riskRecord?.locationData?.longitude,
            address: riskRecord?.locationData?.address,
            timestamp: riskRecord.timestamp
        },
        activityData: {
            deliveriesCompleted: riskRecord?.activityData?.activeDeliveries,
            workingHours: riskRecord?.activityData?.workingHours,
            timestamp: riskRecord.timestamp
        },
        motionData: buildMotionEvidence(user, impactAssessment)
    };

    const fraudAnalysis = await fraudDetectionService.analyzeClaim({
        userId: user._id,
        policyId: activePolicy._id,
        claimType: trigger.claimType,
        riskScore: overallRisk,
        triggerEvidence,
        expectedLoss: estimatedLoss
    });

    workflow.fraudCheck = {
        skipped: false,
        approved: fraudAnalysis.decision !== 'REJECTED',
        score: fraudAnalysis.score,
        flags: fraudAnalysis.flags,
        description: fraudAnalysis.description,
        reviewTier: fraudAnalysis.reviewTier,
        nextAction: fraudAnalysis.nextAction
    };

    if (fraudAnalysis.decision === 'REJECTED') {
        workflow.status = 'FRAUD_REJECTED';
        workflow.weeklyPricing.reason = 'Weekly premium recalculation was skipped because fraud checks failed.';
        workflow.claim.reason = 'Claim creation was blocked by fraud detection.';
        workflow.payout.reason = 'Payout was blocked by fraud detection.';
        return { riskRecord, workflow };
    }

    const pricingResult = await updatePolicyPricing(
        activePolicy,
        user,
        pricingRiskScore,
        riskRecord.weatherData,
        riskRecord.activityData
    );

    workflow.weeklyPricing = {
        skipped: false,
        applied: true,
        weeklyPremium: pricingResult.pricing.weeklyPremium,
        coverageAmount: pricingResult.pricing.coverageAmount,
        riskFactor: pricingResult.riskFactor,
        pricingBreakdown: pricingResult.pricing.pricingBreakdown,
        source: forecastPeakRisk > overallRisk ? 'FORECAST_24H' : 'CURRENT_RISK'
    };

    if (!user.activityConsent) {
        workflow.status = 'MOTION_CONSENT_REQUIRED';
        workflow.claim = {
            skipped: true,
            created: false,
            reason: 'Automated claim payout requires motion detection consent.'
        };
        workflow.payout = {
            skipped: true,
            processed: false,
            reason: 'Enable motion detection to unlock automated payout.'
        };

        const automationBase = process.env.AUTOMATION_API_URL;
        if (automationBase) {
            const deviceTokens = (user?.deviceTokens || [])
                .map((entry) => entry?.token)
                .filter((token) => typeof token === 'string' && token.trim().length > 0);
            try {
                await axios.post(`${automationBase}/api/v1/automation/notifications/send`, {
                    userId: user._id,
                    type: 'motion_consent_required',
                    message: 'Enable motion detection to receive automated payouts.',
                    data: {
                        title: 'Motion Detection Required',
                        severity: 'HIGH',
                        zone: user.location || 'Your zone'
                    },
                    deviceTokens
                }, { timeout: 5000 });
            } catch (error) {}
        }

        return { riskRecord, workflow };
    }

    const claimResult = await autoProcessTriggeredClaim(
        user,
        pricingResult.policy,
        riskRecord,
        trigger,
        fraudAnalysis,
        { futureRiskScore: forecastPeakRisk }
    );

    workflow.claim = {
        skipped: false,
        created: Boolean(claimResult?.claim),
        duplicate: Boolean(claimResult?.wasDuplicate),
        claimId: claimResult?.claim?._id || null,
        type: trigger.claimType,
        status: claimResult?.claim?.status || null,
        approvedAmount: claimResult?.claim?.approvedAmount || 0,
        payoutBreakdown: claimResult?.payoutBreakdown || null
    };

    workflow.payout = {
        skipped: false,
        processed: Boolean(claimResult?.payoutResult),
        method: claimResult?.payoutResult?.method || null,
        transactionId: claimResult?.payoutResult?.transactionId || null,
        amount: claimResult?.payoutResult?.amount || 0
    };

    workflow.status = claimResult?.claim?.status === CLAIM_STATUS.PAID
        ? 'PAYOUT_COMPLETED'
        : claimResult?.claim?.status || 'CLAIM_PROCESSED';

    return {
        riskRecord,
        workflow
    };
}

async function getAlertsSnapshot(user) {
    const activePolicy = await Policy.findOne({
        userId: user._id,
        status: 'ACTIVE',
        paymentStatus: 'PAID',
        paymentProvider: 'RAZORPAY'
    }).sort({ createdAt: -1 });
    const claimCount = await Claim.countDocuments({ userId: user._id });
    const riskRecord = await computeLiveRiskSnapshot(user);
    const trafficProfile = riskRecord?.activityData || buildTrafficProfile(user.platform);
    const futureRiskRaw = await fetchFutureRiskForecast({
        user,
        activePolicy,
        trafficProfile,
        claimCount
    });
    const futureRisk = futureRiskRaw?.data || futureRiskRaw || null;
    const forecastAlert = buildForecastAlerts(user, futureRisk);
    const currentAlert = buildCurrentRiskAlert(user, riskRecord);
    const alertFeed = [
        currentAlert,
        mapWorkflowAlertToFeed(user, forecastAlert, riskRecord)
    ].filter(Boolean);

    return {
        userId: user._id,
        updatedAt: new Date().toISOString(),
        alerts: alertFeed,
        risk: {
            overallRisk: riskRecord?.riskMetrics?.overallRisk || 0,
            dataSource: riskRecord?.dataSource || 'MANUAL',
            zone: riskRecord?.locationData?.address || user.location || null
        },
        futureRisk: futureRisk ? {
            horizonHours: futureRisk.horizon_hours,
            intervalHours: futureRisk.interval_hours,
            summary: futureRisk.summary
        } : null
    };
}

module.exports = {
    computeLiveRiskSnapshot,
    runRiskWorkflow,
    testExternalConnectivity,
    getAlertsSnapshot
};
