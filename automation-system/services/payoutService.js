const Payout = require('../models/Payout');
const logger = require('../utils/logger');

const processPayout = async (userId, claimId, amount) => {
  logger.log(`Simulating payout for user ${userId}: Amount ${amount}`);
  
  try {
    const payout = new Payout({
      userId,
      claimId,
      amount,
      status: 'SUCCESS'
    });
    
    await payout.save();
    logger.log(`Payout record created successfully for user ${userId}.`);
    return payout;
  } catch (error) {
    logger.log(`Error processing payout: ${error.message}`);
    throw error;
  }
};

module.exports = { processPayout };
