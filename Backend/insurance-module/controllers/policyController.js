const Policy = require('../models/Policy');
const User = require('../models/User');
const RiskData = require('../models/RiskData');
const axios = require('axios');
const crypto = require('crypto');
const { calculatePremium } = require('../services/premiumService');
const { parseWorkingHours, getShiftDurationHours, getShiftRiskMultiplier, getOverlapHours, getPeakHoursOverlapHours, buildDisruptionWindow } = require('../utils/timeParser');
const { asyncHandler, APIError } = require('../utils/errorHandler');
const logger = require('../utils/logger');
const { PLANS, POLICY_STATUS, USER_STATUS, RESPONSE_CODES, ERRORS, DEFAULTS } = require('../utils/constants');

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function readEnvValue(keys) {
    for (const key of keys) {
        const value = process.env[key];
        if (typeof value === 'string' && value.trim().length > 0) {
            return value.trim();
        }
    }
    return '';
}

function getRazorpayConfig() {
    const keyId = readEnvValue([
        'RAZORPAY_KEY_ID',
        'RAZORPAY_TEST_KEY_ID',
        'RAZORPAY_KEY',
        'VITE_RAZORPAY_KEY_ID'
    ]);
    const keySecret = readEnvValue([
        'RAZORPAY_KEY_SECRET',
        'RAZORPAY_TEST_KEY_SECRET',
        'RAZORPAY_SECRET',
        'VITE_RAZORPAY_KEY_SECRET'
    ]);

    if (!keyId || !keySecret) {
        throw new APIError(
            'Razorpay credentials are not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in Backend/.env',
            RESPONSE_CODES.SERVICE_UNAVAILABLE
        );
    }

    return { keyId, keySecret };
}

function isDemoPaymentsEnabled() {
    return String(process.env.ALLOW_DEMO_PAYMENTS || '').toLowerCase() === 'true';
}

function toRiskFactor(overallRisk) {
    if (typeof overallRisk !== 'number') {
        return 1;
    }

    return clamp(Number((overallRisk / 50).toFixed(2)), DEFAULTS.RISK_FACTOR_MIN, DEFAULTS.RISK_FACTOR_MAX);
}

function resolveShiftContext(user) {
    const parsedShift = parseWorkingHours(user?.workingHours || '');
    const dailyHours = getShiftDurationHours(parsedShift);
    const weeklyHours = dailyHours > 0 ? dailyHours * 7 : 40;
    const shiftRiskMultiplier = getShiftRiskMultiplier(parsedShift);
    const peakHoursOverlap = getPeakHoursOverlapHours(parsedShift);
    return { parsedShift, dailyHours, weeklyHours, shiftRiskMultiplier, peakHoursOverlap };
}

function resolveDisruptionProbability({ overallRisk, rainfallForecast, predictedDisruptionHours, zoneSafetyScore, peakHoursOverlap, shiftRiskMultiplier }) {
    return clamp(
        0.45 +
        clamp(Number(overallRisk || 0) / 180, 0, 0.45) +
        clamp(Number(rainfallForecast || 0) / 250, 0, 0.18) +
        clamp(Number(predictedDisruptionHours || 0) / 12, 0, 0.12) +
        clamp((Number(zoneSafetyScore) || 0) / 100 * 0.18, 0, 0.18) +
        clamp((Number(peakHoursOverlap) || 0) / 8, 0, 0.08) +
        clamp((Number(shiftRiskMultiplier) || 1) - 1, 0, 0.2),
        0.2,
        1.35
    );
}

function getBillingWindow() {
    const cycleStart = new Date();
    const cycleEnd = new Date(cycleStart);
    cycleEnd.setDate(cycleEnd.getDate() + 7);
    return { cycleStart, cycleEnd };
}

function createLocalDemoOrder({ amount, receipt, notes }) {
    return {
        id: `order_demo_${Date.now()}`,
        entity: 'order',
        amount,
        amount_paid: 0,
        amount_due: amount,
        currency: 'INR',
        receipt,
        status: 'created',
        notes: notes || {},
        provider: 'DEMO'
    };
}

