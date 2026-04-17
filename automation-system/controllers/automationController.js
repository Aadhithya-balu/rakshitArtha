const User = require('../models/User');
const Claim = require('../models/Claim');
const axios = require('axios');
const { getWeatherData } = require('../services/weatherService');
const { calculateLoss } = require('../services/lossCalculator');
const { runFraudCheck } = require('../services/fraudService');
const { processPayout } = require('../services/payoutService');
const logger = require('../utils/logger');

const BACKEND_BASE_URL = String(process.env.BACKEND_API_URL || 'http://127.0.0.1:5000').replace(/\/$/, '');

// Import all trigger services
const pollutionTrigger = require('../../Backend/insurance-module/services/pollutionTrigger');
const trafficTrigger = require('../../Backend/insurance-module/services/trafficTrigger');
const appDowntimeTrigger = require('../../Backend/insurance-module/services/appDowntimeTrigger');
const marketClosureTrigger = require('../../Backend/insurance-module/services/marketClosureTrigger');

const hasOverlappingClaim = async (userId, disruptionType, durationHours) => {
  const safeDurationHours = Math.max(Number(durationHours || 0), 0);
  if (safeDurationHours === 0) return false;

  const windowStart = new Date(Date.now() - safeDurationHours * 60 * 60 * 1000);
  const existing = await Claim.findOne({
    userId,
    disruptionType,
    timestamp: { $gte: windowStart },
    status: { $in: ['APPROVED', 'PAID'] }
  }).lean();

  return Boolean(existing);
};

async function triggerBackendAutoClaim(user, disruption, lossAmount) {
  const sourceUserId = String(user?.sourceUserId || '').trim();
  if (!sourceUserId) {
    return { triggered: false, reason: 'missing_source_user_id' };
  }

  try {
    const response = await axios.post(
      `${BACKEND_BASE_URL}/claim/demo/simulate`,
      {
        userId: sourceUserId,
        disruptionType: disruption?.disruptionType || 'UNEXPECTED_EVENT',
        rainfall: Number(disruption?.rainfall ?? 0),
        aqi: Number(disruption?.aqi ?? 0),
        traffic: Number(disruption?.traffic ?? 0),
        lostIncome: Math.max(0, Number(lossAmount || 0)),
        inputMode: 'live',
      },
      { timeout: 8000 }
    );

    const payload = response?.data?.data || {};
    return {
      triggered: true,
      approved: Boolean(payload.approved),
      claimCreated: Boolean(payload?.automation?.claimCreated),
      payoutStatus: payload?.automation?.payoutStatus || null,
      claimId: payload?.automation?.claimId || null,
      rejectionReason: payload?.rejectionReason || null,
    };
  } catch (error) {
    logger.warn('Backend auto-claim trigger failed', {
      sourceUserId,
      error: error?.message || 'unknown_error',
    });
    return { triggered: false, reason: error?.message || 'backend_call_failed' };
  }
}

const runMainAutomation = async () => {
  logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.log('🚀 Starting Main Automation Function');
  logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  try {
    // ====== TRIGGER 1: WEATHER DISRUPTION ======
    logger.log('\n🌦️  TRIGGER 1: Checking Weather Disruptions...');
    await runWeatherTrigger();

    // ====== TRIGGER 2: POLLUTION ======
    logger.log('\n🌫️  TRIGGER 2: Checking Pollution Levels...');
    await pollutionTrigger.checkAndTrigger();

    // ====== TRIGGER 3: TRAFFIC ======
    logger.log('\n🚗 TRIGGER 3: Checking Traffic Congestion...');
    await trafficTrigger.checkAndTrigger();

    // ====== TRIGGER 4: APP DOWNTIME ======
    logger.log('\n📱 TRIGGER 4: Checking Platform Downtime...');
    await appDowntimeTrigger.checkAndTrigger();

    // ====== TRIGGER 5: MARKET CLOSURE ======
    logger.log('\n🏪 TRIGGER 5: Checking Market Closures & Curfews...');
    await marketClosureTrigger.checkAndTrigger();

    logger.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.log('✅ All Triggers Completed Successfully');
    logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  } catch (error) {
    logger.log(`❌ Critical error in automation flow: ${error.message}`);
  }
};

