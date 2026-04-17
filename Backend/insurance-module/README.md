# Insurance Module API Documentation

## Overview
Parametric Insurance Module for Gig Workers - An AI-enabled automatic insurance platform for gig economy workers providing coverage against disruptions (heavy rain, pollution, traffic, disasters).

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│         Frontend (GigCover Dashboard)                        │
└─────────────────┬───────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────────┐
│         Insurance Module API (Node.js/Express)              │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ Auth Routes │  │Policy Routes │  │ Claim Routes │       │
│  └─────────────┘  └──────────────┘  └──────────────┘       │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │            Services & Business Logic                 │   │
│  │  ├─ Premium Calculation                              │   │
│  │  ├─ Fraud Detection (Rule Engine)                    │   │
│  │  ├─ Trigger Validation                               │   │
│  │  └─ Payout Processing                                │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────┬───────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────────┐
│         Risk Prediction API (Python/FastAPI)                │
│  ├─ Risk Scoring Models                                     │
│  ├─ Environmental Risk Analysis                             │
│  └─ Behavioral Pattern Detection                            │
└─────────────────┬───────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────────┐
│         MongoDB Database                                    │
│  ├─ Users  ├─ Policies  ├─ Claims  ├─ Risk Data            │
│  └─ Fraud Logs                                              │
└─────────────────────────────────────────────────────────────┘
```

## Database Collections

### Users
- `_id`: ObjectId
- `name`: String (required)
- `email`: String (unique, required)
- `phone`: String (10 digits, required)
- `location`: String (required)
- `platform`: String (SWIGGY, ZOMATO, RIKSHAW, OTHER)
- `kyc.verified`: Boolean
- `accountStatus`: ACTIVE | SUSPENDED | VERIFICATION_PENDING
- `riskProfile`: { historicalClaims, fraudScore, reputationScore }

### Policies
- `userId`: ObjectId (ref: User)
- `plan`: BASIC | STANDARD | PREMIUM | GIG_BASIC | GIG_STANDARD | GIG_PREMIUM
- `status`: ACTIVE | SUSPENDED | EXPIRED | CANCELLED
- `weeklyPremium`: Number
- `coverageAmount`: Number
- `triggerTypes`: [String] (HEAVY_RAIN, HIGH_POLLUTION, DISASTER, TRAFFIC_BLOCKED)
- `expiryDate`: Date
- `startDate`: Date

### Claims
- `policyId`: ObjectId (ref: Policy)
- `userId`: ObjectId (ref: User)
- `claimType`: HEAVY_RAIN | HIGH_POLLUTION | DISASTER | TRAFFIC_BLOCKED
- `status`: SUBMITTED | UNDER_REVIEW | APPROVED | REJECTED | PAID
- `riskScore`: Number (0-100)
- `fraudScore`: Number (0-100)
- `fraudFlags`: [String]
- `triggerEvidence`: { weatherData, locationData, activityData }
- `approvedAmount`: Number
- `payoutAmount`: Number
- `payoutDate`: Date

### RiskData
- `userId`: ObjectId (ref: User)
- `weatherData`: { rainfall, aqi, temperature, humidity }
- `locationData`: { latitude, longitude, riskZone }
- `riskMetrics`: { environmentalRisk, locationRisk, activityRisk }

### FraudLog
- `userId`: ObjectId (ref: User)
- `claimId`: ObjectId (ref: Claim)
- `fraudType`: String
- `fraudScore`: Number (0-100)
- `severity`: LOW | MEDIUM | HIGH | CRITICAL
- `decision`: APPROVED | FLAGGED_FOR_REVIEW | REJECTED

## API Endpoints

### Authentication Routes `/auth`

#### Register User
```
POST /auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "9876543210",
  "location": "Mumbai",
  "platform": "SWIGGY",
  "latitude": 19.0760,
  "longitude": 72.8777,
  "workerType": "GIG"
}

Response: 201 Created
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "userId": "64f7a1b2c3d4e5f6g7h8i9j0",
    "email": "john@example.com",
    "status": "VERIFICATION_PENDING"
  }
}
```

#### Get User Profile
```
GET /auth/profile/:userId

Response: 200 OK
{
  "success": true,
  "data": { ...user object }
}
```

#### Verify KYC
```
POST /auth/verify-kyc/:userId
Content-Type: application/json

{
  "documentType": "AADHAR",
  "documentId": "123456789012"
}

Response: 200 OK
{
  "success": true,
  "message": "KYC verified successfully",
  "data": {
    "userId": "64f7a1b2c3d4e5f6g7h8i9j0",
    "accountStatus": "ACTIVE"
  }
}
```

#### Update Profile
```
PATCH /auth/profile/:userId
Content-Type: application/json

