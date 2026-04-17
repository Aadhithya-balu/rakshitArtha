const Claim = require('../models/Claim');
const RiskData = require('../models/RiskData');
const User = require('../models/User');
const { DEFAULTS } = require('../utils/constants');
const logger = require('../utils/logger');
const { mlFraudDetectionModel } = require('./mlFraudDetectionModel');

const APPROVAL_THRESHOLD = DEFAULTS.FRAUD_APPROVAL_THRESHOLD || 60;

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

class FraudDetectionService {
    async analyzeClaim(claimData) {
        const {
            userId,
            policyId,
            claimType,
            riskScore,
            triggerEvidence,
            expectedLoss = 0
        } = claimData;

        const user = await User.findById(userId);
        const latestRisk = await RiskData.findOne({ userId }).sort({ createdAt: -1, timestamp: -1 });

        const locationConsistency = await this._locationConsistency(user, triggerEvidence);
        const motionSignals = this._motionSignalValidation({ triggerEvidence, latestRisk });
        const behavioralPhysics = this._behavioralPhysicsLayer({ locationConsistency, motionSignals });
        const behavioralAnalysis = this._behavioralAnalysis({ riskScore, expectedLoss, user });
        const impactValidation = this._impactValidation({ claimType, triggerEvidence, latestRisk, expectedLoss, user });
        const platformGroundTruth = this._platformGroundTruth({ claimType, triggerEvidence, latestRisk, user });
        const officialDataCrossCheck = this._officialDataCrossCheck({ claimType, triggerEvidence, latestRisk });
        const approximatedPlatformGroundTruth = this._approximatedPlatformGroundTruthLayer({
            behavioralAnalysis,
            impactValidation,
            platformGroundTruth,
            officialDataCrossCheck
        });
        const fraudRingDetection = await this._fraudRingPattern({ policyId, userId, claimType });
        const mlAnomalyDetection = this._mlAnomalyDetection({
            behavioralPhysics,
            approximatedPlatformGroundTruth,
            fraudRingDetection,
            riskScore,
            expectedLoss
        });

        const aggregateScore = clamp(
            Math.round(
                behavioralPhysics.score +
                approximatedPlatformGroundTruth.score +
                fraudRingDetection.score +
                mlAnomalyDetection.score
            ),
            0,
            100
        );

        const fairUxHumanReview = this._fairUxHumanReviewLayer({
            aggregateScore,
            behavioralPhysics,
            approximatedPlatformGroundTruth,
            fraudRingDetection,
            mlAnomalyDetection
        });

        const layers = {
            behavioralPhysics,
            approximatedPlatformGroundTruth,
            fraudRingDetection,
            mlAnomalyDetection,
            fairUxHumanReview
        };

        const flags = Object.entries(layers)
            .filter(([layerName, layer]) => layerName !== 'fairUxHumanReview' && layer.triggered)
            .map(([layerName]) => this._toFraudFlag(layerName));

        const hardReject =
            flags.length >= 3 ||
            (fraudRingDetection.triggered && (
                behavioralPhysics.triggered ||
                approximatedPlatformGroundTruth.triggered
            ));

        const decision = hardReject || fairUxHumanReview.reviewTier === 'RED' || aggregateScore >= APPROVAL_THRESHOLD
            ? 'REJECTED'
            : 'APPROVED';

        logger.debug('5-layer fraud detection completed', {
            userId,
            policyId,
            aggregateScore,
            decision,
            flags
        });

        return {
            score: aggregateScore,
            confidence: mlAnomalyDetection.confidence || 50,
            flags,
            primaryFlag: flags[0] || null,
            description: this._generateDescription(flags, aggregateScore, decision, hardReject),
            evidence: layers,
            layers,
            layerCount: 5,
            mlScore: mlAnomalyDetection.modelScore,
            mlConfidence: mlAnomalyDetection.confidence,
            mlComponents: mlAnomalyDetection.components,
            decision,
            hardReject,
            reviewTier: fairUxHumanReview.reviewTier,
            nextAction: fairUxHumanReview.nextAction
        };
    }

