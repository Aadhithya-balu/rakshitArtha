const User = require('../models/User');
const Policy = require('../models/Policy');
const Claim = require('../models/Claim');
const RiskData = require('../models/RiskData');
const FraudLog = require('../models/FraudLog');
const Payout = require('../models/Payout');
const PlatformActivitySync = require('../models/PlatformActivitySync');
const payoutService = require('../services/payoutService');
const { asyncHandler, APIError } = require('../utils/errorHandler');
const { RESPONSE_CODES, ERRORS, POLICY_STATUS } = require('../utils/constants');

const DASHBOARD_DEFAULT_LIMIT = 12;
const MAX_LIMIT = 50;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeDate(value, fallback = null) {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function formatMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function escapeRegExp(input) {
  return String(input || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getLabelForClaimType(claimType) {
  const labels = {
    HEAVY_RAIN: 'Rain',
    HIGH_POLLUTION: 'Pollution',
    DISASTER: 'Disaster',
    TRAFFIC_BLOCKED: 'Traffic',
    THUNDERSTORM: 'Thunderstorm',
    EXTREME_HEAT: 'Heat',
    FLOODING: 'Flooding',
    CURFEW: 'Curfew',
    STRIKE: 'Strike',
    UNEXPECTED_EVENT: 'Unexpected event',
    MARKET_CLOSURE: 'Market closure',
    PLATFORM_DOWNTIME: 'Platform downtime'
  };

  return labels[claimType] || claimType || 'Unknown';
}

function getLocationTextFromUser(user) {
  return [user?.city, user?.deliveryZone].filter(Boolean).join(', ') || user?.location || 'Unknown';
}

function buildDateRange(query = {}, defaultDays = 30) {
  const from = normalizeDate(query.from, new Date(Date.now() - defaultDays * 24 * 60 * 60 * 1000));
  const to = normalizeDate(query.to, new Date());
  return { from, to };
}

function buildTrendBucketFields(dateField) {
  return {
    week: {
      $dateToString: {
        format: '%G-W%V',
        date: `$${dateField}`,
        timezone: 'UTC'
      }
    },
    label: {
      $dateToString: {
        format: '%d %b',
        date: `$${dateField}`,
        timezone: 'UTC'
      }
    }
  };
}

function mapStatus(status) {
  if (status === 'COMPLETED') return 'SUCCESS';
  return status;
}

async function ensureInsurerAdmin(userId) {
  const adminUser = await User.findById(userId);
  if (!adminUser) {
    throw new APIError(ERRORS.USER_NOT_FOUND, RESPONSE_CODES.NOT_FOUND);
  }

  if (adminUser.role !== 'INSURER_ADMIN') {
    throw new APIError('Only insurer admins can access this dashboard', RESPONSE_CODES.FORBIDDEN);
  }

  return adminUser;
}

function parsePagination(query = {}, defaultLimit = DASHBOARD_DEFAULT_LIMIT) {
  const limit = clamp(Number.parseInt(query.limit, 10) || defaultLimit, 1, MAX_LIMIT);
  const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
  const skip = (page - 1) * limit;
  return { limit, page, skip };
}

function buildClaimMatch(query = {}, dateRange = {}) {
  const match = {};
  if (query.status) match.status = String(query.status).toUpperCase();
  if (query.disruptionType) match.claimType = String(query.disruptionType).toUpperCase();
  if (query.claimType) match.claimType = String(query.claimType).toUpperCase();
  if (dateRange.from || dateRange.to) {
    match.createdAt = {};
    if (dateRange.from) match.createdAt.$gte = dateRange.from;
    if (dateRange.to) match.createdAt.$lte = dateRange.to;
  }
  return match;
}

function buildPayoutMatch(query = {}, dateRange = {}) {
  const match = {};
  if (query.status) match.status = String(query.status).toUpperCase();
  if (query.method) match.method = String(query.method).toUpperCase();
  if (dateRange.from || dateRange.to) {
    match.createdAt = {};
    if (dateRange.from) match.createdAt.$gte = dateRange.from;
    if (dateRange.to) match.createdAt.$lte = dateRange.to;
  }
  return match;
}

function buildFraudMatch(query = {}, dateRange = {}) {
  const match = {};
  if (query.severity) match.severity = String(query.severity).toUpperCase();
  if (query.decision) match.decision = String(query.decision).toUpperCase();
  if (dateRange.from || dateRange.to) {
    match.createdAt = {};
    if (dateRange.from) match.createdAt.$gte = dateRange.from;
    if (dateRange.to) match.createdAt.$lte = dateRange.to;
  }
  return match;
}

function buildPolicyMatch(query = {}) {
  const match = {};
  if (query.status) match.status = String(query.status).toUpperCase();
  if (query.plan) match.plan = String(query.plan).toUpperCase();
  return match;
}

function buildLocationRegex(query = {}) {
  const location = String(query.location || '').trim();
  if (!location) return null;
  return new RegExp(escapeRegExp(location), 'i');
}

async function buildDuplicateMap(baseMatch) {
  const duplicates = await Claim.aggregate([
    { $match: baseMatch },
    {
      $group: {
        _id: { userId: '$userId', claimType: '$claimType' },
        count: { $sum: 1 },
        latestClaimId: { $last: '$_id' }
      }
    },
    { $match: { count: { $gt: 1 } } }
  ]);

  const map = new Map();
  duplicates.forEach((entry) => {
    map.set(`${String(entry._id.userId)}|${String(entry._id.claimType)}`, entry.count);
  });
  return map;
}

async function buildDashboardSummary() {
  const [
    totalActiveUsers,
    totalPoliciesActive,
    totalClaimsTriggered,
    activePoliciesByPlan,
    premiumAgg,
    payoutAgg,
    highRiskZoneAgg,
    recentRiskAgg,
    disruptionAgg,
    avgRainfallAgg,
    policyTrendAgg,
    payoutTrendAgg,
    claimsByStatusAgg,
    fraudAgg,
    fraudReasonAgg,
    blockedUsersCount,
    repeatedClaimsAgg,
  ] = await Promise.all([
    User.countDocuments({ role: 'WORKER', accountStatus: 'ACTIVE' }),
    Policy.countDocuments({ status: 'ACTIVE' }),
    Claim.countDocuments({}),
    Policy.aggregate([
      { $match: { status: 'ACTIVE' } },
      { $group: { _id: '$plan', count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } }
    ]),
    Policy.aggregate([
      {
        $group: {
          _id: null,
          amountPaidTotal: { $sum: { $ifNull: ['$amountPaid', 0] } },
          weeklyPremiumCollected: { $sum: { $ifNull: ['$weeklyPremium', 0] } },
          activePoliciesPremium: {
            $sum: {
              $cond: [{ $eq: ['$status', 'ACTIVE'] }, { $ifNull: ['$weeklyPremium', 0] }, 0]
            }
          }
        }
      }
    ]),
    Payout.aggregate([
      {
        $group: {
          _id: null,
          totalPayoutAmount: { $sum: { $cond: [{ $eq: ['$status', 'SUCCESS'] }, '$netAmount', 0] } },
          totalPayoutCount: { $sum: 1 },
          successCount: { $sum: { $cond: [{ $eq: ['$status', 'SUCCESS'] }, 1, 0] } },
          failedCount: { $sum: { $cond: [{ $eq: ['$status', 'FAILED'] }, 1, 0] } },
          pendingCount: { $sum: { $cond: [{ $eq: ['$status', 'PENDING'] }, 1, 0] } },
          processingCount: { $sum: { $cond: [{ $eq: ['$status', 'PROCESSING'] }, 1, 0] } }
        }
      }
    ]),
    RiskData.aggregate([
      {
        $match: {
          'riskMetrics.overallRisk': { $gte: 70 }
        }
      },
      {
        $project: {
          zone: { $ifNull: ['$locationData.zone', '$locationData.address'] },
          overallRisk: '$riskMetrics.overallRisk'
        }
      },
      {
        $group: {
          _id: '$zone',
          maxRisk: { $max: '$overallRisk' },
          avgRisk: { $avg: '$overallRisk' },
          count: { $sum: 1 }
        }
      },
      { $sort: { maxRisk: -1, count: -1 } }
    ]),
    RiskData.aggregate([
      {
        $group: {
          _id: {
            $ifNull: ['$locationData.zone', '$locationData.address']
          },
          avgRisk: { $avg: '$riskMetrics.overallRisk' },
          latestRisk: { $last: '$riskMetrics.overallRisk' },
          sampleCount: { $sum: 1 }
        }
      },
      { $sort: { avgRisk: -1, sampleCount: -1 } },
      { $limit: 12 }
    ]),
    Claim.aggregate([
      { $group: { _id: '$claimType', count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } }
    ]),
    RiskData.aggregate([
      { $group: { _id: null, avgRainfall: { $avg: '$weatherData.rainfall' } } }
    ]),
    Policy.aggregate([
      {
        $match: {
          status: 'ACTIVE'
        }
      },
      {
        $group: {
          _id: '$plan',
          count: { $sum: 1 },
          premiumCollected: { $sum: { $ifNull: ['$amountPaid', '$weeklyPremium'] } }
        }
      },
      { $sort: { count: -1 } }
    ]),
    Payout.aggregate([
      {
        $group: {
          _id: {
            week: {
              $dateToString: {
                format: '%G-W%V',
                date: '$createdAt',
                timezone: 'UTC'
              }
            }
          },
          payout: { $sum: { $cond: [{ $eq: ['$status', 'SUCCESS'] }, '$netAmount', 0] } }
        }
      },
      { $sort: { '_id.week': 1 } },
      { $limit: 12 }
    ]),
    Policy.aggregate([
      {
        $group: {
          _id: {
            week: {
              $dateToString: {
                format: '%G-W%V',
                date: { $ifNull: ['$lastPaymentAt', '$createdAt'] },
                timezone: 'UTC'
              }
            }
          },
          revenue: { $sum: { $ifNull: ['$amountPaid', 0] } }
        }
      },
      { $sort: { '_id.week': 1 } },
      { $limit: 12 }
    ]),
    Claim.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]),
    FraudLog.aggregate([
      { $group: { _id: '$userId', maxScore: { $max: '$fraudScore' }, count: { $sum: 1 } } },
      { $sort: { maxScore: -1, count: -1 } },
      { $limit: 12 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $addFields: { user: { $first: '$user' } } }
    ]),
    FraudLog.aggregate([
      { $group: { _id: '$fraudType', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 12 }
    ]),
    User.countDocuments({ accountStatus: 'SUSPENDED' }),
    Claim.aggregate([
      {
        $group: {
          _id: { userId: '$userId', claimType: '$claimType' },
          count: { $sum: 1 }
        }
      },
      { $match: { count: { $gt: 1 } } },
      { $count: 'total' }
    ])
  ]);

  const premiumCollected = Number((premiumAgg[0]?.amountPaidTotal || 0).toFixed(2));
  const weeklyPremiumCollected = Number((premiumAgg[0]?.weeklyPremiumCollected || 0).toFixed(2));
  const activePoliciesPremium = Number((premiumAgg[0]?.activePoliciesPremium || 0).toFixed(2));
  const totalPayoutAmount = Number((payoutAgg[0]?.totalPayoutAmount || 0).toFixed(2));
  const totalPayoutCount = payoutAgg[0]?.totalPayoutCount || 0;
  const lossRatio = premiumCollected > 0 ? Number((totalPayoutAmount / premiumCollected).toFixed(3)) : 0;
  const lossRatioPercent = Number((lossRatio * 100).toFixed(1));
  const highRiskZonesCount = highRiskZoneAgg.length;
  const claimCountsByStatus = claimsByStatusAgg.reduce((acc, item) => {
    acc[item._id || 'UNKNOWN'] = item.count;
    return acc;
  }, {});

  const totalClaimsByType = disruptionAgg.reduce((acc, item) => {
    acc[item._id] = item.count;
    return acc;
  }, {});

  const revenueTrendMap = new Map(policyTrendAgg.map((item) => [item._id.week, Number(item.revenue || 0)]));
  const payoutTrendMap = new Map(payoutTrendAgg.map((item) => [item._id.week, Number(item.payout || 0)]));
  const allTrendWeeks = Array.from(new Set([...revenueTrendMap.keys(), ...payoutTrendMap.keys()])).sort();

  const revenueVsPayoutTrend = allTrendWeeks.map((week) => {
    const revenue = Number(revenueTrendMap.get(week) || 0);
    const payout = Number(payoutTrendMap.get(week) || 0);
    return {
      week,
      revenue: Number(revenue.toFixed(2)),
      payout: Number(payout.toFixed(2)),
      lossRatio: revenue > 0 ? Number((payout / revenue).toFixed(3)) : 0,
    };
  });

  const lossRatioTrend = revenueVsPayoutTrend.map((item) => ({
    week: item.week,
    lossRatio: item.lossRatio,
  }));

  const riskZones = recentRiskAgg.map((zone) => ({
    zone: zone._id || 'Unknown zone',
    riskLevel: zone.avgRisk >= 70 ? 'High' : zone.avgRisk >= 35 ? 'Medium' : 'Low',
    avgRisk: Number(Number(zone.avgRisk || 0).toFixed(1)),
    latestRisk: Number(Number(zone.latestRisk || 0).toFixed(1)),
    sampleCount: zone.sampleCount || 0,
  }));

  const predictedHighRiskZones = riskZones.slice(0, 5).map((zone, index) => ({
    zone: zone.zone,
    riskScore: clamp(Math.round(zone.avgRisk + (5 - index) * 3 + (totalClaimsByType.HEAVY_RAIN || 0) * 0.2), 0, 100),
    confidence: clamp(0.92 - index * 0.08, 0.55, 0.95),
    reason: index === 0 ? 'Highest current risk and recent disruption density' : 'Elevated recent risk trend',
  }));

  const platformActivityAgg = await PlatformActivitySync.aggregate([
    {
      $group: {
        _id: '$sourcePlatform',
        totalSyncs: { $sum: 1 },
        activeCount: { $sum: { $cond: [{ $eq: ['$activityStatus', 'ACTIVE'] }, 1, 0] } },
        idleCount: { $sum: { $cond: [{ $eq: ['$activityStatus', 'IDLE'] }, 1, 0] } },
        avgActivityFactor: { $avg: { $ifNull: ['$activityFactor', 0.5] } },
        avgEarnings: { $avg: { $ifNull: ['$earnings', '$weeklyIncome'] } },
        latestSyncAt: { $max: '$syncTimestamp' },
      }
    },
    { $sort: { totalSyncs: -1, _id: 1 } }
  ]);

  const approvedClaims = claimCountsByStatus.APPROVED || 0;
  const rejectedClaims = claimCountsByStatus.REJECTED || 0;
  const approvalRate = totalClaimsTriggered ? Number((approvedClaims / totalClaimsTriggered).toFixed(3)) : 0;
  const approvalRatePercent = Number((approvalRate * 100).toFixed(1));
  const predictedWeatherClaimsNextWeek = Math.max(1, Math.round((highRiskZonesCount * 1.6) + ((totalClaimsByType.HEAVY_RAIN || 0) * 0.5) + ((totalClaimsByType.HIGH_POLLUTION || 0) * 0.4)));
  const successfulPayoutCount = payoutAgg[0]?.successCount || 0;
  const avgPayoutPerSuccessfulClaim = successfulPayoutCount > 0
    ? Number((totalPayoutAmount / successfulPayoutCount).toFixed(2))
    : Number((totalPayoutAmount / Math.max(totalClaimsTriggered, 1)).toFixed(2));
  const projectedFinancialImpactInr = Number((predictedWeatherClaimsNextWeek * avgPayoutPerSuccessfulClaim).toFixed(2));

  return {
    summary: {
      totalActiveUsers,
      totalPoliciesActive,
      totalClaimsTriggered,
      totalPayoutAmount,
      totalPremiumCollected: premiumCollected,
      weeklyPremiumCollected,
      activePoliciesPremium,
      lossRatio,
      highRiskZonesCount,
      blockedUsersCount,
    },
    portfolio: {
      totalPolicies: await Policy.countDocuments({}),
      activePolicies: totalPoliciesActive,
      totalClaims: totalClaimsTriggered,
      approvedClaims,
      rejectedClaims,
      approvalRate,
      approvalRatePercent,
    },
    finance: {
      premiumsCollected: premiumCollected,
      payouts: totalPayoutAmount,
      lossRatio,
      lossRatioPercent,
    },
    predictive: {
      avgRecentRisk: Number((recentRiskAgg.reduce((sum, item) => sum + Number(item.avgRisk || 0), 0) / Math.max(recentRiskAgg.length, 1)).toFixed(2)),
      avgRainfall: Number((avgRainfallAgg[0]?.avgRainfall || 0).toFixed(2)),
      predictedWeatherClaimsNextWeek,
      projectedFinancialImpactInr,
    },
    policyInsights: {
      weeklyPremiumCollected,
      activePoliciesByPlan: activePoliciesByPlan.map((item) => ({
        plan: item._id,
        count: item.count,
        premiumCollected: Number(item.premiumCollected || 0),
      })),
      revenueVsPayoutTrend,
      lossRatioTrend,
    },
    risk: {
      zoneWiseRiskLevels: riskZones,
      mostAffectedLocations: recentRiskAgg.slice(0, 5).map((zone) => ({
        location: zone._id || 'Unknown zone',
        avgRisk: Number(Number(zone.avgRisk || 0).toFixed(1)),
        latestRisk: Number(Number(zone.latestRisk || 0).toFixed(1)),
        sampleCount: zone.sampleCount || 0,
      })),
      disruptionFrequency: totalClaimsByType,
      predictedHighRiskZones,
      highRiskZonesCount,
    },
    fraud: {
      flaggedUsers: fraudAgg.map((item) => ({
        userId: item._id,
        name: item.user?.name || 'Unknown user',
        email: item.user?.email || null,
        maxFraudScore: item.maxScore,
        flagCount: item.count,
      })),
      fraudRiskScoreByUser: fraudAgg.map((item) => ({
        userId: item._id,
        riskScore: item.maxScore,
      })),
      reasons: fraudReasonAgg.map((item) => ({
        reason: item._id,
        count: item.count,
      })),
      blockedUsersCount,
    },
    claims: {
      total: totalClaimsTriggered,
      countsByStatus: claimCountsByStatus,
    },
    payouts: {
      total: totalPayoutCount,
      countsByStatus: {
        SUCCESS: payoutAgg[0]?.successCount || 0,
        FAILED: payoutAgg[0]?.failedCount || 0,
        PENDING: payoutAgg[0]?.pendingCount || 0,
        PROCESSING: payoutAgg[0]?.processingCount || 0,
      },
      totalPayoutAmount,
    },
    platform: {
      bySource: platformActivityAgg.map((item) => ({
        sourcePlatform: item._id,
        totalSyncs: item.totalSyncs,
        activeCount: item.activeCount,
        idleCount: item.idleCount,
        avgActivityFactor: Number(Number(item.avgActivityFactor || 0).toFixed(3)),
        avgEarnings: Number(Number(item.avgEarnings || 0).toFixed(2)),
        latestSyncAt: item.latestSyncAt,
      })),
      activeWorkers: platformActivityAgg.reduce((sum, item) => sum + (item.activeCount || 0), 0),
      idleWorkers: platformActivityAgg.reduce((sum, item) => sum + (item.idleCount || 0), 0),
    }
  };
}

async function buildClaimList(query = {}) {
  const dateRange = buildDateRange(query, 30);
  const { limit, page, skip } = parsePagination(query, 15);
  const baseMatch = buildClaimMatch(query, dateRange);
  const locationRegex = buildLocationRegex(query);
  const duplicateMap = await buildDuplicateMap(baseMatch);

  const pipeline = [
    { $match: baseMatch },
    { $sort: { createdAt: -1 } },
    {
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: '_id',
        as: 'user'
      }
    },
    {
      $lookup: {
        from: 'policies',
        localField: 'policyId',
        foreignField: '_id',
        as: 'policy'
      }
    },
    {
      $lookup: {
        from: 'payouts',
        localField: '_id',
        foreignField: 'claimId',
        as: 'payout'
      }
    },
    {
      $addFields: {
        user: { $first: '$user' },
        policy: { $first: '$policy' },
        payout: { $first: '$payout' },
      }
    },
  ];

  if (locationRegex) {
    pipeline.push({
      $match: {
        $or: [
          { 'user.location': locationRegex },
          { 'user.city': locationRegex },
          { 'user.deliveryZone': locationRegex },
        ]
      }
    });
  }

  const countPipeline = pipeline.concat([{ $count: 'total' }]);
  const itemsPipeline = pipeline.concat([
    { $skip: skip },
    { $limit: limit },
    {
      $project: {
        _id: 1,
        claimType: 1,
        status: 1,
        riskScore: 1,
        fraudScore: 1,
        fraudFlags: 1,
        fraudReviewTier: 1,
        fraudNextAction: 1,
        fraudFlagDescription: 1,
        approvedAmount: 1,
        payoutAmount: 1,
        payoutMethod: 1,
        payoutDate: 1,
        createdAt: 1,
        reviewedAt: 1,
        user: {
          _id: '$user._id',
          name: '$user.name',
          email: '$user.email',
          phone: '$user.phone',
          city: '$user.city',
          deliveryZone: '$user.deliveryZone',
          location: '$user.location'
        },
        policy: {
          _id: '$policy._id',
          plan: '$policy.plan',
          weeklyPremium: '$policy.weeklyPremium',
          coverageAmount: '$policy.coverageAmount',
          status: '$policy.status'
        },
        payout: {
          payoutId: '$payout.payoutId',
          referenceId: '$payout.referenceId',
          status: '$payout.status',
          method: '$payout.method',
          netAmount: '$payout.netAmount',
          retryCount: '$payout.retryCount'
        }
      }
    }
  ]);

  const [totalResult, claims] = await Promise.all([
    Claim.aggregate(countPipeline),
    Claim.aggregate(itemsPipeline),
  ]);

  const items = claims.map((item) => {
    const duplicateCount = duplicateMap.get(`${String(item.user?._id || '')}|${String(item.claimType || '')}`) || 0;
    const suspicious = Boolean(
      (item.fraudScore || 0) >= 70 ||
      (item.fraudFlags || []).includes('DUPLICATE_CLAIM') ||
      duplicateCount > 1 ||
      item.fraudReviewTier === 'RED' ||
      item.fraudNextAction === 'MANUAL_REVIEW'
    );

    return {
      id: String(item._id),
      claimId: String(item._id),
      userId: item.user?._id ? String(item.user._id) : null,
      userName: item.user?.name || 'Unknown user',
      userEmail: item.user?.email || null,
      location: getLocationTextFromUser(item.user),
      triggerReason: getLabelForClaimType(item.claimType),
      disruptionType: item.claimType,
      payoutAmount: Number(item.payoutAmount || item.approvedAmount || item.payout?.netAmount || 0),
      status: item.status,
      riskScore: Number(item.riskScore || 0),
      fraudScore: Number(item.fraudScore || 0),
      fraudFlags: item.fraudFlags || [],
      suspicious,
      duplicateCount,
      abnormalActivity: Number(item?.fraudLayerEvidence?.behavior?.score || 0) > 50 || Number(item?.triggerEvidence?.motionData?.motionConsistencyScore || 1) < 0.35,
      payoutMethod: item.payoutMethod || item.payout?.method || 'BANK_TRANSFER',
      payoutReferenceId: item.payout?.referenceId || null,
      payoutTransactionId: item.payout?.payoutId || null,
      createdAt: item.createdAt,
      reviewedAt: item.reviewedAt || null,
      policyPlan: item.policy?.plan || null,
    };
  });

  const countsByStatus = items.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});

  return {
    items,
    pagination: {
      total: totalResult[0]?.total || 0,
      page,
      limit,
      hasMore: (totalResult[0]?.total || 0) > page * limit,
    },
    countsByStatus,
  };
}

