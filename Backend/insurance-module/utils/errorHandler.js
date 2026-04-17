const logger = require('./logger');
const { ERRORS, RESPONSE_CODES } = require('./constants');

// Error Handler Middleware
const errorHandler = (err, req, res, next) => {
    logger.error('Error occurred:', {
        message: err.message,
        stack: err.stack,
        url: req.originalUrl,
        method: req.method
    });

    // Mongoose Validation Error
    if (err.name === 'ValidationError') {
        const messages = Object.values(err.errors)
            .map(e => e.message)
            .join(', ');
        return res.status(RESPONSE_CODES.BAD_REQUEST).json({
            success: false,
            message: 'Validation Error',
            details: messages
        });
    }

    // Mongoose Duplicate Key Error
    if (err.code === 11000) {
        const field = Object.keys(err.keyPattern)[0];
        return res.status(RESPONSE_CODES.CONFLICT).json({
            success: false,
            message: `${field} already exists`
        });
    }

    // Mongoose Cast Error
    if (err.name === 'CastError') {
        return res.status(RESPONSE_CODES.BAD_REQUEST).json({
            success: false,
            message: 'Invalid ID format'
        });
    }

    // Default Error
    const statusCode = err.statusCode || RESPONSE_CODES.INTERNAL_SERVER_ERROR;
    const message = err.message || 'Internal server error';

    res.status(statusCode).json({
        success: false,
        message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
};

// Async Handler Wrapper
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// API Error Class
class APIError extends Error {
    constructor(message, statusCode = RESPONSE_CODES.INTERNAL_SERVER_ERROR) {
        super(message);
        this.statusCode = statusCode;
        this.name = 'APIError';
    }
}

module.exports = {
    errorHandler,
    asyncHandler,
    APIError
};
