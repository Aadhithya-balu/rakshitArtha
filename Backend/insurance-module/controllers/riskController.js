const RiskData = require('../models/RiskData');
const User = require('../models/User');
const Policy = require('../models/Policy');
const Claim = require('../models/Claim');
const axios = require('axios');
const { asyncHandler, APIError } = require('../utils/errorHandler');
const { RESPONSE_CODES, ERRORS } = require('../utils/constants');
const { computeLiveRiskSnapshot, runRiskWorkflow, testExternalConnectivity, getAlertsSnapshot } = require('../services/liveRiskService');

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function mapRiskLabel(score) {
    if (score >= 80) return 'EXTREME';
    if (score >= 60) return 'HIGH';
    if (score >= 35) return 'MEDIUM';
    return 'LOW';
}

function getUserLocationText(user) {
    return [user?.city, user?.deliveryZone].filter(Boolean).join(', ') || user?.location || '';
}

function haversineDistanceKm(lat1, lon1, lat2, lon2) {
    if ([lat1, lon1, lat2, lon2].some((value) => typeof value !== 'number')) {
        return null;
    }

    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Number((R * c).toFixed(2));
}

function scoreZoneRisk({ overallRisk, placeIndex, distanceKm }) {
    const indexPressure = placeIndex * 4;
    const distancePressure = Math.round((distanceKm || 0) * 2);
    return clamp(Math.round(overallRisk * 0.8 + indexPressure + distancePressure), 5, 100);
}

function buildFallbackNearbyZones(user, overallRisk) {
    const baseRisk = clamp(Math.round(overallRisk), 5, 100);
    const zoneName = getUserLocationText(user) || 'Your Area';
    const variants = [
        { suffix: 'Zone 1', offset: 0, distanceKm: 1.2 },
        { suffix: 'Zone 2', offset: 6, distanceKm: 4.8 },
        { suffix: 'Zone 3', offset: 12, distanceKm: 8.6 },
    ];

    return variants.map((variant) => {
        const riskScore = clamp(baseRisk + variant.offset, 5, 100);
        return {
            zoneName: `${zoneName} ${variant.suffix}`,
            placeId: null,
            distanceKm: variant.distanceKm,
            riskScore,
            riskLabel: mapRiskLabel(riskScore)
        };
    });
}

function getCoimbatoreZoneCatalog() {
    return [
        { zoneName: 'Sai Baba Colony', distanceKm: 2.1, offset: 0 },
        { zoneName: 'Sukrawarpettai', distanceKm: 1.7, offset: 3 },
        { zoneName: 'Ukkadam', distanceKm: 4.8, offset: 8 },
        { zoneName: 'Gandhipuram', distanceKm: 3.4, offset: 5 },
        { zoneName: 'Ramanathapuram', distanceKm: 5.9, offset: 10 },
        { zoneName: 'Peelamedu', distanceKm: 8.7, offset: 14 },
        { zoneName: 'Kovaipudur', distanceKm: 9.3, offset: 12 },
        { zoneName: 'Tatabad', distanceKm: 2.8, offset: 4 },
    ];
}

function getBangaloreZoneCatalog() {
    return [
        { zoneName: 'Indiranagar', distanceKm: 2.4, offset: 0 },
        { zoneName: 'Koramangala', distanceKm: 3.1, offset: 4 },
        { zoneName: 'HSR Layout', distanceKm: 5.6, offset: 7 },
        { zoneName: 'Jayanagar', distanceKm: 6.2, offset: 5 },
        { zoneName: 'Malleshwaram', distanceKm: 4.8, offset: 3 },
        { zoneName: 'Whitefield', distanceKm: 12.6, offset: 12 },
        { zoneName: 'Marathahalli', distanceKm: 10.4, offset: 10 },
        { zoneName: 'BTM Layout', distanceKm: 4.1, offset: 5 },
        { zoneName: 'Rajajinagar', distanceKm: 5.0, offset: 4 },
        { zoneName: 'Electronic City', distanceKm: 17.8, offset: 14 },
    ];
}

