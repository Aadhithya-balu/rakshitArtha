# Risk Prediction API Documentation

## Overview
ML-based risk prediction service for the parametric insurance platform. Analyzes environmental, geographical, and behavioral factors to predict insurance risk scores and detect fraud patterns.

## System Architecture

```
┌─────────────────────────────┐
│   Risk Prediction API       │
│   (Python/FastAPI)          │
├─────────────────────────────┤
│ ├─ Risk Prediction Module   │
│ ├─ Geo Risk Analyzer        │
│ ├─ Fraud Detection Engine   │
│ └─ Trigger Analysis         │
└──────────────┬──────────────┘
               │
        ┌──────▼──────┐
        │ ML Models   │
        │  (Pickle)   │
        └─────────────┘
```

## Features

### 1. Risk Prediction
Predicts overall risk score based on:
- **Environmental Factors**: Rainfall, AQI, Temperature, Wind Speed
- **Location Risk**: Geographic zone analysis, flood-prone areas
- **Activity Risk**: Working hours, delivery frequency, speed patterns
- **Historical Data**: Claim history, user reputation

### 2. Fraud Detection
Detects suspicious claims using:
- Location mismatch detection
- Claim frequency anomalies
- Amount outlier detection
- Behavioral pattern analysis

### 3. Trigger Analysis
Validates parametric insurance triggers:
- Heavy rainfall (>50mm/2hr)
- High pollution (AQI >200/4hr)
- Natural disasters
- Traffic blockages

### 4. Geographic Analysis
- Zone-based risk assessment
- Flood-prone area identification
- High-traffic area detection
- Distance-based location verification

## API Endpoints

### Health Check
```bash
GET /health

Response: 200 OK
{
  "status": "healthy",
  "service": "Risk Prediction API",
  "version": "1.0.0"
}
```

### Root/Documentation
```bash
GET /

Response:
{
  "message": "Risk Prediction API v1.0.0",
  "endpoints": {
    "docs": "/docs",
    "health": "/health",
    "predict_risk": "/api/predict-risk",
    "predict_fraud": "/api/predict-fraud"
  }
}
```

### Predict Risk
```bash
POST /api/predict-risk
Content-Type: application/json

Request Body:
{
  "user_id": "64f7a1b2c3d4e5f6g7h8i9j0",
  "policy_id": "64f7a1b2c3d4e5f6g7h8i9j1",
  "weather_data": {
    "rainfall": 65,
    "temperature": 28,
    "humidity": 75,
    "aqi": 180,
    "wind_speed": 15
  },
  "location_data": {
    "latitude": 19.0760,
    "longitude": 72.8777,
    "address": "Bandra, Mumbai",
    "timezone": "Asia/Kolkata"
  },
  "activity_data": {
    "deliveries_completed": 8,
    "working_hours": 6,
    "avg_speed": 35,
    "stops": 12
  },
  "historical_claims": 2
}

Response: 200 OK
{
  "risk_score": 62.5,
  "risk_level": "HIGH",
  "environmental_risk": 75.0,
  "location_risk": 35.0,
  "activity_risk": 28.0,
  "factors": {
    "rainfall": 65,
    "aqi": 180,
    "temperature": 28,
    "working_hours": 6
  },
  "confidence": 0.85,
  "recommendation": "Close monitoring recommended"
}
```

### Predict Fraud
```bash
POST /api/predict-fraud
Content-Type: application/json

Request Body:
{
  "claim_data": {
    "claim_amount": 5000,
    "claim_type": "HEAVY_RAIN",
    "location_distance": 8,
    "timestamp": "2024-04-02T15:30:00Z"
  },
  "user_history": {
    "claims_this_week": 2,
    "average_claim_amount": 1500,
    "typical_claim_type": "HEAVY_RAIN",
    "historical_claims": 3
  }
}

Response: 200 OK
{
  "fraud_score": 45.5,
  "is_suspicious": false,
  "recommendation": "Approved"
}
```

