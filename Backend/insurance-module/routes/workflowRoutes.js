const express = require('express');
const router = express.Router();
const workflowController = require('../controllers/workflowController');

// Public/Protected Routes
router.get(
    '/claim/:claimId/workflow',
    workflowController.getClaimWorkflow
);

router.get(
    '/claim/:claimId/fraud-checks',
    workflowController.getClaimFraudChecks
);

router.get(
    '/claim/:claimId/complete-status',
    workflowController.getClaimCompleteStatus
);

router.get(
    '/user/:userId/claims/workflows',
    workflowController.getUserClaimWorkflows
);

// Internal Routes (for automation system)
router.post(
    '/internal/claim/:claimId/workflow/init',
    workflowController.initializeClaimWorkflow
);

router.post(
    '/internal/claim/:claimId/workflow/step',
    workflowController.logWorkflowStep
);

router.post(
    '/internal/claim/:claimId/fraud-checks/log',
    workflowController.logFraudChecks
);

router.put(
    '/internal/claim/:claimId/workflow/complete',
    workflowController.completeClaimWorkflow
);

router.put(
    '/internal/claim/:claimId/workflow/reject',
    workflowController.rejectClaimWorkflow
);

module.exports = router;
