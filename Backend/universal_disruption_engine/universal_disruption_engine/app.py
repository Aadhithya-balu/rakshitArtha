from pathlib import Path
from typing import Optional

from fastapi import FastAPI
from pydantic import BaseModel
import joblib

app = FastAPI(title="Global Universal Deliver-Incentive API")

BASE_DIR = Path(__file__).resolve().parent

# Load global models from the module directory so the API works from any cwd.
delivery_model = joblib.load(BASE_DIR / "delivery_model.pkl")
kmeans_model = joblib.load(BASE_DIR / "kmeans_model.pkl")
scaler = joblib.load(BASE_DIR / "scaler.pkl")
payout_model = joblib.load(BASE_DIR / "payout_model.pkl")
feature_names = joblib.load(BASE_DIR / "feature_names.pkl")


class WeatherData(BaseModel):
    rainfall: float = 0.0
    aqi: int = 100
    humidity: int = 60
    temperature: float = 25.0
    wind_speed: float = 0.0


class ActivityData(BaseModel):
    deliveries_completed: int = 0
    working_hours: float = 0.0
    avg_speed: float = 0.0
    stops: int = 0


class LocationData(BaseModel):
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    address: Optional[str] = None


class PredictionRequest(BaseModel):
    user_id: Optional[str] = None
    policy_id: Optional[str] = None
    weather_data: WeatherData = WeatherData()
    location_data: LocationData = LocationData()
    activity_data: ActivityData = ActivityData()
    historical_claims: int = 0
    snow_ice: bool = False
    thunderstorm: bool = False
    flooding: bool = False
    curfew: bool = False
    market_closure: bool = False
    platform_downtime: bool = False

@app.get("/")
def home():
    return {
        "message": "Welcome to the Global Universal Delivery & Payout API",
        "description": "Retrained for global universality including extreme cold, desert heat, and monsoon conditions.",
        "usage": "Use /docs to see parameters."
    }

def run_prediction(
    rainfall: float = 0.0,
    aqi: int = 100,
    traffic: float = 0.5,
    humidity: int = 60,
    temperature: float = 25.0,
    snow_ice: bool = False,
    thunderstorm: bool = False,
    flooding: bool = False,
    curfew: bool = False,
    market_closure: bool = False,
    platform_downtime: bool = False,
    context: Optional[dict] = None
):
    # 1. Identify Disruption Types (Global Triggers)
    active_disruptions = []
    
    # Auto-detect ice disruption if freezing
    is_freezing = temperature < 0
    if is_freezing and rainfall > 0:
        active_disruptions.append("Frost/Black Ice Hazard")
    
    if snow_ice: active_disruptions.append("Snow/Ice Obstruction")
    if rainfall > 80: active_disruptions.append("Extreme Monsoon/Cyclonic Rain")
    elif rainfall > 50: active_disruptions.append("Heavy Rainfall (>50mm)")
    
    if thunderstorm: active_disruptions.append("Thunderstorm/Lightning Alert")
    if temperature > 45: active_disruptions.append("Extreme Heat/Heatwave (>45°C)")
    if flooding: active_disruptions.append("Flooding/Waterlogging Alert")
    if aqi > 400: active_disruptions.append("Severe Pollution (Hazardous AQI)")
    if curfew: active_disruptions.append("Curfew/Emergency Lockdown")
    if market_closure: active_disruptions.append("Supply Network Closure")
    if platform_downtime: active_disruptions.append("Platform Server Outage")

    # 2. Prepare features for Global Model
    input_features = [
        rainfall, aqi, traffic, temperature, humidity,
        int(snow_ice), int(thunderstorm), int(flooding), int(temperature > 45),
        int(aqi > 400), int(curfew), int(market_closure), int(platform_downtime)
    ]
    
    # 3. Predict Universal Delivery Time
    delivery_time = delivery_model.predict([input_features])[0]
    
    # 4. Predict Universal Dynamic Payout
    suggested_payout = payout_model.predict([input_features])[0]
    
    # Base condition for zero payout (no disruptions, healthy stats)
    if not active_disruptions and traffic < 0.6 and aqi < 150:
        suggested_payout = 0.0
    
    # 5. Universal Risk Tier Segmentation
    # Features: ["Rainfall", "AQI", "Traffic", "Delivery_Time", "Orders"]
    estimated_orders = max(5, 600 - (traffic * 250) - (rainfall * 1.5))
    cluster_input = [rainfall, aqi, traffic, delivery_time, estimated_orders]
    scaled_cluster_input = scaler.transform([cluster_input])
    risk_cluster = kmeans_model.predict(scaled_cluster_input)[0]
    
    risk_map = {0: "Tier 1: Stable", 1: "Tier 2: Impacted", 2: "Tier 3: Critical"}
    risk_level_map = {
        "Tier 1: Stable": "LOW",
        "Tier 2: Impacted": "MEDIUM",
        "Tier 3: Critical": "HIGH",
    }
    risk_label = risk_map[risk_cluster]
    risk_score = max(
        0,
        min(
            100,
            round(
                (rainfall * 0.35) +
                (aqi * 0.08) +
                (traffic * 40) +
                (12 if thunderstorm else 0) +
                (15 if flooding else 0) +
                (10 if curfew else 0) +
                (8 if market_closure else 0) +
                (8 if platform_downtime else 0)
            )
        )
    )

    return {
        "prediction": {
            "delivery_time_mins": round(float(delivery_time), 2),
            "suggested_payout_inr": round(float(suggested_payout), 2),
            "global_risk_tier": risk_label
        },
        "risk_level": risk_level_map[risk_label],
        "risk_score": risk_score,
        "disruptions_detected": active_disruptions,
        "input_summary": {
            "climate": {"temp": f"{temperature}C", "rainfall": f"{rainfall}mm", "aqi": aqi},
            "signals": {"snow": snow_ice, "thunderstorm": thunderstorm, "flooding": flooding}
        },
        "context": context or {}
    }


@app.get("/predict")
def predict(
    rainfall: float = 0.0,
    aqi: int = 100,
    traffic: float = 0.5,
    humidity: int = 60,
    temperature: float = 25.0,
    snow_ice: bool = False,
    thunderstorm: bool = False,
    flooding: bool = False,
    curfew: bool = False,
    market_closure: bool = False,
    platform_downtime: bool = False
):
    return run_prediction(
        rainfall=rainfall,
        aqi=aqi,
        traffic=traffic,
        humidity=humidity,
        temperature=temperature,
        snow_ice=snow_ice,
        thunderstorm=thunderstorm,
        flooding=flooding,
        curfew=curfew,
        market_closure=market_closure,
        platform_downtime=platform_downtime
    )


@app.post("/api/predict")
def predict_api(payload: PredictionRequest):
    traffic = min(1.0, max(0.0, payload.activity_data.stops / 5 if payload.activity_data.stops else 0.3))

    return run_prediction(
        rainfall=payload.weather_data.rainfall,
        aqi=payload.weather_data.aqi,
        traffic=traffic,
        humidity=payload.weather_data.humidity,
        temperature=payload.weather_data.temperature,
        snow_ice=payload.snow_ice,
        thunderstorm=payload.thunderstorm,
        flooding=payload.flooding,
        curfew=payload.curfew,
        market_closure=payload.market_closure,
        platform_downtime=payload.platform_downtime,
        context={
            "user_id": payload.user_id,
            "policy_id": payload.policy_id,
            "historical_claims": payload.historical_claims,
            "location": payload.location_data.model_dump()
        }
    )