### Trigger Analysis
```bash
POST /api/trigger-analysis
Content-Type: application/json

Request Body:
{
  "weather_data": {
    "rainfall": 65,
    "aqi": 220,
    "temperature": 28,
    "wind_speed": 10,
    "disaster_alert": false
  },
  "location_data": {
    "latitude": 19.0760,
    "longitude": 72.8777
  },
  "activity_data": {
    "route_blocked": false,
    "blocked_radius_km": 0
  }
}

Response: 200 OK
{
  "rainfall_trigger": true,
  "pollution_trigger": true,
  "disaster_trigger": false,
  "traffic_trigger": false,
  "any_trigger_met": true
}
```

## Risk Scoring Model

### Environmental Risk Calculation
```
Base Risk = 0

If Rainfall > 50mm:
  Risk += min((rainfall - 50) / 50 * 40, 40)

If AQI > 200:
  Risk += min((aqi - 200) / 100 * 35, 35)

If Temperature > 45°C or < 5°C:
  Risk += 15
Else if Temperature > 40°C or < 10°C:
  Risk += 10

If Wind Speed > 50 kmph:
  Risk += 10

Environmental Risk = min(Base Risk, 100)
```

### Location Risk Assessment
```
HIGH RISK ZONES (risk_score = 45-55):
  - Flood Prone: Mumbai coastal areas
  - High Pollution: Delhi metro area
  - Disaster Risk: Chennai coastal regions

MEDIUM RISK ZONES (risk_score = 25-35):
  - High Traffic: Bangalore tech corridors
  
LOW RISK ZONES (risk_score = 10-20):
  - Normal urban areas
```

### Activity Risk Calculation
```
Base Risk = 0

If Historical Claims >= 5:
  Risk += 40
Else if Historical Claims >= 3:
  Risk += 25
Else if Historical Claims >= 1:
  Risk += 10

If Working Hours > 12:
  Risk += 20
Else if Working Hours > 8:
  Risk += 10

If Avg Speed > 60 kmph:
  Risk += 15
Else if Avg Speed > 40 kmph:
  Risk += 10

If Deliveries > 30:
  Risk += 15
Else if Deliveries > 15:
  Risk += 10

Activity Risk = min(Base Risk, 100)
```

### Aggregate Risk Score
```
Total Risk = (
  Environmental Risk × 0.35 +
  Location Risk × 0.25 +
  Activity Risk × 0.25 +
  Historical Risk × 0.15
)

Risk Level Classification:
  0-24 = LOW
  25-49 = MEDIUM
  50-74 = HIGH
  75-100 = CRITICAL
```

### Fraud Detection Scoring
```
Base Fraud Score = 0

If Location Distance > 10km:
  Fraud Score += 30

If Claims This Week >= 3:
  Fraud Score += 25

If Claim Amount > 3× Average:
  Fraud Score += 20

If Claim Type ≠ Typical Type:
  Fraud Score += 15

Decision Logic:
  > 60: Manual Review Required
  <= 60: Auto-Approved
```

## Data Models

### WeatherData
```json
{
  "rainfall": 0,        // mm
  "temperature": 25,    // Celsius
  "humidity": 70,       // percentage
  "aqi": 150,          // Air Quality Index
  "wind_speed": 0      // km/hour
}
```

### LocationData
```json
{
  "latitude": 19.0760,
  "longitude": 72.8777,
  "address": "Bandra, Mumbai",
  "timezone": "Asia/Kolkata"
}
```

### ActivityData
```json
{
  "deliveries_completed": 0,
  "working_hours": 0,
  "avg_speed": 0,      // km/hour
  "stops": 0
}
```

### RiskPredictionResponse
```json
{
  "risk_score": 62.5,       // 0-100
  "risk_level": "HIGH",     // LOW, MEDIUM, HIGH, CRITICAL
  "environmental_risk": 75,
  "location_risk": 35,
  "activity_risk": 28,
  "factors": {...},
  "confidence": 0.85,       // 0-1
  "recommendation": "..."
}
```

## Setup & Installation

### Prerequisites
- Python 3.8+
- pip or conda

### Installation
```bash
# Navigate to risk_prediction directory
cd Backend/risk_prediction

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run server
uvicorn api.app:app --host 0.0.0.0 --port 8000 --reload
```

### Configuration
Create `.env` file:
```
LOG_LEVEL=INFO
ENVIRONMENT=development
DATABASE_URL=mongodb://localhost:27017/parametric-insurance
```

