const express = require('express');
const router = express.Router();
const policyController = require('../controllers/policyController');
const { authenticateUser } = require('../middleware/auth');
const rateLimit = require('../middleware/rateLimit');
const {
	validatePaymentOrderPayload,
	validatePaymentVerificationPayload
} = require('../utils/validation');

router.post('/create', rateLimit, policyController.createPolicy);
router.post('/payment/order', rateLimit, validatePaymentOrderPayload, policyController.createPaymentOrder);
router.post('/payment/verify', rateLimit, validatePaymentVerificationPayload, policyController.verifyPaymentAndActivatePolicy);
router.get('/payment/checkout/:policyId', policyController.renderHostedCheckout);
router.get('/user/:userId', rateLimit, policyController.getUserPolicies);
router.get('/:policyId', rateLimit, policyController.getPolicyDetails);
router.put('/:policyId', rateLimit, policyController.updatePolicy);
router.post('/:policyId/suspend', rateLimit, policyController.suspendPolicy);
router.post('/:policyId/cancel', rateLimit, policyController.cancelPolicy);
router.delete('/:policyId/cancel', rateLimit, policyController.cancelPolicy);
router.post('/user/:userId/estimate', rateLimit, policyController.estimateProtection);
router.post('/premium/quote', rateLimit, policyController.getPremiumQuote);

module.exports = router;
