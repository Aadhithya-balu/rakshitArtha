const router = require('express').Router();
const payoutService = require('../services/payoutService');
const logger = require('../utils/logger');
const asyncHandler = require('express-async-handler');

router.get('/user/:userId', asyncHandler(async (req, res) => {
  const { userId } = req.params;

  try {
    const payouts = await payoutService.getUserPayouts(userId);

    res.status(200).json({
      success: true,
      data: payouts,
      count: payouts.length,
      timestamp: new Date(),
    });
  } catch (error) {
    logger.error(`Failed to retrieve user payouts: ${error.message}`);
    throw error;
  }
}));

router.get('/stats', asyncHandler(async (req, res) => {
  try {
    const stats = await payoutService.getPayoutStatistics();

    res.status(200).json({
      success: true,
      data: stats,
      timestamp: new Date(),
    });
  } catch (error) {
    logger.error(`Failed to retrieve payout statistics: ${error.message}`);
    throw error;
  }
}));

router.get('/log/transactions', asyncHandler(async (req, res) => {
  try {
    const log = payoutService.getTransactionLog();

    res.status(200).json({
      success: true,
      data: log,
      count: log.length,
      timestamp: new Date(),
    });
  } catch (error) {
    logger.error(`Failed to retrieve transaction log: ${error.message}`);
    throw error;
  }
}));

router.get('/:transactionId', asyncHandler(async (req, res) => {
  const { transactionId } = req.params;

  try {
    const status = await payoutService.getPayoutStatus(transactionId);

    if (!status.success) {
      return res.status(404).json(status);
    }

    res.status(200).json(status);
  } catch (error) {
    logger.error(`Failed to retrieve payout status: ${error.message}`);
    throw error;
  }
}));

router.get('/', asyncHandler(async (req, res) => {
  try {
    const stats = await payoutService.getPayoutStatistics();

    res.status(200).json({
      success: true,
      data: stats,
      timestamp: new Date(),
    });
  } catch (error) {
    logger.error(`Failed to retrieve payout statistics: ${error.message}`);
    throw error;
  }
}));

module.exports = router;