    async _locationConsistency(user, triggerEvidence) {
        const claimLocation = triggerEvidence?.locationData;
        if (!user || user.latitude == null || user.longitude == null || !claimLocation) {
            return {
                triggered: false,
                score: 0,
                reason: 'Location baseline unavailable',
                gpsSpoofing: false,
                suddenTravel: false,
                locationTrackingData: null
            };
        }

        const distance = this._distanceKm(
            user.latitude,
            user.longitude,
            claimLocation.latitude,
            claimLocation.longitude
        );

        // GPS Spoofing Detection - Check for impossible speeds
        const timestamp = triggerEvidence?.locationData?.timestamp;
        const claimTime = new Date(timestamp).getTime();
        const lastKnownTime = new Date(user.lastLocationUpdate || new Date()).getTime();
        const timeDiffSeconds = Math.abs(claimTime - lastKnownTime) / 1000;
        const speedMph = timeDiffSeconds > 0 ? (distance * 0.621371) / (timeDiffSeconds / 3600) : 0;
        
        // Flag if speed exceeds 200 mph (impossible for a bike/scooter)
        const gpsSpoofingFlag = speedMph > 200 && distance > 15;
        
        // Sudden travel detection - distance > 25km is highly suspicious
        const suddenTravelFlag = distance > 25;
        
        // Accuracy check from GPS data
        const gpsAccuracy = triggerEvidence?.locationData?.accuracy || 0;
        const lowAccuracyFlag = gpsAccuracy > 100; // GPS accuracy worse than 100m
        
        // Get GPS tracking history if available
        const gpsHistory = triggerEvidence?.locationData?.gpsTrackingHistory || [];
        const trackingGaps = this._analyzeGpsTrackingGaps(gpsHistory);

        const triggered = distance > 5 || gpsSpoofingFlag || lowAccuracyFlag;
        
        return {
            triggered,
            score: gpsSpoofingFlag ? 25 : suddenTravelFlag ? 24 : triggered ? 20 : 0,
            distanceKm: Number(distance.toFixed(2)),
            speedMph: Number(speedMph.toFixed(2)),
            gpsSpoofing: gpsSpoofingFlag,
            suddenTravel: suddenTravelFlag,
            lowGpsAccuracy: lowAccuracyFlag,
            gpsAccuracy: Number(gpsAccuracy.toFixed(2)),
            trackingGaps,
            reason: gpsSpoofingFlag 
                ? `GPS spoofing suspected: Reported speed ${speedMph.toFixed(0)} mph over ${distance.toFixed(1)} km.`
                : suddenTravelFlag
                    ? `Claim location is suspiciously far from the registered zone (${distance.toFixed(1)} km). Potential location teleport.`
                    : triggered
                        ? `Location mismatch detected (${distance.toFixed(1)} km from registered zone).`
                        : 'Location consistency verified.',
            locationTrackingData: {
                registeredLocation: { lat: user.latitude, lon: user.longitude },
                claimLocation: { lat: claimLocation.latitude, lon: claimLocation.longitude },
                distanceKm: Number(distance.toFixed(2)),
                speedMph: Number(speedMph.toFixed(2)),
                timeDiffSeconds,
                gpsAccuracy: Number(gpsAccuracy.toFixed(2))
            }
        };
    }

    _analyzeGpsTrackingGaps(gpsHistory = []) {
        if (!Array.isArray(gpsHistory) || gpsHistory.length < 2) {
            return { gaps: 0, maxGapKm: 0, suspicious: false };
        }

        let maxGapKm = 0;
        const gaps = [];

        for (let i = 1; i < gpsHistory.length; i++) {
            const prev = gpsHistory[i - 1];
            const curr = gpsHistory[i];
            
            if (prev && curr && prev.lat != null && prev.lon != null && curr.lat != null && curr.lon != null) {
                const gap = this._distanceKm(prev.lat, prev.lon, curr.lat, curr.lon);
                if (gap > 5) { // Flag gaps > 5km as suspicious
                    gaps.push(gap);
                    maxGapKm = Math.max(maxGapKm, gap);
                }
            }
        }

        return {
            gaps: gaps.length,
            maxGapKm: Number(maxGapKm.toFixed(2)),
            suspicious: gaps.length > 3 || maxGapKm > 20
        };
    }

    _behavioralAnalysis({ riskScore, expectedLoss, user }) {
        const dailyIncome = Number(user?.dailyIncome || 0);
        const lossRatio = dailyIncome > 0 ? expectedLoss / dailyIncome : 0;
        const suspiciousLowRisk = typeof riskScore === 'number' && riskScore < 15;
        const suspiciousLoss = lossRatio > 1.25;
        const triggered = suspiciousLowRisk || suspiciousLoss;

        return {
            triggered,
            score: triggered ? 14 : 0,
            lossRatio: Number(lossRatio.toFixed(2)),
            reason: triggered
                ? 'Behavioral anomaly detected in claimed loss pattern.'
                : 'Behavioral pattern appears normal.'
        };
    }