async function buildPayoutList(query = {}) {
  const dateRange = buildDateRange(query, 30);
  const { limit, page, skip } = parsePagination(query, 15);
  const baseMatch = buildPayoutMatch(query, dateRange);

  const pipeline = [
    { $match: baseMatch },
    { $sort: { createdAt: -1 } },
    {
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: '_id',
        as: 'user'
      }
    },
    {
      $lookup: {
        from: 'claims',
        localField: 'claimId',
        foreignField: '_id',
        as: 'claim'
      }
    },
    {
      $addFields: {
        user: { $first: '$user' },
        claim: { $first: '$claim' },
      }
    },
  ];

  const [totalResult, payouts] = await Promise.all([
    Payout.aggregate([...pipeline, { $count: 'total' }]),
    Payout.aggregate([
      ...pipeline,
      { $skip: skip },
      { $limit: limit },
      {
        $project: {
          payoutId: 1,
          referenceId: 1,
          status: 1,
          method: 1,
          grossAmount: 1,
          netAmount: 1,
          fee: 1,
          retryCount: 1,
          lastFailureReason: 1,
          createdAt: 1,
          completedAt: 1,
          failedAt: 1,
          user: {
            _id: '$user._id',
            name: '$user.name',
            email: '$user.email',
            city: '$user.city',
            deliveryZone: '$user.deliveryZone',
            location: '$user.location'
          },
          claim: {
            _id: '$claim._id',
            claimType: '$claim.claimType',
            status: '$claim.status',
            approvedAmount: '$claim.approvedAmount',
            payoutAmount: '$claim.payoutAmount'
          }
        }
      }
    ])
  ]);

  const items = payouts.map((item) => ({
    id: item.payoutId,
    transactionId: item.payoutId,
    referenceId: item.referenceId,
    status: item.status,
    paymentStatus: item.status,
    method: item.method,
    paymentMethod: item.method === 'BANK_TRANSFER' ? 'Bank' : item.method,
    amount: Number(item.netAmount || 0),
    grossAmount: Number(item.grossAmount || 0),
    fee: Number(item.fee || 0),
    retryCount: Number(item.retryCount || 0),
    lastFailureReason: item.lastFailureReason || null,
    createdAt: item.createdAt,
    completedAt: item.completedAt || null,
    failedAt: item.failedAt || null,
    userName: item.user?.name || 'Unknown user',
    userEmail: item.user?.email || null,
    location: getLocationTextFromUser(item.user),
    claimType: item.claim?.claimType || null,
    claimId: item.claim?._id ? String(item.claim._id) : null,
  }));

  return {
    items,
    pagination: {
      total: totalResult[0]?.total || 0,
      page,
      limit,
      hasMore: (totalResult[0]?.total || 0) > page * limit,
    },
    countsByStatus: items.reduce((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {}),
  };
}