/**
 * Weather Trigger (Original, now enhanced)
 */
const runWeatherTrigger = async () => {
  try {
    const activeUsers = await User.find({
      isActive: true,
      weeklyIncome: { $gt: 0 },
      weeklyHours: { $gt: 0 }
    });
    logger.log(`📋 Loaded ${activeUsers.length} eligible synced users for weather disruptions...`);

    for (const user of activeUsers) {
      if (typeof user?.location?.lat !== 'number' || typeof user?.location?.lng !== 'number') {
        logger.log(`⏭️  Skipping user ${user.name} (${user.sourceUserId || user._id}) due to missing location coordinates`);
        continue;
      }

      // 1. Get weather data and detect disruption
      const disruption = await getWeatherData(user.location.lat, user.location.lng, { mode: 'live-automation' });
      const durationHours = Math.max(Number(disruption.durationHours ?? disruption.duration ?? 0), 0);
      
      if (disruption.disruptionType !== 'NONE') {
        logger.log(`⚠️  Disruption for ${user.name} [sourceUserId=${user.sourceUserId || 'n/a'}]: ${disruption.disruptionType} (${durationHours}h)`);

        const overlapExists = await hasOverlappingClaim(user._id, disruption.disruptionType, durationHours);
        if (overlapExists) {
          logger.log(`↩️  Skipping duplicate overlapping claim for ${user.name} (${disruption.disruptionType}, ${durationHours}h)`);
          continue;
        }
        
        // 2. Calculate Loss
        const lossResult = calculateLoss(user.weeklyIncome, user.weeklyHours, durationHours, {
          workingHours: user.workingHours,
          disruptionStartHour: disruption?.startHour,
          disruptionEndHour: disruption?.endHour,
        });
        const lossAmount = Number(lossResult?.loss || 0);

        if (lossResult?.overlapHours === 0) {
          logger.log(`🕒 No overlap between disruption and working hours for ${user.name}; payout skipped.`);
          continue;
        }

        logger.log(
          `💰 Income loss calculated: ₹${lossAmount} ` +
          `(overlap=${lossResult?.overlapHours || 0}h / disruption=${lossResult?.disruptionHours || durationHours}h)`
        );
        
        // 3. Fraud Check
        const isLegit = runFraudCheck(user, disruption);
        
        if (isLegit) {
          // 4. Primary path: create claim + payout in main backend (visible in app).
          const backendResult = await triggerBackendAutoClaim(user, disruption, lossAmount);
          if (backendResult.triggered) {
            logger.log(
              `✅ Backend claim workflow triggered for sourceUserId=${user.sourceUserId || 'n/a'} ` +
              `(approved=${backendResult.approved}, claimCreated=${backendResult.claimCreated}, payout=${backendResult.payoutStatus || 'n/a'})`
            );

            // If backend created/processed, skip local-only duplicate records.
            if (backendResult.claimCreated || backendResult.approved) {
              continue;
            }
          }

          // 5. Fallback path (local automation DB) if backend call failed.
          const claim = new Claim({
            userId: user._id,
            disruptionType: disruption.disruptionType,
            durationHours,
            lossAmount,
            calculationMessage: `${disruption.disruptionType.replace(/_/g, ' ')} detected for ${durationHours} hours. Your payout has been calculated considering disruption duration and system validations.`,
            status: 'APPROVED',
            autoTriggered: true,
            triggerSource: 'WEATHER'
          });

          await claim.save();
          logger.log(`✅ Fallback local claim auto-filed: ${claim._id}`);

          await processPayout(user._id, claim._id, lossAmount);
          logger.log(`💳 Fallback local payout processed: ₹${lossAmount} to ${user.name} [sourceUserId=${user.sourceUserId || 'n/a'}]`);
        } else {
          logger.log(`🚫 Claim rejected - Fraud detected for sourceUserId=${user.sourceUserId || 'n/a'}`);
        }
      } else {
        logger.log(`✓ No weather disruption for ${user.name} [sourceUserId=${user.sourceUserId || 'n/a'}]`);
      }
    }
  } catch (error) {
    logger.error('Weather Trigger Error:', error.message);
  }
};

module.exports = { runMainAutomation, runWeatherTrigger };
