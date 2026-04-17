const router = require('express').Router();
const {
    submitClaim,
    simulateDemoClaim,
    getClaimDetails,
    getUserClaims,
    approveClaim,
    rejectClaim,
    processPayout
} = require('../controllers/claimController');
const { validateClaimSubmission, validateDemoClaimSimulation } = require('../utils/validation');

// Submit Claim
router.post('/submit', validateClaimSubmission, submitClaim);
router.post('/demo/simulate', validateDemoClaimSimulation, simulateDemoClaim);

// Get User Claims
router.get('/user/:userId/claims', getUserClaims);

// Get Claim Details
router.get('/:claimId', getClaimDetails);

// Approve Claim (Admin)
router.post('/:claimId/approve', approveClaim);

// Reject Claim (Admin)
router.post('/:claimId/reject', rejectClaim);

// Process Payout
router.post('/:claimId/payout', processPayout);

module.exports = router;
