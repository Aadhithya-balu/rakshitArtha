const { PLANS } = require('../utils/constants');
const { parseWorkingHours, getShiftDurationHours, getShiftRiskMultiplier, getPeakHoursOverlapHours } = require('../utils/timeParser');

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function isMonsoonMonth(date = new Date()) {
    const month = date.getMonth() + 1;
    return month >= 6 && month <= 9;
}

function normalizePlan(plan, workerType = 'GIG') {
    const normalizedWorkerType = String(workerType || 'GIG').toUpperCase();
    const normalizedInputPlan = String(plan || '').trim().toUpperCase();

    if (!normalizedInputPlan) {
        return normalizedWorkerType === 'GIG' ? 'GIG_STANDARD' : 'STANDARD';
    }

    if (normalizedWorkerType === 'GIG' && !normalizedInputPlan.startsWith('GIG_')) {
        return `GIG_${normalizedInputPlan}`;
    }

    return normalizedInputPlan;
}

exports.calculatePremium = (plan, riskFactor = 1, workerType = 'GIG', options = {}) => {
    const normalizedPlan = normalizePlan(plan, workerType);
    const basePlan = PLANS[normalizedPlan] || PLANS[plan] || PLANS.GIG_STANDARD;
    const safeRiskFactor = clamp(Number(riskFactor) || 1, 0.8, 1.6);
    const seasonalMultiplier = isMonsoonMonth() ? 1.15 : 1;
    const dynamicPlan = /STANDARD|PREMIUM/.test(normalizedPlan);
    const riskMultiplier = dynamicPlan ? safeRiskFactor : 1;
    const workerMultiplier = dynamicPlan && workerType === 'GIG' ? 1.05 : 1;
    const zoneSafetyScore = Number(options.zoneSafetyScore);
    const rainfallForecast = Number(options.rainfallForecast || 0);
    const predictedDisruptionHours = Number(options.predictedDisruptionHours || 0);
    const explicitWeeklyHours = Number(options.weeklyHours);
    const parsedShift = parseWorkingHours(options.workingHours || '');
    const shiftDailyHours = getShiftDurationHours(parsedShift);
    const peakHoursOverlap = Number(options.peakHoursOverlap) > 0
        ? Number(options.peakHoursOverlap)
        : getPeakHoursOverlapHours(parsedShift);
    const weeklyHours = Number.isFinite(explicitWeeklyHours) && explicitWeeklyHours > 0
        ? explicitWeeklyHours
        : shiftDailyHours > 0
            ? shiftDailyHours * 7
            : 40;
    const shiftRiskMultiplier = Number(options.shiftRiskMultiplier) > 0
        ? Number(options.shiftRiskMultiplier)
        : getShiftRiskMultiplier(parsedShift);
    const platformActivityFactor = clamp(Number(options.platformActivity?.activityFactor ?? 1) || 1, 0.05, 1.15);
    const platformIdlePenalty = clamp(Number(options.platformActivity?.idleDuration ?? 0) / 240, 0, 0.12);
    const disruptionProbability = Number.isFinite(Number(options.disruptionProbability))
        ? clamp(Number(options.disruptionProbability), 0.1, 1.5)
        : clamp(
            0.45 +
            (safeRiskFactor * 0.18) +
            (Number.isFinite(zoneSafetyScore) ? clamp(zoneSafetyScore / 100, 0, 1) * 0.18 : 0) +
            clamp(rainfallForecast / 250, 0, 0.18) +
            clamp(predictedDisruptionHours / 12, 0, 0.12) +
            clamp(peakHoursOverlap / 8, 0, 0.08),
            0.2,
            1.35
        );
    const safeZoneDiscount = dynamicPlan && Number.isFinite(zoneSafetyScore) && zoneSafetyScore <= 35 ? 2 : 0;
    const rainfallAdjustment = dynamicPlan
        ? Math.round(clamp((rainfallForecast - 20) / 20, 0, 4))
        : 0;
    const activityMultiplier = clamp(1 + (1 - platformActivityFactor) * 0.14 + platformIdlePenalty, 0.88, 1.18);

    const baseRatePerHour = basePlan.premium / 40;
    const hoursWeightedPremium = baseRatePerHour * weeklyHours;
    const basePremiumCalculated = hoursWeightedPremium * riskMultiplier * seasonalMultiplier * workerMultiplier * shiftRiskMultiplier * disruptionProbability * activityMultiplier;
    
    // Plan-aware premium caps: Premium max 50, Standard max 45
    const isPremiumPlan = /PREMIUM/.test(normalizedPlan);
    const premiumCap = isPremiumPlan ? 50 : 45;
    
    const weeklyPremium = Math.round(
        clamp(basePremiumCalculated + rainfallAdjustment - safeZoneDiscount, 18, premiumCap)
    );

    const coverageHoursBoost = clamp(Math.round(predictedDisruptionHours), 0, 4);
    const coverageMultiplier = 1 + (coverageHoursBoost * 0.04);

    const coverageAmount = Math.round(
        basePlan.coverage * (dynamicPlan ? Math.max(1, safeRiskFactor) : 1) * coverageMultiplier
    );

    return {
        weeklyPremium: dynamicPlan ? weeklyPremium : basePlan.premium,
        coverageAmount,
        pricingBreakdown: {
            normalizedPlan,
            basePremium: basePlan.premium,
            baseCoverage: basePlan.coverage,
            riskFactor: safeRiskFactor,
            riskMultiplierApplied: riskMultiplier,
            seasonalMultiplierApplied: seasonalMultiplier,
            workerMultiplierApplied: workerMultiplier,
            rainfallForecast,
            rainfallAdjustment,
            zoneSafetyScore: Number.isFinite(zoneSafetyScore) ? zoneSafetyScore : null,
            safeZoneDiscount,
            predictedDisruptionHours: Number.isFinite(predictedDisruptionHours) ? predictedDisruptionHours : 0,
            coverageHoursBoost,
            coverageMultiplier,
            dynamicPlan,
            weeklyHours,
            baseRatePerHour,
            shiftRiskMultiplier,
            peakHoursOverlap,
            disruptionProbability,
            platformActivityFactor,
            platformIdlePenalty,
            activityMultiplier,
            lockedPayableAmount: weeklyPremium
        }
    };
};
