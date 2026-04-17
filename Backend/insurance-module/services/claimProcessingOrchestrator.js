const { workflowLogger } = require('./workflowLoggingService');
const Claim = require('../models/Claim');
const Policy = require('../models/Policy');
const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * Example: Complete Workflow Processing with Logging
 * This demonstrates how to integrate the workflow logger into the claim processing pipeline
 */

class ClaimProcessingOrchestrator {
    /**
     * Process a claim with complete workflow logging
     * This is called when a claim is submitted and needs to go through the entire processing pipeline
     */
    static async processClaimWithLogging(claimData) {
        const { claimId, userId, policyId, claimType, triggerEvidence } = claimData;
        const startTime = Date.now();

        try {
            // Initialize workflow
            await workflowLogger.initializeWorkflow(claimId, {
                claimType,
                userId,
                policyId,
                triggerEvidence
            });

            // ====== STEP 1: POLICY VALIDATION ======
            logger.log('\n📋 STEP 1: Policy Validation');
            const policyValidationStartTime = Date.now();

            const policy = await Policy.findById(policyId);
            const policyValid = this._isPolicyValid(policy);

            const policyValidationDuration = Date.now() - policyValidationStartTime;

            if (policyValid) {
                await workflowLogger.logPolicyValidation(claimId, {
                    status: policy.status,
                    isActive: policy.status === 'ACTIVE',
                    paymentStatus: policy.paymentStatus,
                    expiryDate: policy.expiryDate
                }, true);
                logger.log('✅ Policy is valid');
            } else {
                await workflowLogger.logPolicyValidation(claimId, {
                    status: policy.status,
                    isActive: false,
                    paymentStatus: policy.paymentStatus,
                    expiryDate: policy.expiryDate
                }, false);

                await workflowLogger.rejectWorkflow(
                    claimId,
                    'POLICY_VALIDATION',
                    `Policy is ${policy.status}. Claims require an active policy.`,
                    { policyStatus: policy.status }
                );

                return {
                    success: false,
                    reason: 'Policy validation failed',
                    failedAt: 'POLICY_VALIDATION'
                };
            }

            // ====== STEP 2: DISRUPTION DETECTION ======
            logger.log('\n🌦️  STEP 2: Disruption Detection');
            const disruptionStartTime = Date.now();

            const disruptionData = triggerEvidence;
            const disruptionFound = disruptionData && disruptionData.disruptionType !== 'NONE';

            const disruptionDuration = Date.now() - disruptionStartTime;

            if (disruptionFound) {
                await workflowLogger.logDisruptionDetection(claimId, {
                    type: disruptionData.disruptionType,
                    durationHours: disruptionData.durationHours || 0,
                    severity: disruptionData.severity || 'MEDIUM',
                    location: disruptionData.locationData
                }, true);
                logger.log(`✅ Disruption detected: ${disruptionData.disruptionType}`);
            } else {
                await workflowLogger.logDisruptionDetection(claimId, {
                    type: 'NONE',
                    durationHours: 0
                }, false);

                await workflowLogger.rejectWorkflow(
                    claimId,
                    'DISRUPTION_DETECTION',
                    'No triggering disruption detected in the area.',
                    disruptionData
                );

                return {
                    success: false,
                    reason: 'No disruption detected',
                    failedAt: 'DISRUPTION_DETECTION'
                };
            }

            // ====== STEP 3: DURATION CALCULATION ======
            logger.log('\n⏱️  STEP 3: Duration Calculation');
            const durationStartTime = Date.now();

            const durationHours = disruptionData.durationHours || 0;

            const durationDuration = Date.now() - durationStartTime;

            await workflowLogger.logDurationCalculation(claimId, {
                hours: durationHours,
                startTime: new Date(),
                endTime: new Date(Date.now() + durationHours * 60 * 60 * 1000),
                basis: 'Disruption evidence'
            });
            logger.log(`✅ Duration calculated: ${durationHours} hours`);

            // ====== STEP 4: LOSS CALCULATION ======
            logger.log('\n💰 STEP 4: Loss Calculation');
            const lossStartTime = Date.now();

            const user = await User.findById(userId);
            const weeklyIncome = user?.weeklyIncome || 0;
            const weeklyHours = user?.weeklyHours || 40;
            const hourlyRate = weeklyIncome / weeklyHours;
            const calculatedLoss = hourlyRate * durationHours;

            const lossDuration = Date.now() - lossStartTime;

            await workflowLogger.logLossCalculation(claimId, {
                amount: calculatedLoss,
                weeklyIncome: weeklyIncome,
                durationHours: durationHours,
                hourlyRate: hourlyRate,
                multiplier: 1
            });
            logger.log(`✅ Loss calculated: ₹${calculatedLoss.toFixed(2)}`);

            // ====== STEP 5: FRAUD DETECTION ======
            logger.log('\n🛡️  STEP 5: Fraud Detection');
            const fraudStartTime = Date.now();

            // Simulate fraud detection (would call fraudDetectionService normally)
            const fraudResult = {
                overallScore: 25, // Low fraud risk
                riskTier: 'GREEN',
                fraudFlags: [],
                layers: {
                    policyActiveCheck: { status: 'PASS', score: 0 },
                    locationValidation: { status: 'PASS', score: 5 },
                    duplicateClaimCheck: { status: 'PASS', score: 0 },
                    activityValidation: { status: 'PASS', score: 10 },
                    timeWindowValidation: { status: 'PASS', score: 5 },
                    anomalyDetection: { status: 'PASS', score: 5 }
                },
                layerCount: 6,
                passedLayers: 6,
                failedLayers: 0
            };

            const fraudDuration = Date.now() - fraudStartTime;

            if (fraudResult.overallScore < 60) {
                await workflowLogger.logFraudDetection(claimId, {
                    userId,
                    policyId,
                    overallScore: fraudResult.overallScore,
                    riskTier: fraudResult.riskTier,
                    fraudFlags: fraudResult.fraudFlags,
                    layers: fraudResult.layers,
                    layerCount: fraudResult.layerCount,
                    passedLayers: fraudResult.passedLayers,
                    failedLayers: fraudResult.failedLayers
                });
                logger.log(`✅ Fraud detection passed. Score: ${fraudResult.overallScore}/100`);
            } else {
                await workflowLogger.logFraudDetection(claimId, {
                    userId,
                    policyId,
                    overallScore: fraudResult.overallScore,
                    riskTier: fraudResult.riskTier,
                    fraudFlags: fraudResult.fraudFlags,
                    layers: fraudResult.layers,
                    layerCount: fraudResult.layerCount,
                    passedLayers: fraudResult.passedLayers,
                    failedLayers: fraudResult.failedLayers
                });

                await workflowLogger.rejectWorkflow(
                    claimId,
                    'FRAUD_DETECTION',
                    `High fraud risk detected. Score: ${fraudResult.overallScore}/100`,
                    fraudResult
                );

                return {
                    success: false,
                    reason: 'Fraud detection failed',
                    failedAt: 'FRAUD_DETECTION'
                };
            }

            // ====== STEP 6: CLAIM CREATION ======
            logger.log('\n📄 STEP 6: Claim Creation');
            const claimCreationStartTime = Date.now();

            const claimRecord = await Claim.findById(claimId);
            const claimCreationDuration = Date.now() - claimCreationStartTime;

            await workflowLogger.logClaimCreation(claimId, {
                type: claimType,
                status: claimRecord.status,
                approvedAmount: calculatedLoss
            });
            logger.log(`✅ Claim created successfully`);

            // ====== STEP 7: PAYOUT PROCESSING ======
            logger.log('\n💳 STEP 7: Payout Processing');
            const payoutStartTime = Date.now();

            // Simulate payout processing
            const payoutSuccess = true; // Would integrate with payment gateway
            const payoutData = {
                amount: calculatedLoss,
                method: 'BANK_TRANSFER',
                status: 'INITIATED',
                transactionId: `TXN_${Date.now()}`
            };

            const payoutDuration = Date.now() - payoutStartTime;

            if (payoutSuccess) {
                await workflowLogger.logPayoutProcessing(claimId, payoutData, true);
                logger.log(`✅ Payout processed successfully`);
            } else {
                await workflowLogger.logPayoutProcessing(claimId, payoutData, false);
                logger.log(`❌ Payout processing failed`);
            }

            // ====== WORKFLOW COMPLETION ======
            const totalDuration = Date.now() - startTime;
            await workflowLogger.completeWorkflow(claimId);

            logger.log('\n✅ Workflow completed successfully');
            logger.log(`Total processing time: ${(totalDuration / 1000).toFixed(2)}s`);

            return {
                success: true,
                claimId,
                approvedAmount: calculatedLoss,
                payoutData,
                workflowDuration: totalDuration
            };

        } catch (error) {
            logger.error('Workflow processing error', {
                claimId,
                error: error.message
            });

            // Mark as failed
            try {
                await workflowLogger.rejectWorkflow(
                    claimId,
                    'UNKNOWN',
                    `Workflow processing error: ${error.message}`,
                    { errorDetails: error.toString() }
                );
            } catch (logError) {
                logger.error('Failed to log workflow rejection', { error: logError.message });
            }

            throw error;
        }
    }

    /**
     * Helper: Validate policy
     */
    static _isPolicyValid(policy) {
        if (!policy) return false;
        if (policy.status !== 'ACTIVE') return false;
        if (policy.paymentStatus !== 'PAID') return false;
        if (new Date() > policy.expiryDate) return false;
        return true;
    }
}

module.exports = ClaimProcessingOrchestrator;
