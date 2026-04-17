const axios = require('axios');
const logger = require('../utils/logger');

/**
 * Workflow Logging Service
 * Responsible for logging each step of claim processing workflow
 * Communicates with backend workflow APIs
 */
class WorkflowLoggingService {
    constructor(apiBaseUrl = process.env.BACKEND_API_URL || 'http://localhost:5000') {
        this.apiBaseUrl = apiBaseUrl;
    }

    /**
     * Initialize workflow for a claim
     */
    async initializeWorkflow(claimId, claimData) {
        try {
            const response = await axios.post(
                `${this.apiBaseUrl}/api/internal/claim/${claimId}/workflow/init`,
                {
                    claimType: claimData.claimType,
                    userId: claimData.userId,
                    policyId: claimData.policyId,
                    triggerEvidence: claimData.triggerEvidence
                }
            );
            logger.debug('Workflow initialized', { claimId });
            return response.data;
        } catch (error) {
            logger.error('Failed to initialize workflow', {
                claimId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Log a workflow step with status
     */
    async logStep(claimId, stepData) {
        try {
            const {
                stepName,
                status,
                message,
                reason = null,
                data = null,
                nextStep = null,
                duration = 0
            } = stepData;

            const response = await axios.post(
                `${this.apiBaseUrl}/api/internal/claim/${claimId}/workflow/step`,
                {
                    stepName,
                    status,
                    message,
                    reason,
                    data,
                    nextStep,
                    duration
                }
            );

            logger.info(`[WORKFLOW] Step logged: ${stepName} - ${status}`, {
                claimId,
                message
            });

            return response.data;
        } catch (error) {
            logger.error('Failed to log workflow step', {
                claimId,
                stepName: stepData.stepName,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Log Policy Validation step
     */
    async logPolicyValidation(claimId, policyData, isValid) {
        const status = isValid ? 'SUCCESS' : 'FAILED';
        const message = isValid
            ? `Policy validated successfully. Status: ${policyData.status}`
            : `Policy validation failed. Status: ${policyData.status}`;

        return this.logStep(claimId, {
            stepName: 'POLICY_VALIDATION',
            status,
            message,
            reason: !isValid ? `Policy is ${policyData.status}` : null,
            data: {
                policyStatus: policyData.status,
                isActive: policyData.isActive,
                paymentStatus: policyData.paymentStatus,
                expiryDate: policyData.expiryDate
            },
            nextStep: isValid ? 'DISRUPTION_DETECTION' : null
        });
    }

    /**
     * Log Disruption Detection step
     */
    async logDisruptionDetection(claimId, disruptionData, disruptionFound) {
        const status = disruptionFound ? 'SUCCESS' : 'FAILED';
        const message = disruptionFound
            ? `${disruptionData.type} detected. Duration: ${disruptionData.durationHours}h`
            : 'No disruption detected in the area';

        return this.logStep(claimId, {
            stepName: 'DISRUPTION_DETECTION',
            status,
            message,
            reason: !disruptionFound ? 'No triggering disruption detected' : null,
            data: {
                disruptionType: disruptionData.type,
                durationHours: disruptionData.durationHours,
                severity: disruptionData.severity,
                location: disruptionData.location
            },
            nextStep: disruptionFound ? 'DURATION_CALCULATION' : null
        });
    }

    /**
     * Log Duration Calculation step
     */
    async logDurationCalculation(claimId, durationData) {
        const status = 'SUCCESS';
        const message = `Duration calculated: ${durationData.hours} hours`;

        return this.logStep(claimId, {
            stepName: 'DURATION_CALCULATION',
            status,
            message,
            data: {
                durationHours: durationData.hours,
                startTime: durationData.startTime,
                endTime: durationData.endTime,
                basis: durationData.basis
            },
            nextStep: 'LOSS_CALCULATION'
        });
    }

    /**
     * Log Loss Calculation step
     */
    async logLossCalculation(claimId, lossData) {
        const status = 'SUCCESS';
        const message = `Loss calculated: ₹${lossData.amount.toFixed(2)}`;

        return this.logStep(claimId, {
            stepName: 'LOSS_CALCULATION',
            status,
            message,
            data: {
                calculatedLoss: lossData.amount,
                weeklyIncome: lossData.weeklyIncome,
                durationHours: lossData.durationHours,
                hourlyRate: lossData.hourlyRate,
                multiplier: lossData.multiplier || 1
            },
            nextStep: 'FRAUD_DETECTION'
        });
    }

    /**
     * Log Fraud Detection step with all layer results
     */
    async logFraudDetection(claimId, fraudData) {
        const status = fraudData.overallScore >= 60 ? 'FAILED' : 'SUCCESS';
        const message = `Fraud detection completed. Overall score: ${fraudData.overallScore}/100`;

        // Also log fraud checks separately with detailed layer info
        try {
            await axios.post(
                `${this.apiBaseUrl}/api/internal/claim/${claimId}/fraud-checks/log`,
                {
                    userId: fraudData.userId,
                    policyId: fraudData.policyId,
                    layers: fraudData.layers,
                    overallScore: fraudData.overallScore,
                    riskTier: fraudData.riskTier
                }
            );
            logger.debug('Fraud checks detailed layers logged', { claimId });
        } catch (error) {
            logger.error('Failed to log detailed fraud checks', { claimId, error: error.message });
        }

        return this.logStep(claimId, {
            stepName: 'FRAUD_DETECTION',
            status,
            message,
            reason: status === 'FAILED' ? `High fraud risk detected. Score: ${fraudData.overallScore}` : null,
            data: {
                overallScore: fraudData.overallScore,
                riskTier: fraudData.riskTier,
                fraudFlags: fraudData.fraudFlags,
                layerCount: fraudData.layerCount,
                passedLayers: fraudData.passedLayers,
                failedLayers: fraudData.failedLayers
            },
            nextStep: status === 'SUCCESS' ? 'CLAIM_CREATION' : null
        });
    }

    /**
     * Log Claim Creation step
     */
    async logClaimCreation(claimId, claimData) {
        const status = 'SUCCESS';
        const message = `Claim created successfully. Type: ${claimData.type}`;

        return this.logStep(claimId, {
            stepName: 'CLAIM_CREATION',
            status,
            message,
            data: {
                claimType: claimData.type,
                claimStatus: claimData.status,
                approvedAmount: claimData.approvedAmount
            },
            nextStep: 'PAYOUT_PROCESSING'
        });
    }

    /**
     * Log Payout Processing step
     */
    async logPayoutProcessing(claimId, payoutData, success = true) {
        const status = success ? 'SUCCESS' : 'FAILED';
        const message = success
            ? `Payout processed successfully. Amount: ₹${payoutData.amount}`
            : `Payout processing failed: ${payoutData.reason}`;

        return this.logStep(claimId, {
            stepName: 'PAYOUT_PROCESSING',
            status,
            message,
            reason: !success ? payoutData.reason : null,
            data: {
                payoutAmount: payoutData.amount,
                payoutMethod: payoutData.method,
                payoutStatus: payoutData.status,
                transactionId: payoutData.transactionId || null
            }
        });
    }

    /**
     * Mark workflow as completed
     */
    async completeWorkflow(claimId) {
        try {
            const response = await axios.put(
                `${this.apiBaseUrl}/api/internal/claim/${claimId}/workflow/complete`
            );
            logger.info('Workflow marked as completed', { claimId });
            return response.data;
        } catch (error) {
            logger.error('Failed to complete workflow', {
                claimId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Mark workflow as rejected with reason
     */
    async rejectWorkflow(claimId, failedAtStep, reason, evidence = null) {
        try {
            const response = await axios.put(
                `${this.apiBaseUrl}/api/internal/claim/${claimId}/workflow/reject`,
                {
                    failedAtStep,
                    reason,
                    evidence
                }
            );
            logger.warn('Workflow marked as rejected', { claimId, failedAtStep, reason });
            return response.data;
        } catch (error) {
            logger.error('Failed to reject workflow', {
                claimId,
                failedAtStep,
                error: error.message
            });
            throw error;
        }
    }
}

module.exports = {
    WorkflowLoggingService,
    workflowLogger: new WorkflowLoggingService()
};
