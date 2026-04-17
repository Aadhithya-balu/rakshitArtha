const router = require('express').Router();
const {
    runDemoWorkflow,
    getDemoState,
    resetDemoWorkflow
} = require('../controllers/demoController');

router.post('/run', runDemoWorkflow);
router.post('/reset', resetDemoWorkflow);
router.get('/state', getDemoState);

module.exports = router;