async function ensureVerifiedUser(userId) {
    const user = await User.findById(userId);
    if (!user) {
        throw new APIError(ERRORS.USER_NOT_FOUND, RESPONSE_CODES.NOT_FOUND);
    }

    const kycVerified = Boolean(user.kyc?.verified);
    const accountIsActive = user.accountStatus === USER_STATUS.ACTIVE;

    if (kycVerified && !accountIsActive) {
        user.accountStatus = USER_STATUS.ACTIVE;
        user.updatedAt = new Date();
        await user.save();
    }

    if (!kycVerified && user.accountStatus !== USER_STATUS.ACTIVE) {
        throw new APIError('User account not verified', RESPONSE_CODES.FORBIDDEN);
    }

    return user;
}

async function createRazorpayOrder({ amount, receipt, notes }) {
    const { keyId, keySecret } = getRazorpayConfig();

    try {
        const response = await axios.post(
            'https://api.razorpay.com/v1/orders',
            {
                amount,
                currency: 'INR',
                receipt,
                notes
            },
            {
                auth: {
                    username: keyId,
                    password: keySecret
                },
                timeout: DEFAULTS.API_TIMEOUT_MS
            }
        );

        return response.data;
    } catch (error) {
        const status = error.response?.status;
        const razorpayMessage =
            error.response?.data?.error?.description ||
            error.response?.data?.error?.reason ||
            error.response?.data?.message ||
            error.message;

        logger.error('Failed to create Razorpay order', {
            message: error.message,
            response: error.response?.data,
            status,
            code: error.code
        });

        if (status === RESPONSE_CODES.UNAUTHORIZED || status === RESPONSE_CODES.FORBIDDEN) {
            throw new APIError(`Razorpay auth failed: ${razorpayMessage}`, RESPONSE_CODES.UNAUTHORIZED);
        }

        if (status) {
            throw new APIError(`Razorpay error: ${razorpayMessage}`, RESPONSE_CODES.SERVICE_UNAVAILABLE);
        }

        if (['ENOTFOUND', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN'].includes(error.code)) {
            throw new APIError('Razorpay API unreachable. Check internet or firewall access from the backend.', RESPONSE_CODES.SERVICE_UNAVAILABLE);
        }

        throw new APIError(`Unable to create Razorpay payment order: ${razorpayMessage}`, RESPONSE_CODES.SERVICE_UNAVAILABLE);
    }
}

async function fetchRazorpayPayment(paymentId) {
    const { keyId, keySecret } = getRazorpayConfig();

    const response = await axios.get(`https://api.razorpay.com/v1/payments/${paymentId}`, {
        auth: {
            username: keyId,
            password: keySecret
        },
        timeout: DEFAULTS.API_TIMEOUT_MS
    });

    return response.data;
}

// Create Policy
exports.createPolicy = asyncHandler(async (req, res) => {
    throw new APIError(
        'Direct policy activation is disabled. Create a payment order first and activate the policy only after successful payment verification.',
        RESPONSE_CODES.BAD_REQUEST
    );
});

exports.createPaymentOrder = asyncHandler(async (req, res) => {
    const { userId, plan, overallRisk, triggerTypes } = req.body;

    if (!userId) {
        throw new APIError('User ID is required', RESPONSE_CODES.BAD_REQUEST);
    }

    if (!plan || !PLANS[plan]) {
        throw new APIError(`Invalid plan: ${plan}`, RESPONSE_CODES.BAD_REQUEST);
    }

    const user = await ensureVerifiedUser(userId);
    const latestRisk = await RiskData.findOne({ userId }).sort({ createdAt: -1, timestamp: -1 });
    const effectiveOverallRisk = typeof overallRisk === 'number'
        ? overallRisk
        : Number(latestRisk?.riskMetrics?.overallRisk || 0);
    const riskFactor = toRiskFactor(effectiveOverallRisk);
    const shiftContext = resolveShiftContext(user);
    const disruptionProbability = resolveDisruptionProbability({
        overallRisk: effectiveOverallRisk,
        rainfallForecast: latestRisk?.weatherData?.rainfallForecast24h ?? latestRisk?.weatherData?.rainfall,
        predictedDisruptionHours: clamp(effectiveOverallRisk / 20, 0, 8),
        zoneSafetyScore: latestRisk?.riskMetrics?.locationRisk,
        peakHoursOverlap: shiftContext.peakHoursOverlap,
        shiftRiskMultiplier: shiftContext.shiftRiskMultiplier,
    });
    const pricing = calculatePremium(plan, riskFactor, user.workerType || 'GIG', {
        zoneSafetyScore: latestRisk?.riskMetrics?.locationRisk,
        rainfallForecast: latestRisk?.weatherData?.rainfallForecast24h ?? latestRisk?.weatherData?.rainfall,
        predictedDisruptionHours: clamp(effectiveOverallRisk / 20, 0, 8),
        workingHours: user?.workingHours,
        weeklyHours: shiftContext.weeklyHours,
        shiftRiskMultiplier: shiftContext.shiftRiskMultiplier,
        peakHoursOverlap: shiftContext.peakHoursOverlap,
        disruptionProbability,
        platformActivity: user?.activityTelemetry,
    });
    const receipt = `gc_${String(userId).slice(-8)}_${Date.now().toString().slice(-6)}`;
    let order;
    let paymentProvider = 'RAZORPAY';

    try {
        order = await createRazorpayOrder({
            amount: (pricing.pricingBreakdown?.lockedPayableAmount || pricing.weeklyPremium) * 100,
            receipt,
            notes: {
                userId: String(userId),
                plan,
                normalizedPlanCode: pricing.pricingBreakdown?.normalizedPlan || plan,
                lockedPayableAmount: pricing.pricingBreakdown?.lockedPayableAmount || pricing.weeklyPremium,
                billingCycle: 'WEEKLY'
            }
        });
    } catch (error) {
        if (!isDemoPaymentsEnabled()) {
            throw error;
        }

        logger.warn('Falling back to demo payment order', {
            userId,
            plan,
            message: error.message
        });
        order = createLocalDemoOrder({
            amount: (pricing.pricingBreakdown?.lockedPayableAmount || pricing.weeklyPremium) * 100,
            receipt,
            notes: {
                userId: String(userId),
                plan,
                normalizedPlanCode: pricing.pricingBreakdown?.normalizedPlan || plan,
                lockedPayableAmount: pricing.pricingBreakdown?.lockedPayableAmount || pricing.weeklyPremium,
                billingCycle: 'WEEKLY'
            }
        });
        paymentProvider = 'DEMO';
    }

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + DEFAULTS.POLICY_DURATION_DAYS);
    const { cycleStart, cycleEnd } = getBillingWindow();

    const pendingPolicy = await Policy.create({
        userId,
        plan,
        workerType: user.workerType || 'GIG',
        weeklyPremium: pricing.weeklyPremium,
        coverageAmount: pricing.coverageAmount,
        riskFactor,
        normalizedPlanCode: pricing.pricingBreakdown?.normalizedPlan || plan,
        lockedPayableAmount: pricing.pricingBreakdown?.lockedPayableAmount || pricing.weeklyPremium,
        pricingBreakdown: pricing.pricingBreakdown || null,
        triggerTypes: triggerTypes || ['HEAVY_RAIN', 'HIGH_POLLUTION', 'TRAFFIC_BLOCKED'],
        startDate: new Date(),
        expiryDate,
        status: POLICY_STATUS.SUSPENDED,
        paymentStatus: 'PENDING',
        paymentProvider,
        razorpayOrderId: order.id,
        nextPaymentDue: cycleEnd,
        billingHistory: [{
            cycleStart,
            cycleEnd,
            amount: pricing.weeklyPremium,
            status: 'PENDING',
            provider: paymentProvider,
            razorpayOrderId: order.id
        }]
    });

    const checkoutUrl = `${req.protocol}://${req.get('host')}/policy/payment/checkout/${pendingPolicy._id}`;

    logger.info('Payment order created for policy activation', {
        policyId: pendingPolicy._id,
        userId,
        plan,
        orderId: order.id
    });

    res.status(RESPONSE_CODES.CREATED).json({
        success: true,
        message: 'Payment order created successfully',
        data: {
            policyId: pendingPolicy._id,
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            keyId: paymentProvider === 'DEMO'
                ? 'demo_key'
                : getRazorpayConfig().keyId,
            weeklyPremium: pricing.weeklyPremium,
            coverageAmount: pricing.coverageAmount,
            lockedPayableAmount: pendingPolicy.lockedPayableAmount,
            pricingBreakdown: pendingPolicy.pricingBreakdown,
            normalizedPlanCode: pendingPolicy.normalizedPlanCode,
            nextPaymentDue: pendingPolicy.nextPaymentDue,
            paymentProvider,
            checkoutUrl
        }
    });
});

