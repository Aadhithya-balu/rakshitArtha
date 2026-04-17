const router = require('express').Router();
const {
    getLatestRiskByUserId,
    getLatestRiskByEmail,
    refreshRiskByUserId,
    refreshRiskByEmail,
    runWorkflowByUserId,
    runWorkflowByEmail,
    getAlertsByUserId,
    getAlertsByEmail,
    debugExternalServices,
    getNearbyZonesByUserId,
    getNearbyZonesByEmail
} = require('../controllers/riskController');
const {
    getAdminDashboard,
    getAdminClaims,
    getAdminPayouts,
    getAdminFraud,
    getAdminPolicyInsights,
    markClaimSuspicious,
    suspendUser,
    retryPayout,
} = require('../controllers/adminDashboardController');

router.get('/debug/external', debugExternalServices);
router.get('/user/:userId/latest', getLatestRiskByUserId);
router.get('/email/:email/latest', getLatestRiskByEmail);
router.get('/user/:userId/alerts', getAlertsByUserId);
router.get('/email/:email/alerts', getAlertsByEmail);
router.get('/admin/:userId/dashboard', getAdminDashboard);
router.get('/admin/:userId/claims', getAdminClaims);
router.get('/admin/:userId/payouts', getAdminPayouts);
router.get('/admin/:userId/fraud', getAdminFraud);
router.get('/admin/:userId/policies', getAdminPolicyInsights);
router.post('/admin/:userId/claims/:claimId/suspicious', markClaimSuspicious);
router.post('/admin/:userId/users/:targetUserId/suspend', suspendUser);
router.post('/admin/:userId/payouts/:transactionId/retry', retryPayout);
router.get('/user/:userId/nearby-zones', getNearbyZonesByUserId);
router.get('/email/:email/nearby-zones', getNearbyZonesByEmail);
router.post('/user/:userId/refresh', refreshRiskByUserId);
router.post('/email/:email/refresh', refreshRiskByEmail);
router.post('/user/:userId/workflow', runWorkflowByUserId);
router.post('/email/:email/workflow', runWorkflowByEmail);

module.exports = router;