{
  "location": "Bangalore",
  "latitude": 12.9716,
  "longitude": 77.5946,
  "phone": "9876543211"
}

Response: 200 OK
```

#### Insurer Admin Login
```
POST /auth/admin/login
Content-Type: application/json

{
  "email": "insurer.admin@rakshitartha.in",
  "password": "<INSURER_ADMIN_PASSWORD>"
}

Response: 200 OK
{
  "success": true,
  "message": "Insurer admin login successful",
  "data": {
    "userId": "...",
    "name": "RakshitArtha Insurer Admin",
    "email": "insurer.admin@rakshitartha.in",
    "role": "INSURER_ADMIN",
    "accountStatus": "ACTIVE",
    "loginDetails": {
      "lastLoginAt": "2026-04-15T10:15:51.508Z",
      "lastLoginIp": "::1",
      "lastLoginUserAgent": "curl/8.18.0",
      "loginCount": 1
    }
  }
}
```

Notes:
- Backend can auto-provision the default insurer admin account on first login.
- Configure defaults with `INSURER_ADMIN_EMAIL` and `INSURER_ADMIN_NAME` in environment variables.

#### Activity State History
```
POST /auth/activity-state/:userId
Content-Type: application/json

{
  "state": "WALKING",
  "recordedAt": "2026-04-15T10:20:00.000Z",
  "source": "foreground-service",
  "accelerometerVariance": 0.0182,
  "idleRatio": 0.12,
  "motionConsistencyScore": 0.72,
  "sampleCount": 42,
  "deviceMotionAvailable": true
}

Response: 200 OK
{
  "success": true,
  "message": "Activity state recorded successfully",
  "data": {
    "userId": "...",
    "currentActivityState": { ... },
    "historyCount": 15
  }
}
```

Use `GET /auth/activity-state/:userId` to fetch the latest state plus history.

### Policy Routes `/policy`

#### Create Policy
```
POST /policy/create
Content-Type: application/json

{
  "userId": "64f7a1b2c3d4e5f6g7h8i9j0",
  "plan": "GIG_STANDARD",
  "workerType": "GIG",
  "riskFactor": 1.2,
  "triggerTypes": ["HEAVY_RAIN", "HIGH_POLLUTION"]
}

Response: 201 Created
{
  "success": true,
  "message": "Policy created successfully",
  "data": {
    "policyId": "64f7a1b2c3d4e5f6g7h8i9j1",
    "plan": "GIG_STANDARD",
    "weeklyPremium": 119,
    "coverageAmount": 1440,
    "status": "ACTIVE",
    "expiryDate": "2025-04-02"
  }
}
```

#### Get User Policies
```
GET /policy/user/:userId?status=ACTIVE

Response: 200 OK
{
  "success": true,
  "count": 2,
  "data": [ ...policies ]
}
```

#### Get Policy Details
```
GET /policy/:policyId

Response: 200 OK
{
  "success": true,
  "data": { ...policy object }
}
```

#### Update Policy
```
PATCH /policy/:policyId
Content-Type: application/json

{
  "triggerTypes": ["HEAVY_RAIN", "DISASTER"],
  "triggerThresholds": {
    "rainfall": 75,
    "aqi": 250
  }
}

Response: 200 OK
```

#### Suspend Policy
```
POST /policy/:policyId/suspend
Content-Type: application/json

{
  "reason": "Suspicious activity detected"
}

Response: 200 OK
```

#### Cancel Policy
```
POST /policy/:policyId/cancel

Response: 200 OK
```

### Claim Routes `/claim`

#### Submit Claim
```
POST /claim/submit
Content-Type: application/json

{
  "policyId": "64f7a1b2c3d4e5f6g7h8i9j1",
  "claimType": "HEAVY_RAIN",
  "riskScore": 75,
  "triggerEvidence": {
    "weatherData": {
      "rainfall": 65,
      "aqi": 180,
      "temperature": 28,
      "timestamp": "2024-04-02T10:30:00Z"
    },
    "locationData": {
      "latitude": 19.0760,
      "longitude": 72.8777,
      "address": "Bandra, Mumbai",
      "timestamp": "2024-04-02T10:30:00Z"
    },
    "activityData": {
      "deliveriesCompleted": 8,
      "workingHours": 6,
      "timestamp": "2024-04-02T10:30:00Z"
    }
  }
}

Response: 201 Created
{
  "success": true,
  "message": "Claim submitted successfully. Under review.",
  "data": {
    "claimId": "64f7a1b2c3d4e5f6g7h8i9j2",
    "status": "SUBMITTED",
    "fraudScore": 25,
    "estimatedProcessingTime": "24-48 hours"
  }
}
```

#### Get Claim Details
```
GET /claim/:claimId