function getChennaiZoneCatalog() {
    return [
        { zoneName: 'T. Nagar', distanceKm: 2.3, offset: 0 },
        { zoneName: 'Adyar', distanceKm: 5.1, offset: 5 },
        { zoneName: 'Thiruvanmiyur', distanceKm: 6.2, offset: 7 },
        { zoneName: 'Velachery', distanceKm: 8.0, offset: 6 },
        { zoneName: 'Mylapore', distanceKm: 3.9, offset: 3 },
        { zoneName: 'Anna Nagar', distanceKm: 7.2, offset: 8 },
        { zoneName: 'Tambaram', distanceKm: 18.4, offset: 12 },
        { zoneName: 'Alandur', distanceKm: 9.6, offset: 9 },
        { zoneName: 'Egmore', distanceKm: 4.4, offset: 4 },
        { zoneName: 'Porur', distanceKm: 13.2, offset: 11 },
    ];
}

function getGenericCityCatalog() {
    return [
        { zoneName: 'Central Zone', distanceKm: 2.0, offset: 0 },
        { zoneName: 'North Zone', distanceKm: 4.0, offset: 4 },
        { zoneName: 'South Zone', distanceKm: 6.5, offset: 6 },
        { zoneName: 'East Zone', distanceKm: 8.0, offset: 8 },
        { zoneName: 'West Zone', distanceKm: 9.0, offset: 10 },
    ];
}

function getNamedZoneCatalogForLocation(locationText) {
    const normalized = String(locationText || '').toLowerCase();
    const catalogs = [
        {
            keys: ['coimbatore', 'rs puram', 'r.s. puram', 'rspuram'],
            zones: getCoimbatoreZoneCatalog(),
        },
        {
            keys: ['bangalore', 'bengaluru', 'banglore', 'indiranagar', 'koramangala', 'hsr layout'],
            zones: getBangaloreZoneCatalog(),
        },
        {
            keys: ['chennai', 'thiruvanmiyur', 't nagar', 'tambaram', 'adyar', 'velachery', 'mylapore'],
            zones: getChennaiZoneCatalog(),
        },
        {
            keys: ['madurai', 'anna nagar', 'thirumangalam'],
            zones: [
                { zoneName: 'Anna Nagar', distanceKm: 2.0, offset: 0 },
                { zoneName: 'Thirumangalam', distanceKm: 4.6, offset: 6 },
                { zoneName: 'Goripalayam', distanceKm: 3.1, offset: 4 },
                { zoneName: 'KK Nagar', distanceKm: 5.5, offset: 8 },
                { zoneName: 'Palanganatham', distanceKm: 6.8, offset: 10 },
                { zoneName: 'Mattuthavani', distanceKm: 8.4, offset: 12 },
            ],
        },
        {
            keys: ['salem', 'fairlands', 'ammapet'],
            zones: [
                { zoneName: 'Fairlands', distanceKm: 2.1, offset: 0 },
                { zoneName: 'Ammapet', distanceKm: 3.8, offset: 4 },
                { zoneName: 'Hasthampatti', distanceKm: 4.5, offset: 6 },
                { zoneName: 'Five Roads', distanceKm: 3.3, offset: 3 },
                { zoneName: 'Suramangalam', distanceKm: 6.1, offset: 8 },
                { zoneName: 'Gugai', distanceKm: 7.2, offset: 10 },
            ],
        },
        {
            keys: ['tiruppur', 'ooty', 'avinashi'],
            zones: [
                { zoneName: 'Avinashi Road', distanceKm: 2.6, offset: 0 },
                { zoneName: 'PN Road', distanceKm: 4.4, offset: 4 },
                { zoneName: 'Kumar Nagar', distanceKm: 3.5, offset: 3 },
                { zoneName: 'Valipalayam', distanceKm: 5.8, offset: 7 },
                { zoneName: 'Velliangadu', distanceKm: 7.4, offset: 9 },
                { zoneName: 'Mangalam', distanceKm: 8.9, offset: 11 },
            ],
        },
        {
            keys: ['erode', 'brough road', 'perundurai'],
            zones: [
                { zoneName: 'Brough Road', distanceKm: 2.0, offset: 0 },
                { zoneName: 'Perundurai Road', distanceKm: 4.1, offset: 4 },
                { zoneName: 'Mettur Road', distanceKm: 5.0, offset: 6 },
                { zoneName: 'Gandhi Nagar', distanceKm: 3.7, offset: 3 },
                { zoneName: 'Surampatti', distanceKm: 6.3, offset: 8 },
                { zoneName: 'Sathy Road', distanceKm: 8.8, offset: 11 },
            ],
        },
        {
            keys: ['trichy', 'tiruchirappalli', 'srirangam'],
            zones: [
                { zoneName: 'Thillai Nagar', distanceKm: 2.2, offset: 0 },
                { zoneName: 'Srirangam', distanceKm: 6.8, offset: 8 },
                { zoneName: 'Cantonment', distanceKm: 3.9, offset: 4 },
                { zoneName: 'Woraiyur', distanceKm: 4.7, offset: 5 },
                { zoneName: 'KK Nagar', distanceKm: 5.9, offset: 7 },
                { zoneName: 'Palakkarai', distanceKm: 3.1, offset: 3 },
            ],
        },
    ];

    const matched = catalogs.find((catalog) => catalog.keys.some((key) => normalized.includes(key)));
    return matched ? matched.zones : getGenericCityCatalog();
}