async function buildFraudList(query = {}) {
  const dateRange = buildDateRange(query, 60);
  const { limit, page, skip } = parsePagination(query, 15);
  const baseMatch = buildFraudMatch(query, dateRange);

  const pipeline = [
    { $match: baseMatch },
    { $sort: { createdAt: -1 } },
    {
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: '_id',
        as: 'user'
      }
    },
    {
      $lookup: {
        from: 'claims',
        localField: 'claimId',
        foreignField: '_id',
        as: 'claim'
      }
    },
    {
      $addFields: {
        user: { $first: '$user' },
        claim: { $first: '$claim' }
      }
    }
  ];

  const [totalResult, fraudLogs] = await Promise.all([
    FraudLog.aggregate([...pipeline, { $count: 'total' }]),
    FraudLog.aggregate([
      ...pipeline,
      { $skip: skip },
      { $limit: limit },
      {
        $project: {
          fraudType: 1,
          fraudScore: 1,
          severity: 1,
          decision: 1,
          actionTaken: 1,
          evidence: 1,
          createdAt: 1,
          user: {
            _id: '$user._id',
            name: '$user.name',
            email: '$user.email',
            location: '$user.location',
            accountStatus: '$user.accountStatus'
          },
          claim: {
            _id: '$claim._id',
            claimType: '$claim.claimType',
            status: '$claim.status',
            payoutAmount: '$claim.payoutAmount'
          }
        }
      }
    ])
  ]);

  const items = fraudLogs.map((item) => ({
    id: String(item._id),
    userId: item.user?._id ? String(item.user._id) : null,
    userName: item.user?.name || 'Unknown user',
    userEmail: item.user?.email || null,
    location: getLocationTextFromUser(item.user),
    fraudType: item.fraudType,
    fraudScore: Number(item.fraudScore || 0),
    severity: item.severity,
    decision: item.decision,
    actionTaken: item.actionTaken,
    reason: item.evidence?.details?.reason || item.evidence?.details?.message || item.fraudType,
    claimId: item.claim?._id ? String(item.claim._id) : null,
    claimType: item.claim?.claimType || null,
    createdAt: item.createdAt,
  }));

  return {
    items,
    pagination: {
      total: totalResult[0]?.total || 0,
      page,
      limit,
      hasMore: (totalResult[0]?.total || 0) > page * limit,
    },
    flaggedUsers: items.reduce((acc, item) => {
      if (item.fraudScore >= 60 || item.decision === 'FLAGGED_FOR_REVIEW') {
        acc.push(item);
      }
      return acc;
    }, []),
    reasons: items.reduce((acc, item) => {
      acc[item.fraudType] = (acc[item.fraudType] || 0) + 1;
      return acc;
    }, {}),
  };
}

