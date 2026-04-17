const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { initCronJobs } = require('./cron/scheduler');
const { getLogs, getNotifications, sendNotification } = require('./controllers/logController');
const { verifySyncToken, upsertUser, bulkUpsertUsers, getSyncHealth } = require('./controllers/syncController');
const logger = require('./utils/logger');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/automationdb';

app.use(express.json());

// API Endpoints
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    service: 'automation-system',
    timestamp: new Date().toISOString(),
  });
});

app.get('/logs', getLogs);
app.get('/api/v1/automation/notifications', getNotifications);
app.post('/api/v1/automation/notifications/send', sendNotification);
app.post('/api/v1/sync/users/upsert', verifySyncToken, upsertUser);
app.post('/api/v1/sync/users/bulk-upsert', verifySyncToken, bulkUpsertUsers);
app.get('/api/v1/sync/health', getSyncHealth);

// Database Connection and Server Start
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  logger.log('Connected to MongoDB');
  
  // Start the server
  const server = app.listen(PORT, () => {
    logger.log(`Server is running on port ${PORT}`);
    
    // Initialize the autonomous system
    initCronJobs();
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (err) => {
    logger.log(`Unhandled Rejection: ${err.message || err}`);
    server.close(() => process.exit(1));
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (err) => {
    logger.log(`Uncaught Exception: ${err.message || err}`);
    process.exit(1);
  });
})
.catch((err) => {
  logger.log(`MongoDB connection error: ${err.message}`);
});
