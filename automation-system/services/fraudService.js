const logger = require('../utils/logger');

const runFraudCheck = (user, disruption) => {
  logger.log(`Running fraud check for user: ${user.name}`);
  
  if (!user.isActive) {
    logger.log(`Fraud check failed: User ${user.name} is inactive.`);
    return false;
  }

  // Basic check: disruption must be a valid type detected by the system
  if (disruption.disruptionType === 'NONE') {
    logger.log(`Fraud check failed: No valid disruption detected for ${user.name}.`);
    return false;
  }

  // Add more logic if needed (e.g., location radius check if multiple users are in one area)
  logger.log(`Fraud check passed for ${user.name}.`);
  return true;
};

module.exports = { runFraudCheck };