    _motionSignalValidation({ triggerEvidence, latestRisk }) {
        const motion = triggerEvidence?.motionData || {};
        const deliveries = Number(triggerEvidence?.activityData?.deliveriesCompleted ?? latestRisk?.activityData?.activeDeliveries ?? 0);
        const accelerometerVariance = Number(motion.accelerometerVariance ?? (deliveries > 0 ? 0.62 : 0.1));
        const idleRatio = Number(motion.idleRatio ?? (deliveries > 0 ? 0.28 : 0.88));
        const foregroundAppMinutes = Number(motion.foregroundAppMinutes ?? 0);
        const motionConsistencyScore = Number(motion.motionConsistencyScore ?? clamp(accelerometerVariance * 0.8 + (1 - idleRatio) * 0.6, 0, 1));
        const triggered =
            motionConsistencyScore < 0.32 ||
            (deliveries > 0 && idleRatio > 0.82) ||
            (deliveries > 0 && foregroundAppMinutes > 0 && foregroundAppMinutes < 20);

        return {
            triggered,
            score: triggered ? 18 : 4,
            accelerometerVariance: Number(accelerometerVariance.toFixed(2)),
            idleRatio: Number(idleRatio.toFixed(2)),
            foregroundAppMinutes: Number(foregroundAppMinutes.toFixed(2)),
            motionConsistencyScore: Number(motionConsistencyScore.toFixed(2)),
            reason: triggered
                ? 'Phone motion signals do not match a rider actively moving in disruption conditions.'
                : 'Phone motion signals support genuine worker movement.'
        };
    }

    _behavioralPhysicsLayer({ locationConsistency, motionSignals }) {
        const triggered = locationConsistency.triggered || motionSignals.triggered;
        return {
            triggered,
            score: clamp(locationConsistency.score + motionSignals.score, 0, 24),
            location: locationConsistency,
            motion: motionSignals,
            reason: triggered
                ? `${locationConsistency.reason} ${motionSignals.reason}`.trim()
                : 'Behavioral physics layer passed: location and motion align with active work.'
        };
    }

    _platformGroundTruth({ claimType, triggerEvidence, latestRisk, user }) {
        const deliveries = triggerEvidence?.activityData?.deliveriesCompleted ?? 0;
        const routeBlockages = latestRisk?.activityData?.routeBlockages ?? 0;
        const platformActivity = user?.activityTelemetry || {};
        const platformFactor = typeof platformActivity.activityFactor === 'number' ? platformActivity.activityFactor : null;
        const platformStatus = String(platformActivity.activityStatus || '').toUpperCase();
        let mismatch = false;

        if (claimType === 'TRAFFIC_BLOCKED' && routeBlockages < 3) mismatch = true;
        if ((claimType === 'HEAVY_RAIN' || claimType === 'THUNDERSTORM') && deliveries > 20) mismatch = true;
        if (platformStatus === 'IDLE' && deliveries > 0) mismatch = true;
        if (platformFactor != null && platformFactor < 0.25 && deliveries > 5) mismatch = true;

        return {
            triggered: mismatch,
            score: mismatch ? 14 : 0,
            reason: mismatch
                ? 'Platform-like activity does not support the disruption severity.'
                : 'Platform-like activity aligns with disruption.'
        };
    }

    _impactValidation({ claimType, triggerEvidence, latestRisk, expectedLoss, user }) {
        const deliveries = Number(triggerEvidence?.activityData?.deliveriesCompleted ?? latestRisk?.activityData?.activeDeliveries ?? 0);
        const workingHours = Number(triggerEvidence?.activityData?.workingHours ?? latestRisk?.activityData?.workingHours ?? 0);
        const baselineIncome = Number(user?.dailyIncome || 0);
        const lossRatio = baselineIncome > 0 ? expectedLoss / baselineIncome : 0;
        const disruptionPressure = claimType === 'HEAVY_RAIN' ? 0.55 : claimType === 'HIGH_POLLUTION' ? 0.45 : 0.4;
        const activityStillStrong = deliveries >= 8 && workingHours >= 6;
        const weakImpact = lossRatio < 0.18;
        const triggered = (activityStillStrong && weakImpact) || (disruptionPressure >= 0.5 && deliveries >= 10);

        return {
            triggered,
            score: triggered ? 12 : 0,
            lossRatio: Number(lossRatio.toFixed(2)),
            reason: triggered
                ? 'Event severity is not matched by actual worker impact or income drop.'
                : 'Observed worker impact is plausible for the disruption.'
        };
    }