async function buildPolicyInsights(query = {}) {
  const baseMatch = buildPolicyMatch(query);
  const [activePoliciesByPlan, premiumTrendAgg, payoutTrendAgg, policiesAgg] = await Promise.all([
    Policy.aggregate([
      { $match: { ...baseMatch, status: 'ACTIVE' } },
      { $group: { _id: '$plan', count: { $sum: 1 }, premiumCollected: { $sum: { $ifNull: ['$amountPaid', '$weeklyPremium'] } } } },
      { $sort: { count: -1 } }
    ]),
    Policy.aggregate([
      {
        $group: {
          _id: {
            week: { $dateToString: { format: '%G-W%V', date: { $ifNull: ['$lastPaymentAt', '$createdAt'] }, timezone: 'UTC' } }
          },
          revenue: { $sum: { $ifNull: ['$amountPaid', 0] } }
        }
      },
      { $sort: { '_id.week': 1 } },
      { $limit: 12 }
    ]),
    Payout.aggregate([
      {
        $group: {
          _id: {
            week: { $dateToString: { format: '%G-W%V', date: '$createdAt', timezone: 'UTC' } }
          },
          payout: { $sum: { $cond: [{ $eq: ['$status', 'SUCCESS'] }, '$netAmount', 0] } }
        }
      },
      { $sort: { '_id.week': 1 } },
      { $limit: 12 }
    ]),
    Policy.aggregate([
      { $match: baseMatch },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ])
  ]);

  const revenueTrendMap = new Map(premiumTrendAgg.map((item) => [item._id.week, Number(item.revenue || 0)]));
  const payoutTrendMap = new Map(payoutTrendAgg.map((item) => [item._id.week, Number(item.payout || 0)]));
  const allWeeks = Array.from(new Set([...revenueTrendMap.keys(), ...payoutTrendMap.keys()])).sort();

  const revenueVsPayoutTrend = allWeeks.map((week) => {
    const revenue = Number(revenueTrendMap.get(week) || 0);
    const payout = Number(payoutTrendMap.get(week) || 0);
    return {
      week,
      revenue: Number(revenue.toFixed(2)),
      payout: Number(payout.toFixed(2)),
      lossRatio: revenue > 0 ? Number((payout / revenue).toFixed(3)) : 0,
    };
  });

  return {
    weeklyPremiumCollected: Number((activePoliciesByPlan.reduce((sum, item) => sum + Number(item.premiumCollected || 0), 0)).toFixed(2)),
    activePoliciesByPlan: activePoliciesByPlan.map((item) => ({
      plan: item._id,
      count: item.count,
      premiumCollected: Number(item.premiumCollected || 0),
    })),
    revenueVsPayoutTrend,
    lossRatioTrend: revenueVsPayoutTrend.map((item) => ({ week: item.week, lossRatio: item.lossRatio })),
    activePoliciesByStatus: policiesAgg.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {}),
  };
}