function buildNamedZoneFallback(user, overallRisk) {
    const baseRisk = clamp(Math.round(overallRisk), 5, 100);
    const locationText = String(getUserLocationText(user) || '').toLowerCase();

    const namedCatalog = getNamedZoneCatalogForLocation(locationText);
    if (namedCatalog) {
        return namedCatalog.map((zone) => {
            const riskScore = clamp(baseRisk + zone.offset, 5, 100);
            return {
                zoneName: zone.zoneName,
                placeId: null,
                distanceKm: zone.distanceKm,
                riskScore,
                riskLabel: mapRiskLabel(riskScore),
                source: 'district-catalog'
            };
        });
    }

    return buildFallbackNearbyZones(user, overallRisk);
}

async function geocodeLocationIfNeeded(user, googleMapsApiKey) {
    if (typeof user.latitude === 'number' && typeof user.longitude === 'number') {
        return {
            latitude: user.latitude,
            longitude: user.longitude
        };
    }

    const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
        params: {
            address: getUserLocationText(user),
            key: googleMapsApiKey
        },
        timeout: 10000
    });

    const first = response.data?.results?.[0]?.geometry?.location;
    if (!first) {
        throw new APIError('Unable to geocode user location for nearby zones', RESPONSE_CODES.SERVICE_UNAVAILABLE);
    }

    return {
        latitude: first.lat,
        longitude: first.lng
    };
}

async function buildNearbyZones(user) {
    const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GMAPS_API_KEY;
    const latestRisk = await RiskData.findOne({ userId: user._id }).sort({ createdAt: -1, timestamp: -1 });
    const overallRisk = latestRisk?.riskMetrics?.overallRisk ?? 35;

    try {
        if (!googleMapsApiKey) {
            return buildNamedZoneFallback(user, overallRisk);
        }

        const coordinates = await geocodeLocationIfNeeded(user, googleMapsApiKey);
        const placesResponse = await axios.get('https://maps.googleapis.com/maps/api/place/nearbysearch/json', {
            params: {
                key: googleMapsApiKey,
                location: `${coordinates.latitude},${coordinates.longitude}`,
                radius: 10000,
                keyword: 'locality'
            },
            timeout: 10000
        });

        const places = placesResponse.data?.results || [];
        const zones = places
            .map((place, index) => {
            const placeLat = place.geometry?.location?.lat;
            const placeLng = place.geometry?.location?.lng;
            const distanceKm = haversineDistanceKm(
                coordinates.latitude,
                coordinates.longitude,
                placeLat,
                placeLng
            );
            const riskScore = scoreZoneRisk({ overallRisk, placeIndex: index, distanceKm });
            return {
                zoneName: place.vicinity || place.name,
                placeId: place.place_id,
                distanceKm: distanceKm == null ? null : Number(distanceKm.toFixed(2)),
                riskScore,
                riskLabel: mapRiskLabel(riskScore),
                source: 'google-maps'
            };
        })
            .filter((zone) => zone.distanceKm == null || zone.distanceKm <= 10)
            .slice(0, 6);

        if (zones.length === 0) {
            return buildNamedZoneFallback(user, overallRisk);
        }

        return zones;
    } catch (error) {
        return buildNamedZoneFallback(user, overallRisk);
    }
}

