const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  sourceUserId: { type: String, required: true, unique: true, index: true },
  email: { type: String, default: null, lowercase: true, index: true },
  name: { type: String, required: true },
  location: {
    lat: { type: Number, default: 0 },
    lng: { type: Number, default: 0 }
  },
  weeklyIncome: { type: Number, required: true, default: 0, min: 0 },
  weeklyHours: { type: Number, required: true, default: 40, min: 1 },
  workingHours: { type: String, default: null },
  workStartHour: { type: Number, min: 0, max: 23, default: null },
  workEndHour: { type: Number, min: 0, max: 23, default: null },
  isOvernightShift: { type: Boolean, default: false },
  shiftType: { type: String, default: 'UNKNOWN' },
  isActive: { type: Boolean, default: true },
  role: { type: String, default: 'WORKER' },
  accountStatus: { type: String, default: null },
  syncMetadata: {
    sourceUpdatedAt: { type: Date, default: null },
    lastSyncedAt: { type: Date, default: Date.now },
  },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