exports.verifyPaymentAndActivatePolicy = asyncHandler(async (req, res) => {
    const {
        policyId,
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature
    } = req.body;

    if (!policyId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
        throw new APIError('Payment verification payload is incomplete', RESPONSE_CODES.BAD_REQUEST);
    }

    const policy = await Policy.findById(policyId);
    if (!policy) {
        throw new APIError(ERRORS.POLICY_NOT_FOUND, RESPONSE_CODES.NOT_FOUND);
    }

    if (policy.razorpayOrderId !== razorpayOrderId) {
        throw new APIError('Order ID mismatch for this policy', RESPONSE_CODES.BAD_REQUEST);
    }

    const isDemoVerification =
        policy.paymentProvider === 'DEMO' ||
        razorpaySignature === 'demo_signature' ||
        String(razorpayPaymentId || '').startsWith('pay_demo_');

    let receivedAmount;

    if (!isDemoVerification) {
        const { keySecret } = getRazorpayConfig();
        const generatedSignature = crypto
            .createHmac('sha256', keySecret)
            .update(`${razorpayOrderId}|${razorpayPaymentId}`)
            .digest('hex');

        if (generatedSignature !== razorpaySignature) {
            policy.paymentStatus = 'FAILED';
            policy.updatedAt = new Date();
            const latestFailedBilling = policy.billingHistory?.[policy.billingHistory.length - 1];
            if (latestFailedBilling) {
                latestFailedBilling.status = 'FAILED';
            }
            await policy.save();
            throw new APIError('Payment signature verification failed', RESPONSE_CODES.BAD_REQUEST);
        }

        let razorpayPayment;
        try {
            razorpayPayment = await fetchRazorpayPayment(razorpayPaymentId);
        } catch (error) {
            throw new APIError('Unable to fetch Razorpay payment for verification', RESPONSE_CODES.SERVICE_UNAVAILABLE);
        }

        if (razorpayPayment.order_id !== razorpayOrderId) {
            throw new APIError('Razorpay payment does not belong to this order', RESPONSE_CODES.BAD_REQUEST);
        }

        if (!['captured', 'authorized'].includes(String(razorpayPayment.status || '').toLowerCase())) {
            throw new APIError('Razorpay payment is not successful', RESPONSE_CODES.BAD_REQUEST);
        }

        receivedAmount = Number(razorpayPayment.amount);
    } else {
        receivedAmount = Math.round((policy.lockedPayableAmount || policy.weeklyPremium) * 100);
    }

    const expectedAmount = Math.round((policy.lockedPayableAmount || policy.weeklyPremium) * 100);
    const billingExpectedAmount = Math.round((policy.billingHistory?.[policy.billingHistory.length - 1]?.amount || 0) * 100);
    const acceptedAmounts = new Set([expectedAmount, billingExpectedAmount].filter((value) => value > 0));

    if (!acceptedAmounts.has(receivedAmount)) {
        policy.paymentStatus = 'FAILED';
        policy.updatedAt = new Date();
        const latestFailedBilling = policy.billingHistory?.[policy.billingHistory.length - 1];
        if (latestFailedBilling) {
            latestFailedBilling.status = 'FAILED';
        }
        await policy.save();
        throw new APIError(
            `Payment amount mismatch. Expected one of [${Array.from(acceptedAmounts).join(', ')}], received ${receivedAmount}`,
            RESPONSE_CODES.BAD_REQUEST
        );
    }

    await Policy.updateMany(
        {
            userId: policy.userId,
            _id: { $ne: policy._id },
            status: POLICY_STATUS.ACTIVE
        },
        {
            status: POLICY_STATUS.CANCELLED,
            updatedAt: new Date()
        }
    );

    policy.status = POLICY_STATUS.ACTIVE;
    policy.paymentStatus = 'PAID';
    policy.paymentProvider = isDemoVerification ? 'DEMO' : 'RAZORPAY';
    policy.razorpayOrderId = razorpayOrderId;
    policy.lastPaymentId = razorpayPaymentId;
    policy.lastPaymentAt = new Date();
    policy.amountPaid = (policy.amountPaid || 0) + (receivedAmount / 100);
    policy.nextPaymentDue = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    policy.updatedAt = new Date();

    const latestBilling = policy.billingHistory?.[policy.billingHistory.length - 1];
    if (latestBilling) {
        latestBilling.status = 'PAID';
        latestBilling.amount = receivedAmount / 100;
        latestBilling.razorpayPaymentId = razorpayPaymentId;
        latestBilling.paidAt = new Date();
    }

    await policy.save();

    logger.info('Policy activated after successful payment', {
        policyId: policy._id,
        userId: policy.userId,
        razorpayPaymentId
    });

    res.status(RESPONSE_CODES.SUCCESS).json({
        success: true,
        message: 'Payment verified and policy activated successfully',
        data: {
            policyId: policy._id,
            plan: policy.plan,
            normalizedPlanCode: policy.normalizedPlanCode || policy.plan,
            weeklyPremium: policy.weeklyPremium,
            coverageAmount: policy.coverageAmount,
            status: policy.status,
            paymentStatus: policy.paymentStatus,
            lockedPayableAmount: policy.lockedPayableAmount || policy.weeklyPremium,
            pricingBreakdown: policy.pricingBreakdown || null,
            nextPaymentDue: policy.nextPaymentDue,
            razorpayPaymentId
        }
    });
});