exports.getLatestRiskByUserId = asyncHandler(async (req, res) => {
    const { userId } = req.params;

    const riskData = await RiskData.findOne({ userId }).sort({ createdAt: -1, timestamp: -1 });
    if (!riskData) {
        throw new APIError('Risk data not found', RESPONSE_CODES.NOT_FOUND);
    }

    res.status(RESPONSE_CODES.SUCCESS).json({
        success: true,
        data: riskData
    });
});

exports.getLatestRiskByEmail = asyncHandler(async (req, res) => {
    const email = decodeURIComponent(req.params.email).toLowerCase();
    const user = await User.findOne({ email }).select('_id');

    if (!user) {
        throw new APIError(ERRORS.USER_NOT_FOUND, RESPONSE_CODES.NOT_FOUND);
    }

    const riskData = await RiskData.findOne({ userId: user._id }).sort({ createdAt: -1, timestamp: -1 });
    if (!riskData) {
        throw new APIError('Risk data not found', RESPONSE_CODES.NOT_FOUND);
    }

    res.status(RESPONSE_CODES.SUCCESS).json({
        success: true,
        data: riskData
    });
});

exports.refreshRiskByUserId = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const user = await User.findById(userId);

    if (!user) {
        throw new APIError(ERRORS.USER_NOT_FOUND, RESPONSE_CODES.NOT_FOUND);
    }

    const riskData = await computeLiveRiskSnapshot(user);

    res.status(RESPONSE_CODES.SUCCESS).json({
        success: true,
        data: riskData
    });
});

exports.refreshRiskByEmail = asyncHandler(async (req, res) => {
    const email = decodeURIComponent(req.params.email).toLowerCase();
    const user = await User.findOne({ email });

    if (!user) {
        throw new APIError(ERRORS.USER_NOT_FOUND, RESPONSE_CODES.NOT_FOUND);
    }

    const riskData = await computeLiveRiskSnapshot(user);

    res.status(RESPONSE_CODES.SUCCESS).json({
        success: true,
        data: riskData
    });
});

exports.runWorkflowByUserId = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const user = await User.findById(userId);

    if (!user) {
        throw new APIError(ERRORS.USER_NOT_FOUND, RESPONSE_CODES.NOT_FOUND);
    }

    const result = await runRiskWorkflow(user);

    res.status(RESPONSE_CODES.SUCCESS).json({
        success: true,
        data: result
    });
});

exports.runWorkflowByEmail = asyncHandler(async (req, res) => {
    const email = decodeURIComponent(req.params.email).toLowerCase();
    const user = await User.findOne({ email });

    if (!user) {
        throw new APIError(ERRORS.USER_NOT_FOUND, RESPONSE_CODES.NOT_FOUND);
    }

    const result = await runRiskWorkflow(user);

    res.status(RESPONSE_CODES.SUCCESS).json({
        success: true,
        data: result
    });
});

exports.getAlertsByUserId = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const user = await User.findById(userId);

    if (!user) {
        throw new APIError(ERRORS.USER_NOT_FOUND, RESPONSE_CODES.NOT_FOUND);
    }

    const result = await getAlertsSnapshot(user);

    res.status(RESPONSE_CODES.SUCCESS).json({
        success: true,
        data: result
    });
});

exports.getAlertsByEmail = asyncHandler(async (req, res) => {
    const email = decodeURIComponent(req.params.email).toLowerCase();
    const user = await User.findOne({ email });

    if (!user) {
        throw new APIError(ERRORS.USER_NOT_FOUND, RESPONSE_CODES.NOT_FOUND);
    }

    const result = await getAlertsSnapshot(user);

    res.status(RESPONSE_CODES.SUCCESS).json({
        success: true,
        data: result
    });
});

