const router = require('express').Router();
const asyncHandler = require('express-async-handler');
const Payment = require('../models/Payment');
const User = require('../models/User');
const { APIError } = require('../utils/errorHandler');
const { RESPONSE_CODES, ERRORS } = require('../utils/constants');

function normalizePayload(body = {}) {
  return {
    userId: body.userId,
    accountHolderName: body.accountHolderName?.trim() || null,
    bankName: body.bankName?.trim() || null,
    accountNumber: body.accountNumber?.trim() || null,
    ifscCode: body.ifscCode?.trim().toUpperCase() || null,
    upiId: body.upiId?.trim().toLowerCase() || null,
    isVerified: body.isVerified === true,
  };
}

function validatePaymentDetails(data) {
  const hasBankDetails = Boolean(
    data.accountHolderName && data.bankName && data.accountNumber && data.ifscCode
  );
  const hasUpiDetails = Boolean(data.upiId);

  if (!hasBankDetails && !hasUpiDetails) {
    throw new APIError(
      'Provide either a UPI ID or full bank account details',
      RESPONSE_CODES.BAD_REQUEST
    );
  }
}

router.post('/add', asyncHandler(async (req, res) => {
  const data = normalizePayload(req.body);
  if (!data.userId) {
    throw new APIError('User ID is required', RESPONSE_CODES.BAD_REQUEST);
  }

  validatePaymentDetails(data);

  const user = await User.findById(data.userId);
  if (!user) {
    throw new APIError(ERRORS.USER_NOT_FOUND, RESPONSE_CODES.NOT_FOUND);
  }

  const existing = await Payment.findOne({ userId: data.userId });
  const hasChanged = existing && (
    existing.accountHolderName !== data.accountHolderName ||
    existing.bankName !== data.bankName ||
    existing.accountNumber !== data.accountNumber ||
    existing.ifscCode !== data.ifscCode ||
    existing.upiId !== data.upiId
  );

  const payment = await Payment.findOneAndUpdate(
    { userId: data.userId },
    {
      ...data,
      verificationMethod: data.isVerified ? 'MANUAL' : 'MANUAL',
      verifiedAt: data.isVerified ? new Date() : null,
      isVerified: data.isVerified && !hasChanged,
      updatedAt: new Date(),
    },
    {
      new: true,
      upsert: true,
      runValidators: true,
      setDefaultsOnInsert: true,
    }
  );

  res.status(RESPONSE_CODES.SUCCESS).json({
    success: true,
    message: 'Payment details added successfully',
    data: payment,
  });
}));

router.get('/user/:userId', asyncHandler(async (req, res) => {
  const payment = await Payment.findOne({ userId: req.params.userId });

  res.status(RESPONSE_CODES.SUCCESS).json({
    success: true,
    data: payment,
  });
}));

router.post('/verify/:userId', asyncHandler(async (req, res) => {
  const payment = await Payment.findOneAndUpdate(
    { userId: req.params.userId },
    {
      isVerified: true,
      verificationMethod: 'MANUAL',
      verifiedAt: new Date(),
      updatedAt: new Date(),
    },
    { new: true }
  );

  if (!payment) {
    throw new APIError('No payment details found', RESPONSE_CODES.NOT_FOUND);
  }

  res.status(RESPONSE_CODES.SUCCESS).json({
    success: true,
    message: 'Payment details verified successfully',
    data: payment,
  });
}));

module.exports = router;