exports.renderHostedCheckout = asyncHandler(async (req, res) => {
    const { policyId } = req.params;
    const policy = await Policy.findById(policyId).populate('userId', 'name email phone');

    if (!policy) {
        throw new APIError(ERRORS.POLICY_NOT_FOUND, RESPONSE_CODES.NOT_FOUND);
    }

    if (!policy.razorpayOrderId) {
        throw new APIError('Payment order not found for this policy', RESPONSE_CODES.BAD_REQUEST);
    }

    const amount = Math.round((policy.lockedPayableAmount || policy.weeklyPremium) * 100);
    const isDemoCheckout = policy.paymentProvider === 'DEMO';
    const keyId = isDemoCheckout ? 'demo_key' : getRazorpayConfig().keyId;
    const verifyUrl = `${req.protocol}://${req.get('host')}/policy/payment/verify`;
    const safeName = JSON.stringify(policy.userId?.name || 'RakshitArtha Customer');
    const safeEmail = JSON.stringify(policy.userId?.email || '');
    const safeContact = JSON.stringify(policy.userId?.phone || '');
    const safePolicyId = JSON.stringify(String(policy._id));
    const safeOrderId = JSON.stringify(policy.razorpayOrderId);
    const safeAmount = JSON.stringify(amount);
    const safeKeyId = JSON.stringify(keyId);
    const safeVerifyUrl = JSON.stringify(verifyUrl);
    const safePlan = JSON.stringify(policy.normalizedPlanCode || policy.plan);
    const safeProvider = JSON.stringify(policy.paymentProvider || 'RAZORPAY');

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>RakshitArtha Payment</title>
    <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
    <style>
      body { font-family: Arial, sans-serif; background: #f5f7fb; color: #10213a; margin: 0; padding: 24px; }
      .card { max-width: 520px; margin: 40px auto; background: #fff; border-radius: 16px; padding: 24px; box-shadow: 0 18px 50px rgba(16,33,58,0.12); }
      h1 { margin-top: 0; font-size: 24px; }
      p { line-height: 1.6; }
      .meta { background: #f3f6fb; border-radius: 12px; padding: 16px; margin: 16px 0; }
      .row { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
      .label { color: #5e7089; }
      button { width: 100%; border: 0; border-radius: 12px; background: #0f62fe; color: #fff; padding: 14px 18px; font-size: 16px; font-weight: 700; cursor: pointer; }
      button:disabled { background: #9eb8ee; cursor: not-allowed; }
      .status { margin-top: 16px; font-weight: 600; }
      .ok { color: #15803d; }
      .err { color: #b91c1c; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Complete Your Policy Payment</h1>
      <p>Your policy will be activated only after Razorpay confirms a successful payment.</p>
      <div class="meta">
        <div class="row"><span class="label">Policy</span><strong id="plan"></strong></div>
        <div class="row"><span class="label">Order ID</span><strong id="orderId"></strong></div>
        <div class="row"><span class="label">Amount</span><strong id="amount"></strong></div>
        <div class="row"><span class="label">Provider</span><strong id="provider"></strong></div>
      </div>
      <button id="payButton">Pay Securely</button>
      <div id="status" class="status"></div>
    </div>
    <script>
      const policyId = ${safePolicyId};
      const orderId = ${safeOrderId};
      const amount = ${safeAmount};
      const key = ${safeKeyId};
      const verifyUrl = ${safeVerifyUrl};
      const provider = ${safeProvider};
      const plan = ${safePlan};
      const statusEl = document.getElementById('status');
      const payButton = document.getElementById('payButton');

      document.getElementById('plan').textContent = plan;
      document.getElementById('orderId').textContent = orderId;
      document.getElementById('amount').textContent = 'INR ' + (amount / 100).toFixed(2);
      document.getElementById('provider').textContent = provider;

      function setStatus(message, ok) {
        statusEl.textContent = message;
        statusEl.className = 'status ' + (ok ? 'ok' : 'err');
      }

      async function verifyPayment(payload) {
        const response = await fetch(verifyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const raw = await response.text();
        let data;
        try { data = raw ? JSON.parse(raw) : {}; } catch { data = { message: raw }; }
        if (!response.ok) {
          throw new Error(data.message || 'Payment verification failed');
        }
        return data;
      }

      payButton.addEventListener('click', function () {
        payButton.disabled = true;
        setStatus('Opening checkout...', true);

        if (provider === 'DEMO') {
          verifyPayment({
            policyId,
            razorpayOrderId: orderId,
            razorpayPaymentId: 'pay_demo_' + Date.now(),
            razorpaySignature: 'demo_signature'
          }).then(() => {
            setStatus('Payment verified. You can return to the app now.', true);
          }).catch((error) => {
            payButton.disabled = false;
            setStatus(error.message, false);
          });
          return;
        }

        const options = {
          key,
          amount,
          currency: 'INR',
          name: 'RakshitArtha',
          description: 'Policy activation payment',
          order_id: orderId,
          prefill: {
            name: ${safeName},
            email: ${safeEmail},
            contact: ${safeContact}
          },
          theme: { color: '#0f62fe' },
          modal: {
            ondismiss: function () {
              payButton.disabled = false;
              setStatus('Payment was cancelled before completion.', false);
            }
          },
          handler: function (response) {
            setStatus('Verifying payment with the backend...', true);
            verifyPayment({
              policyId,
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature
            }).then(() => {
              setStatus('Payment successful and policy activated. You can return to the app now.', true);
            }).catch((error) => {
              payButton.disabled = false;
              setStatus(error.message, false);
            });
          }
        };

        const razorpay = new Razorpay(options);
        razorpay.on('payment.failed', function (response) {
          payButton.disabled = false;
          const reason = response.error && (response.error.description || response.error.reason || response.error.code);
          setStatus(reason || 'Payment failed in Razorpay checkout.', false);
        });
        razorpay.open();
      });
    </script>
  </body>
</html>`);
});

// Get User Policies
exports.getUserPolicies = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { status } = req.query;

    const query = { userId };
    if (status) {
        query.status = status;
    }

    const policies = await Policy.find(query).sort({ createdAt: -1 });

    logger.debug('User policies retrieved', { userId, count: policies.length });

    res.status(RESPONSE_CODES.SUCCESS).json({
        success: true,
        count: policies.length,
        data: policies
    });
});

// Get Policy Details
exports.getPolicyDetails = asyncHandler(async (req, res) => {
    const { policyId } = req.params;

    const policy = await Policy.findById(policyId).populate('userId', 'name email phone location');
    if (!policy) {
        throw new APIError(ERRORS.POLICY_NOT_FOUND, RESPONSE_CODES.NOT_FOUND);
    }

    logger.debug('Policy details retrieved', { policyId });

    res.status(RESPONSE_CODES.SUCCESS).json({
        success: true,
        data: policy
    });
});

// Update Policy (extend or modify triggers)
exports.updatePolicy = asyncHandler(async (req, res) => {
    const { policyId } = req.params;
    const { triggerTypes, triggerThresholds } = req.body;

    const policy = await Policy.findById(policyId);
    if (!policy) {
        throw new APIError(ERRORS.POLICY_NOT_FOUND, RESPONSE_CODES.NOT_FOUND);
    }

    if (policy.status !== POLICY_STATUS.ACTIVE) {
        throw new APIError('Can only update active policies', RESPONSE_CODES.FORBIDDEN);
    }

    if (triggerTypes) {
        policy.triggerTypes = triggerTypes;
    }

    if (triggerThresholds) {
        policy.triggerThresholds = {
            ...policy.triggerThresholds,
            ...triggerThresholds
        };
    }

    policy.updatedAt = new Date();
    await policy.save();

    logger.info('Policy updated', { policyId, triggerTypes });

    res.status(RESPONSE_CODES.SUCCESS).json({
        success: true,
        message: 'Policy updated successfully',
        data: policy
    });
});

// Suspend Policy
exports.suspendPolicy = asyncHandler(async (req, res) => {
    const { policyId } = req.params;
    const { reason } = req.body;

    const policy = await Policy.findByIdAndUpdate(
        policyId,
        {
            status: POLICY_STATUS.SUSPENDED,
            updatedAt: new Date()
        },
        { new: true }
    );

    if (!policy) {
        throw new APIError(ERRORS.POLICY_NOT_FOUND, RESPONSE_CODES.NOT_FOUND);
    }

    logger.warn('Policy suspended', { policyId, reason });

    res.status(RESPONSE_CODES.SUCCESS).json({
        success: true,
        message: 'Policy suspended successfully',
        data: policy
    });
});

// Cancel Policy
exports.cancelPolicy = asyncHandler(async (req, res) => {
    const { policyId } = req.params;

    const policy = await Policy.findByIdAndUpdate(
        policyId,
        {
            status: POLICY_STATUS.CANCELLED,
            updatedAt: new Date()
        },
        { new: true }
    );

    if (!policy) {
        throw new APIError(ERRORS.POLICY_NOT_FOUND, RESPONSE_CODES.NOT_FOUND);
    }

    logger.info('Policy cancelled', { policyId });

    res.status(RESPONSE_CODES.SUCCESS).json({
        success: true,
        message: 'Policy cancelled successfully',
        data: policy
    });
});

// Premium Quote (dry-run pricing)
exports.getPremiumQuote = asyncHandler(async (req, res) => {
    const { userId, plan, overallRisk } = req.body;
    
    if (!userId) {
        throw new APIError('User ID required', RESPONSE_CODES.BAD_REQUEST);
    }
    
    const user = await User.findById(userId);
    if (!user) {
        throw new APIError(ERRORS.USER_NOT_FOUND, RESPONSE_CODES.NOT_FOUND);
    }
    
    const latestRisk = await RiskData.findOne({ userId }).sort({ createdAt: -1, timestamp: -1 });
    const effectiveOverallRisk = typeof overallRisk === 'number'
        ? overallRisk
        : Number(latestRisk?.riskMetrics?.overallRisk || 0);
    const riskFactor = toRiskFactor(effectiveOverallRisk);
    const shiftContext = resolveShiftContext(user);
    const pricing = calculatePremium(plan, riskFactor, user.workerType || 'GIG', {
        zoneSafetyScore: latestRisk?.riskMetrics?.locationRisk,
        rainfallForecast: latestRisk?.weatherData?.rainfallForecast24h ?? latestRisk?.weatherData?.rainfall,
        predictedDisruptionHours: clamp(effectiveOverallRisk / 20, 0, 8),
        workingHours: user?.workingHours,
        weeklyHours: shiftContext.weeklyHours,
        shiftRiskMultiplier: shiftContext.shiftRiskMultiplier,
    });
    
    res.status(RESPONSE_CODES.SUCCESS).json({
        success: true,
        data: pricing
    });
});

// Estimate disruption protection using live risk + active policy
exports.estimateProtection = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { dailyIncome } = req.body;

    const user = await User.findById(userId);
    if (!user) {
        throw new APIError(ERRORS.USER_NOT_FOUND, RESPONSE_CODES.NOT_FOUND);
    }

    const latestRisk = await RiskData.findOne({ userId }).sort({ createdAt: -1, timestamp: -1 });
    const overallRisk = latestRisk?.riskMetrics?.overallRisk ?? 25;
    const rainfall = latestRisk?.weatherData?.rainfall ?? 0;
    const traffic = latestRisk?.activityData?.routeBlockages ?? 0;
    const income = Number(dailyIncome) || 850;
    const riskFactor = toRiskFactor(overallRisk);
    const policy = await Policy.findOne({
        userId,
        status: POLICY_STATUS.ACTIVE,
        paymentStatus: 'PAID',
        paymentProvider: 'RAZORPAY'
    }).sort({ createdAt: -1 });

    if (!policy) {
        throw new APIError(
            'Disruption estimate requires an active policy with completed Razorpay payment',
            RESPONSE_CODES.FORBIDDEN
        );
    }

    const pricing = { weeklyPremium: policy.weeklyPremium, coverageAmount: policy.coverageAmount, riskFactor: policy.riskFactor };
    const shiftContext = resolveShiftContext(user);
    const disruptionHours = clamp(
        Number(req.body?.disruptionHours) ||
        Number(latestRisk?.weatherData?.rainfall >= 50 ? 4 : latestRisk?.weatherData?.aqi >= 200 ? 3 : latestRisk?.activityData?.routeBlockages >= 4 ? 2 : 0),
        0,
        24
    );
    const disruptionWindow = buildDisruptionWindow({
        start: req.body?.disruptionStartHour,
        end: req.body?.disruptionEndHour,
        durationHours: disruptionHours,
    });
    const overlapHours = shiftContext.parsedShift
        ? getOverlapHours(shiftContext.parsedShift, disruptionWindow)
        : disruptionHours;

    const disruptionPercent = clamp(
        Number((
            0.1 +
            (overallRisk / 220) +
            (rainfall >= 50 ? 0.12 : rainfall >= 20 ? 0.05 : 0) +
            (traffic >= 4 ? 0.08 : traffic >= 3 ? 0.04 : 0)
        ).toFixed(2)),
        0.1,
        0.65
    );

    const estimatedLoss = Math.round(income * disruptionPercent);
    const overlapRatio = disruptionHours > 0 ? clamp(overlapHours / disruptionHours, 0, 1) : 0;
    const overlapAdjustedLoss = Math.round(estimatedLoss * overlapRatio);
    const payout = overlapRatio <= 0
        ? 0
        : Math.min(
            pricing.coverageAmount,
            Math.round(overlapAdjustedLoss * (pricing.riskFactor >= 1.2 ? 1.05 : 0.95))
        );
    const reason = overlapRatio <= 0
        ? 'No disruption during working hours'
        : `Overlap-aware payout based on ${Math.round(overlapHours * 100) / 100} hour(s) of the shift.`;

    res.status(RESPONSE_CODES.SUCCESS).json({
        success: true,
        data: {
            userId,
            policyId: policy._id,
            weeklyPremium: pricing.weeklyPremium,
            coverageAmount: pricing.coverageAmount,
            riskFactor: pricing.riskFactor,
            overallRisk,
            disruptionPercent,
            estimatedLoss: overlapAdjustedLoss,
            grossEstimatedLoss: estimatedLoss,
            disruptionHours,
            overlapHours,
            overlapRatio: Number(overlapRatio.toFixed(3)),
            shiftType: shiftContext.parsedShift ? (shiftContext.parsedShift.isOvernight ? 'NIGHT_OR_MIXED' : 'DAY') : 'UNKNOWN',
            payout,
            reason,
            auditTrace: {
                shift: user?.workingHours || null,
                disruption: req.body?.disruptionStartHour != null && req.body?.disruptionEndHour != null
                    ? `${req.body.disruptionStartHour}-${req.body.disruptionEndHour}`
                    : `${disruptionWindow.startHour.toFixed(2)}-${disruptionWindow.endHour.toFixed(2)}`,
                overlapHours: Number(overlapHours.toFixed(3)),
                overlapRatio: Number(overlapRatio.toFixed(3)),
            },
            source: latestRisk?.dataSource || 'MANUAL'
        }
    });
});
