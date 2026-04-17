const express = require('express');
const router = express.Router();
const controller = require('../controllers/platformIntegrationController');

router.get('/health', controller.getSummary);
router.post('/sync/:platform', controller.manualSync);
router.post('/sync/:platform/bulk', controller.bulkSync);
router.post('/webhooks/:platform', controller.handleWebhook);
router.get('/:userId', controller.getUserPlatformState);
router.post('/webhook', controller.handleWebhookByBody);

module.exports = router;