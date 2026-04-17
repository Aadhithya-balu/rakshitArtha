const logger = require('../utils/logger');
const Payout = require('../models/Payout');

const PAYOUT_METHODS = {
  BANK_TRANSFER: {
    processingTime: '24-48 hours',
    fee: 0,
    minAmount: 0,
    icon: 'BANK',
  },
  UPI: {
    processingTime: 'Instant (5-10 min)',
    fee: 0,
    minAmount: 0,
    icon: 'UPI',
  },
  WALLET: {
    processingTime: 'Instant',
    fee: 0,
    minAmount: 0,
    icon: 'WALLET',
  },
  CHEQUE: {
    processingTime: '5-7 business days',
    fee: 50,
    minAmount: 500,
    icon: 'CHEQUE',
  },
};

const payoutDatabase = new Map();
const transactionLog = [];

class PayoutService {
  constructor() {
    this.payouts = payoutDatabase;
    this.transactionLog = transactionLog;
  }

  async processPayout(payoutData) {
    const {
      userId,
      claimId,
      amount,
      method = 'UPI',
      sourceType = 'LIVE',
      workerUPI = null,
      beneficiaryBank = null,
      beneficiaryAccountLast4 = null,
    } = payoutData;

    if (!PAYOUT_METHODS[method]) {
      throw new Error(`Invalid payout method: ${method}`);
    }

    const methodConfig = PAYOUT_METHODS[method];
    if (amount < methodConfig.minAmount) {
      throw new Error(`Amount must be at least Rs.${methodConfig.minAmount} for ${method}`);
    }

    const transactionId = this.generateTransactionId();
    const netAmount = amount - methodConfig.fee;
    const payoutRecord = {
      payoutId: transactionId,
      referenceId: `TXN${Date.now()}`,
      userId: String(userId),
      claimId: String(claimId),
      sourceType,
      grossAmount: amount,
      fee: methodConfig.fee,
      netAmount,
      amount: netAmount,
      method,
      workerUPI,
      beneficiaryBank,
      beneficiaryAccountLast4,
      status: 'PENDING',
      createdAt: new Date(),
      statusHistory: [
        { status: 'PENDING', timestamp: new Date(), message: 'Payout initiated' },
      ],
    };

    await Payout.findOneAndUpdate(
      { payoutId: transactionId },
      {
        ...payoutRecord,
        status: 'PENDING',
        statusHistory: payoutRecord.statusHistory,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    this.payouts.set(transactionId, payoutRecord);
    logger.info('Payout initiated', { transactionId, claimId: String(claimId), method, amount: netAmount });

    setImmediate(() => {
      this.simulatePaymentProcessing(transactionId, method).catch((error) => {
        logger.error(`Payout simulation failed: ${error.message}`);
      });
    });

    const response = {
      success: true,
      transactionId,
      referenceId: payoutRecord.referenceId,
      status: 'PROCESSING',
      amount: netAmount,
      fee: methodConfig.fee,
      totalAmount: amount,
      method,
      processingTime: methodConfig.processingTime,
      message: `Payout of Rs.${netAmount.toLocaleString()} initiated via ${method}. ${methodConfig.processingTime}.`,
      timestamp: new Date(),
    };

    this.transactionLog.push(response);
    return response;
  }

  async simulatePaymentProcessing(transactionId, method) {
    const payout = this.payouts.get(transactionId);
    if (!payout) return;

    await this.delay(250);
    payout.status = 'PROCESSING';
    payout.statusHistory.push({
      status: 'PROCESSING',
      timestamp: new Date(),
      message: 'Payment being processed by gateway',
    });

    await this.delay(400);
    const isSuccessful = Math.random() > 0.05;

    if (isSuccessful) {
      payout.status = 'COMPLETED';
      payout.completedAt = new Date();
      payout.statusHistory.push({
        status: 'COMPLETED',
        timestamp: new Date(),
        message: `Successfully paid Rs.${payout.netAmount} via ${method}`,
      });
      await Payout.findOneAndUpdate(
        { payoutId: transactionId },
        {
          status: 'SUCCESS',
          completedAt: payout.completedAt,
          statusHistory: payout.statusHistory.map((entry) => ({
            ...entry,
            status: entry.status === 'COMPLETED' ? 'SUCCESS' : entry.status,
          })),
          updatedAt: new Date(),
        },
        { new: true }
      );
      logger.info('Payout completed', { transactionId, amount: payout.netAmount, method });
      return;
    }

    payout.status = 'FAILED';
    payout.statusHistory.push({
      status: 'FAILED',
      timestamp: new Date(),
      message: 'Payment gateway error - will retry',
    });
    payout.lastFailureReason = 'Payment gateway error - will retry';
    payout.failedAt = new Date();
    await Payout.findOneAndUpdate(
      { payoutId: transactionId },
      {
        status: 'FAILED',
        failedAt: payout.failedAt,
        lastFailureReason: payout.lastFailureReason,
        statusHistory: payout.statusHistory,
        updatedAt: new Date(),
      },
      { new: true }
    );
    logger.warn('Payout failed', { transactionId, method });
  }

  async getPayoutStatus(transactionId) {
    const payout = this.payouts.get(transactionId) || await Payout.findOne({ payoutId: transactionId }).lean();
    if (!payout) {
      return {
        success: false,
        error: 'Payout transaction not found',
      };
    }

    return {
      success: true,
      transactionId,
      claimId: payout.claimId,
      userId: payout.userId,
      status: payout.status === 'COMPLETED' ? 'SUCCESS' : payout.status,
      amount: payout.netAmount,
      method: payout.method,
      createdAt: payout.createdAt,
      completedAt: payout.completedAt || null,
      statusHistory: payout.statusHistory,
      nextAction: payout.status === 'FAILED' ? 'Will retry in 1 hour' : null,
    };
  }

  async getUserPayouts(userId) {
    const records = await Payout.find({ userId, sourceType: { $ne: 'DEMO' } }).sort({ createdAt: -1 }).lean();
    return records.map((record) => ({
      ...record,
      status: record.status === 'COMPLETED' ? 'SUCCESS' : record.status,
    }));
  }

  async getPayoutStatistics() {
    const [stats] = await Payout.aggregate([
      { $match: { sourceType: { $ne: 'DEMO' } } },
      {
        $group: {
          _id: null,
          totalPayouts: { $sum: 1 },
          totalAmount: { $sum: '$grossAmount' },
          completedPayouts: {
            $sum: { $cond: [{ $eq: ['$status', 'SUCCESS'] }, 1, 0] }
          },
          completedAmount: {
            $sum: { $cond: [{ $eq: ['$status', 'SUCCESS'] }, '$netAmount', 0] }
          },
          pendingPayouts: { $sum: { $cond: [{ $eq: ['$status', 'PENDING'] }, 1, 0] } },
          processingPayouts: { $sum: { $cond: [{ $eq: ['$status', 'PROCESSING'] }, 1, 0] } },
          failedPayouts: { $sum: { $cond: [{ $eq: ['$status', 'FAILED'] }, 1, 0] } }
        }
      }
    ]);

    const totalPayouts = stats?.totalPayouts || 0;
    const totalAmount = stats?.totalAmount || 0;
    const completedPayouts = stats?.completedPayouts || 0;
    const completedAmount = stats?.completedAmount || 0;
    const pendingPayouts = stats?.pendingPayouts || 0;
    const processingPayouts = stats?.processingPayouts || 0;
    const failedPayouts = stats?.failedPayouts || 0;

    return {
      totalPayouts,
      totalAmount,
      completedPayouts,
      completedAmount,
      pendingPayouts,
      processingPayouts,
      failedPayouts,
      successRate: totalPayouts ? `${Math.round((completedPayouts / totalPayouts) * 100)}%` : '0%',
    };
  }

  async validatePayoutEligibility(claimData) {
    const issues = [];

    if (claimData?.policy && claimData.policy.status !== 'ACTIVE') {
      issues.push(`Policy status is ${claimData.policy.status}, must be ACTIVE`);
    }

    if (claimData?.policy && new Date() > new Date(claimData.policy.expiryDate)) {
      issues.push('Policy has expired');
    }

    if (claimData?.claim && claimData.claim.payoutId) {
      issues.push('Claim has already been paid out');
    }

    if (claimData?.claim && Number(claimData.claim.amount || claimData.claim.approvedAmount || 0) <= 0) {
      issues.push('Invalid payout amount');
    }

    return {
      eligible: issues.length === 0,
      issues,
      timestamp: new Date(),
    };
  }

  generateTransactionId() {
    const timestamp = Date.now().toString(36).toUpperCase();
    const randomStr = Math.random().toString(36).slice(2, 10).toUpperCase();
    return `PAY-${timestamp}-${randomStr}`;
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getTransactionLog() {
    return this.transactionLog.slice(-50);
  }

  async processViaRazorpay(payoutData) {
    return this.processPayout({ ...payoutData, method: 'UPI' });
  }

  async processViaStripe(payoutData) {
    return this.processPayout({ ...payoutData, method: 'BANK_TRANSFER' });
  }

  async retryPayout(transactionId) {
    const payout = this.payouts.get(transactionId) || await Payout.findOne({ payoutId: transactionId });
    if (!payout) {
      return { success: false, error: 'Payout transaction not found' };
    }

    const retryRecord = this.payouts.get(transactionId) || payout;
    retryRecord.retryCount = Number(retryRecord.retryCount || 0) + 1;
    retryRecord.status = 'PROCESSING';
    retryRecord.lastFailureReason = null;
    retryRecord.statusHistory = retryRecord.statusHistory || [];
    retryRecord.statusHistory.push({
      status: 'PROCESSING',
      timestamp: new Date(),
      message: 'Manual retry initiated by insurer admin'
    });
    retryRecord.updatedAt = new Date();

    this.payouts.set(transactionId, retryRecord);

    await Payout.findOneAndUpdate(
      { payoutId: transactionId },
      {
        retryCount: retryRecord.retryCount,
        status: 'PROCESSING',
        lastFailureReason: null,
        statusHistory: retryRecord.statusHistory,
        updatedAt: new Date()
      },
      { new: true }
    );

    setImmediate(() => {
      this.simulatePaymentProcessing(transactionId, retryRecord.method).catch((error) => {
        logger.error(`Payout retry simulation failed: ${error.message}`);
      });
    });

    return {
      success: true,
      transactionId,
      status: 'PROCESSING',
      retryCount: retryRecord.retryCount,
    };
  }

  clearAllPayouts() {
    this.payouts.clear();
    this.transactionLog.length = 0;
  }
}

module.exports = new PayoutService();