## Model Training

### Feature List (features.json)
```json
[
  "rainfall",
  "temperature",
  "humidity",
  "aqi",
  "wind_speed",
  "latitude",
  "longitude",
  "working_hours",
  "deliveries_completed",
  "avg_speed",
  "historical_claims"
]
```

### Deployable Models
- `risk_model.pkl` - sklearn RandomForest for risk scoring
- `scaler.pkl` - StandardScaler for feature normalization
- `label_encoder.pkl` - LabelEncoder for categorical outputs

## Integration with Insurance API

The Risk Prediction API is called by the Insurance Module during:

### 1. Policy Creation
```
POST /insurance/policy/create
  ├─ Call: POST /api/predict-risk
  └─ Use risk_score to calculate premium
```

### 2. Claim Submission
```
POST /insurance/claim/submit
  ├─ Call: POST /api/predict-risk (contextual)
  ├─ Call: POST /api/predict-fraud
  ├─ Call: POST /api/trigger-analysis
  └─ Make approval decision
```

### 3. Continuous Monitoring
```
Hourly Job:
  ├─ Fetch active policies
  ├─ Get latest weather/activity data
  ├─ Call: POST /api/predict-risk
  └─ Alert if risk_score increases 20+ points
```

## Testing

### Unit Tests
```bash
pytest tests/ -v
```

### API Testing
```bash
# Using curl
curl -X POST "http://localhost:8000/api/predict-risk" \
  -H "Content-Type: application/json" \
  -d @test_data.json

# Using Python requests
python -m pytest tests/test_api.py
```

### Load Testing
```bash
# Using locust
locust -f tests/locustfile.py --host=http://localhost:8000
```

## Performance Metrics

| Endpoint | Avg Response Time | Success Rate |
|----------|-------------------|--------------|
| /health | <10ms | 99.9% |
| /api/predict-risk | 50-100ms | 99.5% |
| /api/predict-fraud | 30-50ms | 99.5% |
| /api/trigger-analysis | 20-40ms | 99.8% |

## Monitoring & Logging

Logs directory: `logs/`

Log levels available:
- DEBUG: Detailed operation information
- INFO: General flow information
- WARNING: Warning messages for potential issues
- ERROR: Error conditions

Example log entry:
```
2024-04-02 15:30:45 - risk_prediction - INFO - Predicting risk for user 64f7a1b2c3d4e5f6g7h8i9j0
2024-04-02 15:30:45 - risk_prediction - DEBUG - Environmental risk calculated: 75.0
2024-04-02 15:30:46 - risk_prediction - INFO - Risk prediction completed - score: 62.5
```

## Error Handling

### Error Codes
| Code | Message | Action |
|------|---------|--------|
| 200 | Success | Proceed |
| 400 | Bad Request | Check input format |
| 422 | Validation Error | Correct invalid fields |
| 500 | Server Error | Retry or escalate |
| 503 | Service Unavailable | Fallback to manual review |

### Fallback Strategy
If the API fails:
1. Use rule-based calculation (manual formulas)
2. Return conservative risk estimate (MEDIUM)
3. Flag for manual review
4. Log error for investigation

## Future Enhancements

1. **Real-time Data Integration**
   - Weather API integration (IMD, OpenWeather)
   - Live traffic data (Google Maps, HERE Maps)
   - Satellite imagery for disaster detection

2. **ML Model Improvements**
   - Deep learning models (LSTM for time series)
   - Ensemble methods (XGBoost, LightGBM)
   - Transfer learning from public datasets

3. **Advanced Analytics**
   - Prediction confidence intervals
   - Feature importance analysis
   - Model explainability (SHAP values)

4. **Scalability**
   - Model serving optimization (ONNX)
   - Distributed inference
   - Caching layer for frequent queries

5. **Integration**
   - Webhook notifications for high-risk alerts
   - Real-time streaming predictions
   - Batch processing for bulk analysis

---

**Version**: 1.0.0  
**Last Updated**: April 2024  
**API Base URL**: http://localhost:8000  
**Documentation**: http://localhost:8000/docs (FastAPI Swagger UI)
