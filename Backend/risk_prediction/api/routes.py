from datetime import datetime, timezone
from typing import Dict, List, Optional
from zoneinfo import ZoneInfo

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from core.geo_risk import GeoRiskAnalyzer
from core.predictor import RiskPredictor

router = APIRouter(prefix="/api", tags=["risk"])

predictor = RiskPredictor()
geo_analyzer = GeoRiskAnalyzer()


class WeatherData(BaseModel):
    rainfall: Optional[float] = 0
    temperature: Optional[float] = 25
    humidity: Optional[float] = 70
    aqi: Optional[float] = 150
    wind_speed: Optional[float] = 0


class LocationData(BaseModel):
    latitude: float
    longitude: float
    address: Optional[str] = None
    timezone: Optional[str] = "Asia/Kolkata"


class ActivityData(BaseModel):
    deliveries_completed: Optional[int] = 0
    working_hours: Optional[float] = 0
    avg_speed: Optional[float] = 0
    stops: Optional[int] = 0
    blocked_routes_pct: Optional[float] = 0
    avg_route_delay_min: Optional[float] = 0


class RiskPredictionRequest(BaseModel):
    user_id: str
    policy_id: Optional[str] = None
    weather_data: WeatherData
    location_data: LocationData
    activity_data: Optional[ActivityData] = None
    historical_claims: Optional[int] = 0


class FutureForecastSlot(BaseModel):
    timestamp: str
    rainfall: Optional[float] = 0
    temperature: Optional[float] = 25
    humidity: Optional[float] = 70
    aqi: Optional[float] = 150
    wind_speed: Optional[float] = 0
    blocked_routes_pct: Optional[float] = 0
    avg_route_delay_min: Optional[float] = 0


class FutureRiskPredictionRequest(BaseModel):
    user_id: str
    policy_id: Optional[str] = None
    location_data: LocationData
    activity_profile: Optional[ActivityData] = None
    historical_claims: Optional[int] = 0
    horizon_hours: int = Field(default=24, ge=3, le=72)
    interval_hours: int = Field(default=3, ge=1, le=12)
    weather_forecast: Optional[List[FutureForecastSlot]] = None
    universal_engine_url: Optional[str] = "http://127.0.0.1:8000"


def _safe_timezone(tz_name: str) -> ZoneInfo:
    try:
        return ZoneInfo(tz_name)
    except Exception:
        return ZoneInfo("Asia/Kolkata")


def _risk_payload(
    weather_data: Dict,
    location_data: LocationData,
    activity_data: Optional[ActivityData],
    historical_claims: int
) -> Dict:
    activity = activity_data.model_dump() if activity_data else {}
    return {
        "rainfall": weather_data.get("rainfall", 0) or 0,
        "aqi": weather_data.get("aqi", 150) or 150,
        "temperature": weather_data.get("temperature", 25) or 25,
        "wind_speed": weather_data.get("wind_speed", 0) or 0,
        "latitude": location_data.latitude,
        "longitude": location_data.longitude,
        "working_hours": activity.get("working_hours", 0) or 0,
        "deliveries_completed": activity.get("deliveries_completed", 0) or 0,
        "avg_speed": activity.get("avg_speed", 0) or 0,
        "historical_claims": historical_claims or 0,
    }


async def _fetch_openmeteo_forecast(location_data: LocationData, horizon_hours: int) -> List[Dict]:
    hourly_count = min(max(horizon_hours, 3), 72)
    async with httpx.AsyncClient(timeout=20.0) as client:
        weather_response = await client.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": location_data.latitude,
                "longitude": location_data.longitude,
                "hourly": "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m",
                "forecast_days": 3,
                "timezone": location_data.timezone or "Asia/Kolkata"
            }
        )
        weather_response.raise_for_status()

        air_response = await client.get(
            "https://air-quality-api.open-meteo.com/v1/air-quality",
            params={
                "latitude": location_data.latitude,
                "longitude": location_data.longitude,
                "hourly": "us_aqi",
                "forecast_days": 3,
                "timezone": location_data.timezone or "Asia/Kolkata"
            }
        )
        air_response.raise_for_status()

    weather_hourly = weather_response.json().get("hourly", {})
    air_hourly = air_response.json().get("hourly", {})
    times = weather_hourly.get("time", [])[:hourly_count]

    slots = []
    for index, timestamp in enumerate(times):
        slots.append({
            "timestamp": timestamp,
            "rainfall": (weather_hourly.get("precipitation", [0]) or [0])[index],
            "temperature": (weather_hourly.get("temperature_2m", [25]) or [25])[index],
            "humidity": (weather_hourly.get("relative_humidity_2m", [70]) or [70])[index],
            "aqi": (air_hourly.get("us_aqi", [150]) or [150])[index],
            "wind_speed": (weather_hourly.get("wind_speed_10m", [0]) or [0])[index],
        })
    return slots