exports.getAdminDashboard = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const adminUser = await ensureInsurerAdmin(userId);
  const claimRange = buildDateRange(req.query, 30);
  const claimFilters = buildClaimMatch(req.query, claimRange);
  const payoutFilters = buildPayoutMatch(req.query, claimRange);
  const fraudFilters = buildFraudMatch(req.query, buildDateRange(req.query, 60));
  const pageSize = clamp(Number.parseInt(req.query.limit, 10) || DASHBOARD_DEFAULT_LIMIT, 1, MAX_LIMIT);

  const [summary, claims, payouts, fraud, policyInsights] = await Promise.all([
    buildDashboardSummary(),
    buildClaimList({ ...req.query, limit: pageSize }),
    buildPayoutList({ ...req.query, limit: pageSize }),
    buildFraudList({ ...req.query, limit: pageSize }),
    buildPolicyInsights(req.query),
  ]);

  res.status(RESPONSE_CODES.SUCCESS).json({
    success: true,
    data: {
      ...summary,
      claims,
      payouts,
      fraud,
      policyInsights,
      admin: {
        userId: adminUser._id,
        name: adminUser.name,
        email: adminUser.email,
        lastUpdated: new Date().toISOString(),
      },
    }
  });
});

exports.getAdminClaims = asyncHandler(async (req, res) => {
  await ensureInsurerAdmin(req.params.userId);
  const claims = await buildClaimList(req.query);
  res.status(RESPONSE_CODES.SUCCESS).json({ success: true, data: claims });
});