exports.getInsurerDashboardByUserId = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const adminUser = await User.findById(userId);

    if (!adminUser) {
        throw new APIError(ERRORS.USER_NOT_FOUND, RESPONSE_CODES.NOT_FOUND);
    }

    if (adminUser.role !== 'INSURER_ADMIN') {
        throw new APIError('Only insurer admins can access this dashboard', RESPONSE_CODES.FORBIDDEN);
    }

    const [
        totalPolicies,
        activePolicies,
        totalClaims,
        approvedClaims,
        rejectedClaims,
        policies,
        approvedClaimDocs,
        recentRiskData
    ] = await Promise.all([
        Policy.countDocuments({ sourceType: { $ne: 'DEMO' } }),
        Policy.countDocuments({ status: 'ACTIVE', sourceType: { $ne: 'DEMO' } }),
        Claim.countDocuments({ sourceType: { $ne: 'DEMO' } }),
        Claim.countDocuments({ status: 'APPROVED', sourceType: { $ne: 'DEMO' } }),
        Claim.countDocuments({ status: 'REJECTED', sourceType: { $ne: 'DEMO' } }),
        Policy.find({ sourceType: { $ne: 'DEMO' } }, 'amountPaid weeklyPremium').lean(),
        Claim.find({ status: 'APPROVED', sourceType: { $ne: 'DEMO' } }, 'payoutAmount approvedAmount').lean(),
        RiskData.find({}).sort({ createdAt: -1 }).limit(150).lean()
    ]);

    const premiumsCollected = policies.reduce((sum, item) => {
        const paid = typeof item.amountPaid === 'number' ? item.amountPaid : 0;
        const weekly = typeof item.weeklyPremium === 'number' ? item.weeklyPremium : 0;
        return sum + (paid > 0 ? paid : weekly);
    }, 0);

    const payouts = approvedClaimDocs.reduce((sum, item) => {
        const value = typeof item.payoutAmount === 'number'
            ? item.payoutAmount
            : (typeof item.approvedAmount === 'number' ? item.approvedAmount : 0);
        return sum + value;
    }, 0);

    const lossRatio = premiumsCollected > 0
        ? Number((payouts / premiumsCollected).toFixed(3))
        : 0;

    const avgRecentRisk = recentRiskData.length
        ? recentRiskData.reduce((sum, item) => sum + Number(item?.riskMetrics?.overallRisk || 0), 0) / recentRiskData.length
        : 0;
    const avgRainfall = recentRiskData.length
        ? recentRiskData.reduce((sum, item) => sum + Number(item?.weatherData?.rainfall || 0), 0) / recentRiskData.length
        : 0;

    const predictedWeatherClaimsNextWeek = Math.max(
        1,
        Math.round((avgRecentRisk / 18) + (avgRainfall / 25) + (activePolicies / 12))
    );

    res.status(RESPONSE_CODES.SUCCESS).json({
        success: true,
        data: {
            portfolio: {
                totalPolicies,
                activePolicies,
                totalClaims,
                approvedClaims,
                rejectedClaims,
                approvalRate: totalClaims ? Number((approvedClaims / totalClaims).toFixed(3)) : 0
            },
            finance: {
                premiumsCollected: Number(premiumsCollected.toFixed(2)),
                payouts: Number(payouts.toFixed(2)),
                lossRatio
            },
            predictive: {
                avgRecentRisk: Number(avgRecentRisk.toFixed(2)),
                avgRainfall: Number(avgRainfall.toFixed(2)),
                predictedWeatherClaimsNextWeek
            }
        }
    });
});

exports.debugExternalServices = asyncHandler(async (req, res) => {
    const latitude = req.query.lat ? Number(req.query.lat) : 12.9698;
    const longitude = req.query.lon ? Number(req.query.lon) : 77.75;
    const locationText = req.query.location || 'Whitefield, Bengaluru, IN';

    const diagnostics = await testExternalConnectivity({
        latitude,
        longitude,
        locationText
    });

    res.status(RESPONSE_CODES.SUCCESS).json({
        success: true,
        data: diagnostics
    });
});

exports.getNearbyZonesByUserId = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const user = await User.findById(userId);

    if (!user) {
        throw new APIError(ERRORS.USER_NOT_FOUND, RESPONSE_CODES.NOT_FOUND);
    }

    const zones = await buildNearbyZones(user);
    res.status(RESPONSE_CODES.SUCCESS).json({
        success: true,
        data: {
            userId: user._id,
            location: user.location,
            zones,
            updatedAt: new Date().toISOString()
        }
    });
});

exports.getNearbyZonesByEmail = asyncHandler(async (req, res) => {
    const email = decodeURIComponent(req.params.email).toLowerCase();
    const user = await User.findOne({ email });

    if (!user) {
        throw new APIError(ERRORS.USER_NOT_FOUND, RESPONSE_CODES.NOT_FOUND);
    }

    const zones = await buildNearbyZones(user);
    res.status(RESPONSE_CODES.SUCCESS).json({
        success: true,
        data: {
            userId: user._id,
            location: user.location,
            zones,
            updatedAt: new Date().toISOString()
        }
    });
});