async def _call_universal_engine(
    universal_engine_url: Optional[str],
    location_data: LocationData,
    weather_data: Dict,
    activity_data: Optional[ActivityData],
    historical_claims: int
) -> Optional[Dict]:
    if not universal_engine_url:
        return None

    activity = activity_data.model_dump() if activity_data else {}
    payload = {
        "user_id": "forecast-user",
        "weather_data": {
            "rainfall": weather_data.get("rainfall", 0) or 0,
            "aqi": int(weather_data.get("aqi", 150) or 150),
            "humidity": int(weather_data.get("humidity", 70) or 70),
            "temperature": weather_data.get("temperature", 25) or 25,
            "wind_speed": weather_data.get("wind_speed", 0) or 0
        },
        "location_data": {
            "latitude": location_data.latitude,
            "longitude": location_data.longitude,
            "address": location_data.address
        },
        "activity_data": {
            "deliveries_completed": activity.get("deliveries_completed", 0) or 0,
            "working_hours": activity.get("working_hours", 0) or 0,
            "avg_speed": activity.get("avg_speed", 0) or 0,
            "stops": activity.get("stops", 0) or 0
        },
        "historical_claims": historical_claims or 0
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(f"{universal_engine_url}/api/predict", json=payload)
            response.raise_for_status()
            return response.json()
    except Exception:
        return None


@router.get("/")
def home():
    return {"message": "Risk Prediction API running"}


@router.post("/predict")
async def predict_compat(data: RiskPredictionRequest):
    payload = _risk_payload(
        data.weather_data.model_dump(),
        data.location_data,
        data.activity_data,
        data.historical_claims or 0
    )
    result = predictor.predict_risk_score(payload)
    return {
        "risk_level": result["risk_level"],
        "risk_score": result["risk_score"],
        "disruptions_detected": predictor.detect_disruptions(
            data.weather_data.model_dump(),
            data.activity_data.model_dump() if data.activity_data else {}
        )
    }


@router.post("/predict-risk")
async def predict_risk(data: RiskPredictionRequest):
    payload = _risk_payload(
        data.weather_data.model_dump(),
        data.location_data,
        data.activity_data,
        data.historical_claims or 0
    )
    result = predictor.predict_risk_score(payload)
    return result


@router.post("/trigger-analysis")
async def trigger_analysis(data: RiskPredictionRequest):
    activity = data.activity_data.model_dump() if data.activity_data else {}
    triggers = predictor.analyze_triggers(
        data.weather_data.model_dump(),
        data.location_data.model_dump(),
        {
            "route_blocked": (activity.get("blocked_routes_pct", 0) or 0) >= 40,
            "blocked_radius_km": activity.get("stops", 0) or 0
        }
    )
    return {
        "rainfall_trigger": triggers["rainfall"],
        "pollution_trigger": triggers["aqi"],
        "disaster_trigger": triggers["disaster"],
        "traffic_trigger": triggers["traffic"],
        "any_trigger_met": any(triggers.values())
    }


@router.post("/predict-future-risk")
async def predict_future_risk(data: FutureRiskPredictionRequest):
    tz = _safe_timezone(data.location_data.timezone or "Asia/Kolkata")
    activity_profile = data.activity_profile or ActivityData()

    if data.weather_forecast:
        forecast_slots = [slot.model_dump() for slot in data.weather_forecast]
    else:
        try:
            forecast_slots = await _fetch_openmeteo_forecast(data.location_data, data.horizon_hours)
        except Exception as exc:
            raise HTTPException(status_code=503, detail=f"Unable to fetch future forecast: {exc}")

    filtered_slots = []
    for index, slot in enumerate(forecast_slots):
        if index % data.interval_hours == 0:
            filtered_slots.append(slot)

    horizon_predictions = []
    for slot in filtered_slots:
        payload = _risk_payload(slot, data.location_data, activity_profile, data.historical_claims or 0)
        risk_result = predictor.predict_risk_score(payload)
        disruptions = predictor.detect_disruptions(slot, activity_profile.model_dump())
        universal_result = await _call_universal_engine(
            data.universal_engine_url,
            data.location_data,
            slot,
            activity_profile,
            data.historical_claims or 0
        )

        slot_time = datetime.fromisoformat(slot["timestamp"]).replace(tzinfo=tz)
        horizon_predictions.append({
            "forecast_time_local": slot_time.isoformat(),
            "forecast_time_utc": slot_time.astimezone(timezone.utc).isoformat(),
            "risk_score": risk_result["risk_score"],
            "risk_level": risk_result["risk_level"],
            "environmental_risk": risk_result["environmental_risk"],
            "predicted_disruptions": disruptions,
            "weather": {
                "rainfall": slot.get("rainfall", 0),
                "aqi": slot.get("aqi", 150),
                "temperature": slot.get("temperature", 25),
                "humidity": slot.get("humidity", 70),
                "wind_speed": slot.get("wind_speed", 0)
            },
            "universal_engine": {
                "available": universal_result is not None,
                "risk_level": universal_result.get("risk_level") if universal_result else None,
                "risk_score": universal_result.get("risk_score") if universal_result else None,
                "disruptions_detected": universal_result.get("disruptions_detected") if universal_result else []
            }
        })

    peak_window = max(horizon_predictions, key=lambda item: item["risk_score"]) if horizon_predictions else None
    severe_windows = [
        prediction for prediction in horizon_predictions
        if prediction["risk_level"] in {"HIGH", "CRITICAL"} or prediction["predicted_disruptions"]
    ]

    return {
        "user_id": data.user_id,
        "policy_id": data.policy_id,
        "timezone": str(tz),
        "generated_at": datetime.now(tz).isoformat(),
        "horizon_hours": data.horizon_hours,
        "interval_hours": data.interval_hours,
        "location_risk": geo_analyzer.calculate_zone_risk(
            data.location_data.latitude,
            data.location_data.longitude
        ),
        "summary": {
            "max_risk_score": peak_window["risk_score"] if peak_window else 0,
            "max_risk_level": peak_window["risk_level"] if peak_window else "LOW",
            "peak_forecast_time_local": peak_window["forecast_time_local"] if peak_window else None,
            "severe_window_count": len(severe_windows),
            "future_disruption_likely": len(severe_windows) > 0
        },
        "forecast_windows": horizon_predictions
    }