exports.getAdminPayouts = asyncHandler(async (req, res) => {
  await ensureInsurerAdmin(req.params.userId);
  const payouts = await buildPayoutList(req.query);
  res.status(RESPONSE_CODES.SUCCESS).json({ success: true, data: payouts });
});

exports.getAdminFraud = asyncHandler(async (req, res) => {
  await ensureInsurerAdmin(req.params.userId);
  const fraud = await buildFraudList(req.query);
  res.status(RESPONSE_CODES.SUCCESS).json({ success: true, data: fraud });
});

exports.getAdminPolicyInsights = asyncHandler(async (req, res) => {
  await ensureInsurerAdmin(req.params.userId);
  const policyInsights = await buildPolicyInsights(req.query);
  res.status(RESPONSE_CODES.SUCCESS).json({ success: true, data: policyInsights });
});

exports.markClaimSuspicious = asyncHandler(async (req, res) => {
  await ensureInsurerAdmin(req.params.userId);
  const { claimId } = req.params;
  const { reason } = req.body || {};

  const claim = await Claim.findById(claimId);
  if (!claim) {
    throw new APIError(ERRORS.CLAIM_NOT_FOUND, RESPONSE_CODES.NOT_FOUND);
  }

  claim.fraudFlags = Array.from(new Set([...(claim.fraudFlags || []), 'DUPLICATE_CLAIM']));
  claim.fraudScore = clamp(Number(claim.fraudScore || 0) + 15, 0, 100);
  claim.fraudReviewTier = 'RED';
  claim.fraudNextAction = 'MANUAL_REVIEW';
  claim.status = 'UNDER_REVIEW';
  claim.fraudFlagDescription = reason ? String(reason).trim() : 'Marked suspicious by insurer admin';
  claim.updatedAt = new Date();
  await claim.save();

  await FraudLog.create({
    userId: claim.userId,
    policyId: claim.policyId,
    claimId: claim._id,
    fraudType: 'DUPLICATE_CLAIM',
    fraudScore: claim.fraudScore,
    severity: claim.fraudScore >= 90 ? 'CRITICAL' : 'HIGH',
    evidence: {
      details: {
        reason: claim.fraudFlagDescription
      }
    },
    decision: 'FLAGGED_FOR_REVIEW',
    actionTaken: 'MANUAL_REVIEW_REQUIRED',
    reviewNotes: claim.fraudFlagDescription,
    reviewedAt: new Date()
  });

  res.status(RESPONSE_CODES.SUCCESS).json({
    success: true,
    message: 'Claim marked suspicious successfully',
    data: {
      claimId: claim._id,
      status: claim.status,
      fraudScore: claim.fraudScore,
      fraudFlags: claim.fraudFlags,
    }
  });
});

