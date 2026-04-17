const mongoose = require('mongoose');
const User = require('./models/User');
const dotenv = require('dotenv');

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/automationdb';

const sampleUsers = [
  {
    sourceUserId: 'seed-user-1',
    name: "John Doe",
    location: { lat: 40.7128, lng: -74.0060 },
    weeklyIncome: 1200,
    weeklyHours: 40,
    isActive: true
  },
  {
    sourceUserId: 'seed-user-2',
    name: "Jane Smith",
    location: { lat: 34.0522, lng: -118.2437 },
    weeklyIncome: 1500,
    weeklyHours: 35,
    isActive: true
  },
  {
    sourceUserId: 'seed-user-3',
    name: "Bob Wilson",
    location: { lat: 51.5074, lng: -0.1278 },
    weeklyIncome: 800,
    weeklyHours: 40,
    isActive: false
  }
];

const seedDatabase = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB for seeding...');
    
    // Clear existing users
    await User.deleteMany({});
    console.log('Cleared existing users.');
    
    // Insert new users
    await User.insertMany(sampleUsers);
    console.log('Sample users seeded successfully!');
    
    mongoose.connection.close();
  } catch (error) {
    console.error('Error seeding database:', error.message);
    process.exit(1);
  }
};

seedDatabase();