Response: 200 OK
{
  "success": true,
  "data": { ...claim object }
}
```

#### Get User Claims
```
GET /claim/user/:userId/claims?status=APPROVED&skip=0&limit=10

Response: 200 OK
{
  "success": true,
  "data": [ ...claims ],
  "pagination": {
    "total": 5,
    "skip": 0,
    "limit": 10
  }
}
```

#### Approve Claim (Admin)
```
POST /claim/:claimId/approve
Content-Type: application/json

{
  "approvedAmount": 1000,
  "approvedBy": "admin@insurance.com",
  "notes": "Trigger evidence verified"
}

Response: 200 OK
{
  "success": true,
  "message": "Claim approved successfully",
  "data": {
    "claimId": "64f7a1b2c3d4e5f6g7h8i9j2",
    "status": "APPROVED",
    "approvedAmount": 1000
  }
}
```

#### Reject Claim (Admin)
```
POST /claim/:claimId/reject
Content-Type: application/json

{
  "reason": "Claim amount exceeds coverage limit",
  "rejectedBy": "admin@insurance.com"
}

Response: 200 OK
```

#### Process Payout
```
POST /claim/:claimId/payout
Content-Type: application/json

{
  "payoutMethod": "BANK_TRANSFER"
}

Response: 200 OK
{
  "success": true,
  "message": "Payout processed successfully",
  "data": {
    "claimId": "64f7a1b2c3d4e5f6g7h8i9j2",
    "status": "PAID",
    "payoutAmount": 1000,
    "payoutDate": "2024-04-02T15:45:00Z"
  }
}
```

## Fraud Detection Rules

The system applies 6 fraud detection rules with scoring:

| Rule | Weight | Threshold | Flag |
|------|--------|-----------|------|
| Location Mismatch | 25 pts | >5 km distance | LOCATION_MISMATCH |
| Duplicate Claim | 40 pts | <48 hrs | DUPLICATE_CLAIM |
| Claim Frequency | 20 pts | ≥2 claims/week | FREQUENCY_ANOMALY |
| Amount Anomaly | 15 pts | >300% deviation | AMOUNT_ANOMALY |
| Velocity Fraud | 30 pts | >3 claims/day | VELOCITY_FRAUD |
| Pattern Anomaly | 10 pts | New claim type | PATTERN_ANOMALY |

**Decision Logic:**
- Score > 70: Require manual review
- Score > 60: Flag for review
- Score ≤ 60: Auto-approve

## Parametric Triggers

### Heavy Rain
- **Threshold**: 50mm rainfall in specified duration
- **Duration**: 2+ hours
- **Coverage**: 100-120% of plan amount

### High Pollution (AQI)
- **Threshold**: AQI > 200
- **Duration**: 4+ hours
- **Coverage**: 80-100% of plan amount

### Traffic Blockage
- **Threshold**: 5+ km radius blocked
- **Duration**: 1+ hour
- **Coverage**: 50-70% of plan amount

### Natural Disaster
- **Types**: Flood, Earthquake, Cyclone
- **Coverage**: 100-150% of plan amount

## Error Codes

| Code | Message | Status |
|------|---------|--------|
| 200 | Success | OK |
| 201 | Created | Created |
| 400 | Invalid input | Bad Request |
| 401 | Unauthorized | Unauthorized |
| 403 | Forbidden | Forbidden |
| 404 | Not found | Not Found |
| 409 | Conflict (duplicate) | Conflict |
| 500 | Server error | Internal Error |
| 503 | Service unavailable | Unavailable |

## Setup & Installation

```bash
# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Configure MongoDB URI in .env
MONGODB_URI=mongodb://localhost:27017/parametric-insurance

# Run server
npm start

# Development mode with auto-reload
npm run dev

# Run tests
npm test

# Seed test data
npm run seed
```

## Security Considerations

1. **Input Validation**: All inputs validated against schema
2. **Authentication**: JWT tokens (future implementation)
3. **Rate Limiting**: API rate limiting (future)
4. **Data Encryption**: Sensitive data encrypted at rest
5. **CORS**: Cross-origin requests controlled
6. **Logging**: All operations logged for audit trail

## Monitoring & Logging

Logs are saved to `logs/app.log` and console output includes:
- API request/response
- Fraud detection analysis
- Database operations
- Error tracking

## Future Enhancements

1. Real-time weather data integration (IMD/OpenWeather API)
2. GPS location tracking integration
3. Platform activity data integration (Swiggy, Zomato APIs)
4. ML-based risk prediction service integration
5. SMS/Push notifications for claim status
6. Mobile app integration
7. Admin dashboard
8. Analytics & reporting

## Testing

Sample test payloads available in `tests/` directory.

---

**Version**: 1.0.0  
**Last Updated**: April 2024  
**Contact**: support@gig-insurance.com
