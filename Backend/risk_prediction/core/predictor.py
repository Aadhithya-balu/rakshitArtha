import joblib
import pandas as pd
import json
import os
import logging
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.dirname(__file__))

# Load or create mock models
try:
    model = joblib.load(f"{BASE_DIR}/model/risk_model.pkl")
except:
    # Fallback to mock model if file doesn't exist
    model = None

try:
    scaler = joblib.load(f"{BASE_DIR}/model/scaler.pkl")
except:
    scaler = None

try:
    encoder = joblib.load(f"{BASE_DIR}/model/label_encoder.pkl")
except:
    encoder = None

try:
    with open(f"{BASE_DIR}/model/features.json") as f:
        FEATURES = json.load(f)
except:
    FEATURES = []

class RiskPredictor:
    """ML-based risk prediction for parametric insurance"""
    
    def __init__(self):
        self.model = model
        self.scaler = scaler
        self.encoder = encoder
        self.features = FEATURES
    
    def predict_risk(self, data: dict):
        """Predict risk level using ML model"""
        try:
            if not self.model:
                return self._calculate_risk_manually(data)
            
            df = pd.DataFrame([data])
            if self.features:
                df = df[self.features]
            
            if self.scaler:
                scaled = self.scaler.transform(df)
            else:
                scaled = df.values
            
            pred = self.model.predict(scaled)
            
            if self.encoder:
                return self.encoder.inverse_transform(pred)[0]
            return str(pred[0])
        except Exception as e:
            logger.error(f"Model prediction error: {str(e)}")
            return self._calculate_risk_manually(data)

    def predict_risk_score(self, data: dict):
        """Return a numeric risk score with factor breakdown (GRADUATED SYSTEM)."""
        rainfall = data.get('rainfall', data.get('rainfall_mm_24h', 0) or 0)
        aqi = data.get('aqi', 150) or 150
        temperature = data.get('temperature', data.get('temperature_c', 25) or 25)
        wind_speed = data.get('wind_speed', data.get('wind_speed_kmph', 0) or 0)
        latitude = data.get('latitude', 0) or 0
        longitude = data.get('longitude', 0) or 0
        working_hours = data.get('working_hours', 0) or 0
        deliveries = data.get('deliveries_completed', 0) or 0
        avg_speed = data.get('avg_speed', 0) or 0
        historical_claims = data.get('historical_claims', 0) or 0
        worker_type = data.get('worker_type', 'FIELD_WORKER')
        city = data.get('city', 'DEFAULT').upper()

        # NEW: Get graduated trigger percentages instead of binary
        rainfall_trigger_percent = self._get_graduated_rainfall_trigger(rainfall)
        aqi_trigger_percent = self._get_graduated_aqi_trigger(aqi)
        
        # Apply worker type sensitivity
        worker_sensitivity = self._get_worker_type_sensitivity(worker_type)
        
        # Apply seasonal adjustment
        seasonal_adjustment = self._get_seasonal_adjustment()

        environmental_risk = self.calculate_environmental_risk(
            rainfall=rainfall,
            aqi=aqi,
            temperature=temperature,
            wind_speed=wind_speed
        )
        location_risk = self.calculate_location_risk(latitude, longitude)
        activity_risk = self.calculate_activity_risk(
            working_hours=working_hours,
            deliveries=deliveries,
            avg_speed=avg_speed,
            historical_claims=historical_claims
        )
        aggregate_score = self.aggregate_risk(
            environmental_risk=environmental_risk,
            location_risk=location_risk,
            activity_risk=activity_risk,
            historical_claims=historical_claims
        )

        # Apply worker type and seasonal adjustments
        adjusted_score = aggregate_score * worker_sensitivity * seasonal_adjustment

        severe_boost = 0
        if rainfall >= 50:
            severe_boost += 18
        if rainfall >= 80:
            severe_boost += 10
        if aqi >= 200:
            severe_boost += 12
        if aqi >= 300:
            severe_boost += 8
        if temperature >= 45 or temperature <= 5:
            severe_boost += 12
        if wind_speed >= 50:
            severe_boost += 8

        risk_score = round(min(100, adjusted_score + severe_boost), 2)

        return {
            "risk_score": risk_score,
            "risk_level": self.score_to_level(risk_score),
            "environmental_risk": round(environmental_risk, 2),
            "location_risk": round(location_risk, 2),
            "activity_risk": round(activity_risk, 2),
            "confidence": self.estimate_confidence(data),
            "recommendation": self.build_recommendation(risk_score),
            "graduated_triggers": {
                "rainfall_trigger_percent": rainfall_trigger_percent,
                "aqi_trigger_percent": aqi_trigger_percent,
                "worker_sensitivity_multiplier": round(worker_sensitivity, 2),
                "seasonal_multiplier": round(seasonal_adjustment, 2)
            },
            "factors": {
                "rainfall": rainfall,
                "aqi": aqi,
                "temperature": temperature,
                "wind_speed": wind_speed,
                "working_hours": working_hours,
                "deliveries_completed": deliveries,
                "historical_claims": historical_claims,
                "worker_type": worker_type,
                "city": city
            }
        }

    def _get_graduated_rainfall_trigger(self, rainfall):
        """Get graduated rainfall trigger percentage (not binary)"""
        if rainfall < 25:
            return 0
        elif rainfall < 40:
            return 25
        elif rainfall < 60:
            return 60
        elif rainfall < 100:
            return 90
        else:
            return 100

    def _get_graduated_aqi_trigger(self, aqi):
        """Get graduated AQI trigger percentage"""
        if aqi < 100:
            return 0
        elif aqi < 150:
            return 15
        elif aqi < 200:
            return 45
        elif aqi < 300:
            return 75
        else:
            return 100

    def _get_worker_type_sensitivity(self, worker_type):
        """Get weather sensitivity multiplier by worker type"""
        sensitivities = {
            'RIKSHAW_DRIVER': 1.2,
            'DELIVERY_BIKE': 1.15,
            'DELIVERY_FOOT': 1.0,
            'DELIVERY_CAR': 0.3,
            'OFFICE_COURIER': 0.4,
            'SECURITY_GUARD': 0.8,
            'FIELD_WORKER': 1.3,
            'VENDOR': 0.9
        }
        return sensitivities.get(worker_type, 1.0)

    def _get_seasonal_adjustment(self):
        """Get seasonal adjustment factor"""
        import datetime
        month = datetime.datetime.now().month
        
        if month in [6, 7, 8, 9]:  # Monsoon
            return 1.2  # 20% more impact during monsoon
        elif month in [12, 1, 2]:  # Winter (high pollution)
            return 1.1
        else:  # Summer
            return 1.0

    def score_to_level(self, risk_score: float) -> str:
        if risk_score >= 75:
            return "CRITICAL"
        if risk_score >= 50:
            return "HIGH"
        if risk_score >= 25:
            return "MEDIUM"
        return "LOW"

    def estimate_confidence(self, data: dict) -> float:
        present_fields = 0
        expected_fields = [
            "rainfall", "aqi", "temperature", "wind_speed",
            "latitude", "longitude", "working_hours", "deliveries_completed"
        ]
        for field in expected_fields:
            if data.get(field) is not None:
                present_fields += 1
        return round(min(0.55 + (present_fields / len(expected_fields)) * 0.4, 0.98), 2)

    def build_recommendation(self, risk_score: float) -> str:
        if risk_score >= 75:
            return "Immediate monitoring and parametric trigger readiness required"
        if risk_score >= 50:
            return "High disruption probability. Consider increased weekly protection"
        if risk_score >= 25:
            return "Moderate watchlist. Keep monitoring forecast shifts"
        return "Stable conditions. Standard weekly protection is sufficient"

    def detect_disruptions(self, weather_data: dict, activity_data: Optional[dict] = None):
        activity_data = activity_data or {}
        rainfall = weather_data.get('rainfall', 0) or 0
        aqi = weather_data.get('aqi', 0) or 0
        temperature = weather_data.get('temperature', 25) or 25
        wind_speed = weather_data.get('wind_speed', 0) or 0
        blocked_routes_pct = activity_data.get('blocked_routes_pct', 0) or 0

        disruptions = []
        if rainfall >= 80:
            disruptions.append("Extreme Monsoon/Cyclonic Rain")
        elif rainfall >= 50:
            disruptions.append("Heavy Rainfall (>50mm)")
        if aqi >= 250:
            disruptions.append("High Pollution")
        if temperature >= 45:
            disruptions.append("Extreme Heat")
        if wind_speed >= 50:
            disruptions.append("Strong Wind Alert")
        if blocked_routes_pct >= 40:
            disruptions.append("Traffic Blocked")

        return disruptions
    
    def calculate_environmental_risk(self, rainfall=0, aqi=150, temperature=25, wind_speed=0):
        """Calculate environmental risk score (0-100)"""
        risk = 0
        
        # Rainfall risk
        if rainfall > 50:
            risk += min((rainfall - 50) / 50 * 40, 40)
        
        # AQI risk
        if aqi > 200:
            risk += min((aqi - 200) / 100 * 35, 35)
        
        # Temperature extremes
        if temperature > 45 or temperature < 5:
            risk += 15
        elif temperature > 40 or temperature < 10:
            risk += 10
        
        # Wind speed
        if wind_speed > 50:
            risk += 10
        
        return min(risk, 100)
    
    def calculate_location_risk(self, latitude: float, longitude: float):
        """Calculate location-based risk (0-100)"""
        # Mock implementation - in production, use geocoding/zone mapping
        # High-risk zones: high-traffic areas, flood-prone regions, etc.
        
        if latitude < 0:
            return min(abs(latitude % 10) * 10, 100)
        return min(latitude % 10 * 5, 100)
    
    def calculate_activity_risk(self, working_hours=0, deliveries=0, avg_speed=0, historical_claims=0):
        """Calculate activity-based risk (0-100)"""
        risk = 0
        
        # Historical claims risk
        if historical_claims >= 5:
            risk += 40
        elif historical_claims >= 3:
            risk += 25
        elif historical_claims >= 1:
            risk += 10
        
        # Working hours risk (fatigue)
        if working_hours > 12:
            risk += 20
        elif working_hours > 8:
            risk += 10
        
        # Delivery velocity risk
        if avg_speed > 60:
            risk += 15
        elif avg_speed > 40:
            risk += 10
        
        # Delivery frequency risk
        if deliveries > 30:
            risk += 15
        elif deliveries > 15:
            risk += 10
        
        return min(risk, 100)
    
    def aggregate_risk(self, environmental_risk=0, location_risk=0, activity_risk=0, historical_claims=0):
        """Aggregate multiple risk factors"""
        weights = {
            'environmental': 0.35,
            'location': 0.25,
            'activity': 0.25,
            'historical': 0.15
        }
        
        historical_risk = min(historical_claims * 10, 50)
        
        total_risk = (
            environmental_risk * weights['environmental'] +
            location_risk * weights['location'] +
            activity_risk * weights['activity'] +
            historical_risk * weights['historical']
        )
        
        return min(total_risk, 100)
    
    def detect_fraud(self, claim_data: dict, user_history: dict):
        """Detect fraudulent claims"""
        fraud_score = 0
        
        # Location mismatch check
        if 'location_distance' in claim_data:
            if claim_data['location_distance'] > 10:
                fraud_score += 30
        
        # Frequency check
        if 'claims_this_week' in user_history:
            if user_history['claims_this_week'] >= 3:
                fraud_score += 25
        
        # Amount anomaly check
        if 'average_claim_amount' in user_history:
            avg = user_history['average_claim_amount']
            current = claim_data.get('claim_amount', 0)
            if avg > 0 and current / avg > 3:
                fraud_score += 20
        
        # Pattern check
        if 'typical_claim_type' in user_history:
            if user_history['typical_claim_type'] != claim_data.get('claim_type'):
                fraud_score += 15
        
        return min(fraud_score, 100)
    
    def analyze_triggers(self, weather_data: dict, location_data: dict, activity_data: dict):
        """Analyze if parametric triggers are met"""
        triggers = {
            'rainfall': False,
            'aqi': False,
            'disaster': False,
            'traffic': False
        }
        
        # Check rainfall
        if weather_data.get('rainfall', 0) > 50:
            triggers['rainfall'] = True
        
        # Check AQI
        if weather_data.get('aqi', 0) > 200:
            triggers['aqi'] = True
        
        # Disaster flag
        if weather_data.get('disaster_alert', False):
            triggers['disaster'] = True
        
        # Traffic blockage
        if activity_data.get('route_blocked', False):
            triggers['traffic'] = True
        
        return triggers
    
    def _calculate_risk_manually(self, data: dict):
        """Fallback manual risk calculation"""
        rainfall = data.get('rainfall', 0)
        aqi = data.get('aqi', 150)
        
        risk = "LOW"
        
        if rainfall > 100 or aqi > 300:
            risk = "CRITICAL"
        elif rainfall > 50 or aqi > 200:
            risk = "HIGH"
        elif rainfall > 25 or aqi > 150:
            risk = "MEDIUM"
        
        return risk
