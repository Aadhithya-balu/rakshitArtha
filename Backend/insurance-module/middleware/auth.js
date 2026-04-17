const jwt = require('jsonwebtoken');
const { asyncHandler, APIError } = require('../utils/errorHandler');
const { RESPONSE_CODES, ERRORS } = require('../utils/constants');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key-change-me';

const authenticateUser = asyncHandler(async (req, res, next) => {
  const authHeader = req.header('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new APIError('Access token required', RESPONSE_CODES.UNAUTHORIZED);
  }

  try {
    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    throw new APIError('Invalid token', RESPONSE_CODES.UNAUTHORIZED);
  }
});

module.exports = { authenticateUser };