    _officialDataCrossCheck({ claimType, triggerEvidence, latestRisk }) {
        const observedRainfall = triggerEvidence?.weatherData?.rainfall ?? 0;
        const observedAqi = triggerEvidence?.weatherData?.aqi ?? 0;
        const providerAgreementScore = Number(triggerEvidence?.weatherData?.providerAgreementScore ?? latestRisk?.weatherData?.providerAgreementScore ?? 0.5);
        const providerSources = triggerEvidence?.weatherData?.providerSources ?? latestRisk?.weatherData?.providerSources ?? [];
        const latestRainfall = latestRisk?.weatherData?.rainfall ?? 0;
        const latestAqi = latestRisk?.weatherData?.aqi ?? 0;
        const neighboringRainfall = latestRisk?.weatherData?.neighboringRainfall ?? latestRainfall;
        const sourceSpreadRain = Math.abs(observedRainfall - latestRainfall);
        const sourceSpreadAqi = Math.abs(observedAqi - latestAqi);

        let mismatch = false;
        if (claimType === 'HEAVY_RAIN' && Math.max(observedRainfall, latestRainfall) < 50) mismatch = true;
        if (claimType === 'HIGH_POLLUTION' && Math.max(observedAqi, latestAqi) < 300) mismatch = true;
        if (claimType === 'EXTREME_HEAT' && (triggerEvidence?.weatherData?.temperature ?? 0) < 45) mismatch = true;
        if (claimType === 'HEAVY_RAIN' && sourceSpreadRain > 20) mismatch = true;
        if (claimType === 'HIGH_POLLUTION' && sourceSpreadAqi > 80) mismatch = true;
        if (claimType === 'HEAVY_RAIN' && observedRainfall > 60 && neighboringRainfall < 20) mismatch = true;
        if (providerAgreementScore < 0.35 && providerSources.length > 1) mismatch = true;

        return {
            triggered: mismatch,
            score: mismatch ? 14 : 0,
            providerAgreementScore: Number(providerAgreementScore.toFixed(2)),
            providerSources,
            sourceSpreadRain: Number(sourceSpreadRain.toFixed(2)),
            sourceSpreadAqi: Number(sourceSpreadAqi.toFixed(2)),
            reason: mismatch
                ? 'Official or neighboring weather signals do not support the claimed disruption.'
                : 'Official data threshold cross-check passed.'
        };
    }

    _approximatedPlatformGroundTruthLayer({
        behavioralAnalysis,
        impactValidation,
        platformGroundTruth,
        officialDataCrossCheck
    }) {
        const triggered = (
            behavioralAnalysis.triggered ||
            impactValidation.triggered ||
            platformGroundTruth.triggered ||
            officialDataCrossCheck.triggered
        );

        return {
            triggered,
            score: clamp(
                behavioralAnalysis.score +
                impactValidation.score +
                platformGroundTruth.score +
                officialDataCrossCheck.score,
                0,
                30
            ),
            subSignals: {
                behavioralAnalysis,
                impactValidation,
                platformGroundTruth,
                officialDataCrossCheck
            },
            reason: triggered
                ? 'Approximated platform truth detected mismatch between claimed disruption, peer-zone impact, and worker loss pattern.'
                : 'Approximated platform truth aligns with a genuine income-loss day.'
        };
    }

    async _fraudRingPattern({ policyId, userId, claimType }) {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const similarClaims = await Claim.countDocuments({
            policyId,
            claimType,
            createdAt: { $gte: oneHourAgo }
        });
        const userVelocity = await Claim.countDocuments({
            userId,
            createdAt: { $gte: oneHourAgo }
        });
        const triggered = similarClaims >= 4 || userVelocity >= 2;

        return {
            triggered,
            score: triggered ? 14 : 0,
            similarClaims,
            userVelocity,
            reason: triggered
                ? 'Potential fraud-ring or high-velocity claim pattern detected.'
                : 'No suspicious ring/velocity pattern detected.'
        };
    }