exports.suspendUser = asyncHandler(async (req, res) => {
  await ensureInsurerAdmin(req.params.userId);
  const { targetUserId } = req.params;
  const { reason } = req.body || {};

  const user = await User.findById(targetUserId);
  if (!user) {
    throw new APIError(ERRORS.USER_NOT_FOUND, RESPONSE_CODES.NOT_FOUND);
  }

  user.accountStatus = 'SUSPENDED';
  user.updatedAt = new Date();
  await user.save();

  await Policy.updateMany(
    { userId: targetUserId, status: POLICY_STATUS.ACTIVE },
    { $set: { status: POLICY_STATUS.SUSPENDED, updatedAt: new Date() } }
  );

  await FraudLog.create({
    userId: user._id,
    fraudType: 'BEHAVIORAL_ANOMALY',
    fraudScore: 85,
    severity: 'HIGH',
    evidence: { details: { reason: reason || 'Suspended by insurer admin' } },
    decision: 'REJECTED',
    actionTaken: 'ACCOUNT_SUSPENDED',
    reviewNotes: reason || 'Suspended by insurer admin',
    reviewedAt: new Date()
  });

  res.status(RESPONSE_CODES.SUCCESS).json({
    success: true,
    message: 'User suspended successfully',
    data: {
      userId: user._id,
      accountStatus: user.accountStatus,
    }
  });
});

exports.retryPayout = asyncHandler(async (req, res) => {
  await ensureInsurerAdmin(req.params.userId);
  const { transactionId } = req.params;
  const result = await payoutService.retryPayout(transactionId);

  if (!result.success) {
    throw new APIError(result.error || 'Unable to retry payout', RESPONSE_CODES.NOT_FOUND);
  }

  res.status(RESPONSE_CODES.SUCCESS).json({
    success: true,
    message: 'Payout retry initiated successfully',
    data: result
  });
});
