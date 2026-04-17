const mongoose = require('mongoose');
const logger = require('../utils/logger');

const connectDB = async () => {
    try {
        const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/parametric-insurance';
        const isSrvUri = mongoURI.startsWith('mongodb+srv://');
        const connectionOptions = {
            serverSelectionTimeoutMS: 5000,
            family: 4,
        };

        if (!isSrvUri) {
            connectionOptions.directConnection = true;
        }
        
        await mongoose.connect(mongoURI, connectionOptions);
        
        logger.info('✅ MongoDB connected successfully');
        return mongoose.connection;
    } catch (error) {
        logger.error('❌ MongoDB connection failed:', error.message);

        process.exit(1);
    }
};

module.exports = connectDB;