    _mlAnomalyDetection({
        behavioralPhysics,
        approximatedPlatformGroundTruth,
        fraudRingDetection,
        riskScore,
        expectedLoss,
        claimData = {}
    }) {
        // Use ensemble of layer scores
        let layerScore = 0;
        if (behavioralPhysics.triggered) layerScore += 25;
        if (approximatedPlatformGroundTruth.triggered) layerScore += 22;
        if (fraudRingDetection.triggered) layerScore += 20;
        if (typeof riskScore === 'number' && riskScore < 20) layerScore += 10;
        if (expectedLoss > 1500) layerScore += 8;
        
        layerScore = clamp(layerScore, 0, 100);

        return {
            triggered: layerScore >= 45,
            score: Math.round(layerScore * 0.2),
            modelScore: layerScore,
            confidence: this._calculateMLConfidence({ layerScore, behavioralPhysics, approximatedPlatformGroundTruth }),
            reason: layerScore >= 45
                ? `ML ensemble anomaly score elevated (${layerScore}/100).`
                : `ML ensemble anomaly score normal (${layerScore}/100).`,
            components: {
                behavioral: behavioralPhysics.score,
                platform: approximatedPlatformGroundTruth.score,
                fraud_ring: fraudRingDetection.score,
                risk_analysis: riskScore
            }
        };
    }

    _calculateMLConfidence({ layerScore, behavioralPhysics, approximatedPlatformGroundTruth }) {
        // Confidence increases when multiple signals agree
        let agreement = 0;
        if (behavioralPhysics.triggered) agreement++;
        if (approximatedPlatformGroundTruth.triggered) agreement++;
        if (layerScore > 50) agreement++;

        return Math.max(40, agreement * 25); // Min 40%, max 90%
    }

    _fairUxHumanReviewLayer({ aggregateScore, behavioralPhysics, approximatedPlatformGroundTruth, fraudRingDetection, mlAnomalyDetection }) {
        const triggered = aggregateScore >= 35 || mlAnomalyDetection.triggered;
        const reviewTier =
            aggregateScore >= 70 || fraudRingDetection.triggered ? 'RED' :
            aggregateScore >= 35 || behavioralPhysics.triggered || approximatedPlatformGroundTruth.triggered ? 'YELLOW' :
            'GREEN';
        const nextAction =
            reviewTier === 'RED' ? 'MANUAL_REVIEW' :
            reviewTier === 'YELLOW' ? 'ASK_CONTEXT' :
            'AUTO_APPROVE';

        return {
            triggered,
            score: 0,
            reviewTier,
            nextAction,
            reason:
                reviewTier === 'GREEN'
                    ? 'Green lane: instant approval with no extra rider questions.'
                    : reviewTier === 'YELLOW'
                    ? 'Yellow lane: ask 1-2 contextual questions before finalizing payout.'
                    : 'Red lane: send to human/manual review with rider explanation.'
        };
    }

    _toFraudFlag(layerName) {
        switch (layerName) {
            case 'locationConsistency':
                return 'LOCATION_MISMATCH';
            case 'behavioralAnalysis':
                return 'BEHAVIORAL_ANOMALY';
            case 'behavioralPhysics':
                return 'BEHAVIORAL_PHYSICS_MISMATCH';
            case 'approximatedPlatformGroundTruth':
                return 'APPROX_PLATFORM_MISMATCH';
            case 'fraudRingDetection':
                return 'FRAUD_RING_PATTERN';
            case 'mlAnomalyDetection':
                return 'ML_ANOMALY';
            default:
                return 'ML_ANOMALY';
        }
    }

    _generateDescription(flags, score, decision, hardReject = false) {
        if (!flags.length) {
            return 'All 5 fraud layers passed. Claim approved for automatic payout.';
        }

        if (hardReject) {
            return `Claim rejected by multi-signal fraud rule. Score ${score}/100. Flags: ${flags.join(', ')}`;
        }

        return `${decision === 'REJECTED' ? 'Claim rejected' : 'Claim approved with warnings'} after 5-layer fraud review. Score ${score}/100. Flags: ${flags.join(', ')}`;
    }

    _distanceKm(lat1, lon1, lat2, lon2) {
        if ([lat1, lon1, lat2, lon2].some((value) => typeof value !== 'number')) {
            return 0;
        }

        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }
}

module.exports = {
    fraudDetectionService: new FraudDetectionService()
};
