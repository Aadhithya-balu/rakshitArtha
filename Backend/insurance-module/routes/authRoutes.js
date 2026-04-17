const router = require('express').Router();
const {
    register,
    getUserProfile,
    getUserProfileByEmail,
    adminLogin,
    createInsurerAdmin,
    recordActivityState,
    getActivityStateHistory,
    verifyKYC,
    updateProfile,
    registerDeviceToken,
    getSyncHealth
} = require('../controllers/authController');
const {
    validateUserRegistration,
    validateKycSubmission,
    validateProfileUpdate,
    validateInsurerAdminProvision
} = require('../utils/validation');

// User Registration
router.post('/register', validateUserRegistration, register);

// Get User Profile
router.get('/profile-by-email/:email', getUserProfileByEmail);
router.get('/profile/:userId', getUserProfile);

// Activity State History
router.post('/activity-state/:userId', recordActivityState);
router.get('/activity-state/:userId', getActivityStateHistory);

// Insurer admin login (backend-created accounts only)
router.post('/admin/login', adminLogin);
router.post('/admin/create', validateInsurerAdminProvision, createInsurerAdmin);

// Verify KYC
router.post('/verify-kyc/:userId', validateKycSubmission, verifyKYC);

// Update Profile
router.patch('/profile/:userId', validateProfileUpdate, updateProfile);
router.post('/device-token/:userId', registerDeviceToken);
router.get('/sync/health', getSyncHealth);

module.exports = router;
