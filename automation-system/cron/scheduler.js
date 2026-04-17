const cron = require('node-cron');
const { runMainAutomation } = require('../controllers/automationController');
const logger = require('../utils/logger');

const initCronJobs = () => {
  logger.log('Initializing scheduler...');
  
  // Every 1 hour as requested: '0 * * * *'
  // For hackathon demo, maybe every 1 minute: '* * * * *'
  cron.schedule('0 * * * *', () => {
    logger.log('CRON TRIGGERED: Running hourly automation job.');
    runMainAutomation();
  });

  logger.log('Scheduler started: Job set to run every 1 hour.');
  
  // Immediate run on startup for demo purposes
  logger.log('Running initial automation on startup...');
  runMainAutomation();
};

module.exports = { initCronJobs };
