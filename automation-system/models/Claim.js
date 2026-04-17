const mongoose = require('mongoose');

const claimSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  disruptionType: { type: String, required: true }, // e.g., "HEAVY_RAIN", "HEAT_WAVE"
  durationHours: { type: Number, required: true, min: 0 },
  lossAmount: { type: Number, required: true },
  calculationMessage: { type: String, default: null },
  status: { type: String, default: 'APPROVED' },
  timestamp: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('Claim', claimSchema);
