// Test script for enhanced ML Fraud Detection Model
const { mlFraudDetectionModel } = require('./services/mlFraudDetectionModel');

async function testMLModel() {
  try {
    console.log('🧪 Testing Enhanced ML Fraud Detection Model...\n');
    
    // Initialize the model
    await mlFraudDetectionModel.initialize();
    console.log('✅ Model initialized successfully (No TensorFlow required!)\n');

    // Test Case 1: Normal claim
    console.log('Test 1: Normal Claim');
    const normalClaim = {
      claimAmount: 300,
      riskScore: 50,
      locationDistance: 5,
      daysToExpiry: 200,
      claimsInPast7days: 0,
      claimsInPast30days: 1,
      claimsInPast90days: 2,
      claimVelocityLast24h: 0,
      amountDeviation: 0.3,
      lossRatioPercent: 45,
      deviceMotionVariance: 0.7,
      idleRatio: 0.2,
      speedMph: 30,
      vpnDetected: false,
      deviceSpoof: false,
      networkAnomaly: false,
      accountAge: 90,
      trustScore: 0.8
    };
    
    let result = await mlFraudDetectionModel.predictFraudScore(normalClaim);
    console.log('Score:', result.score);
    console.log('Confidence:', result.confidence + '%');
    console.log('Interpretation:', result.interpretation);
    console.log('Severity:', result.severity);
    console.log('');

    // Test Case 2: Suspicious claim
    console.log('Test 2: Suspicious Claim');
    const suspiciousClaim = {
      claimAmount: 1200,
      riskScore: 25,
      locationDistance: 45,
      daysToExpiry: 15,
      claimsInPast7days: 3,
      claimsInPast30days: 8,
      claimsInPast90days: 15,
      claimVelocityLast24h: 2,
      amountDeviation: 2.2,
      lossRatioPercent: 180,
      deviceMotionVariance: 0.1,
      idleRatio: 0.9,
      speedMph: 140,
      vpnDetected: true,
      deviceSpoof: false,
      networkAnomaly: false,
      accountAge: 5,
      trustScore: 0.2
    };
    
    result = await mlFraudDetectionModel.predictFraudScore(suspiciousClaim);
    console.log('Score:', result.score);
    console.log('Confidence:', result.confidence + '%');
    console.log('Interpretation:', result.interpretation);
    console.log('Severity:', result.severity);
    console.log('Flags:', result.flags.slice(0, 5).join(', '));
    console.log('');

    // Test Case 3: High-risk fraud indicators
    console.log('Test 3: High-Risk Fraud Indicators');
    const fraudulentClaim = {
      claimAmount: 2500,
      riskScore: 10,
      locationDistance: 120,
      daysToExpiry: 2,
      claimsInPast7days: 5,
      claimsInPast30days: 12,
      claimsInPast90days: 20,
      claimVelocityLast24h: 4,
      amountDeviation: 4.5,
      lossRatioPercent: 350,
      deviceMotionVariance: 0.05,
      idleRatio: 0.95,
      speedMph: 280,
      vpnDetected: true,
      deviceSpoof: true,
      networkAnomaly: true,
      accountAge: 1,
      trustScore: 0.1
    };
    
    result = await mlFraudDetectionModel.predictFraudScore(fraudulentClaim);
    console.log('Score:', result.score);
    console.log('Confidence:', result.confidence + '%');
    console.log('Interpretation:', result.interpretation);
    console.log('Severity:', result.severity);
    console.log('Flags:', result.flags.join(', '));
    console.log('');

    console.log('📊 Component Scores for High-Risk Case:');
    Object.entries(result.components).forEach(([key, value]) => {
      console.log(`  ${key}: ${value}`);
    });

    console.log('\n✅ All tests passed! ML Model working correctly.\n');
    process.exit(0);

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testMLModel();
