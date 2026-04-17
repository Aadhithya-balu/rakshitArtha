from pathlib import Path

import numpy as np
import pandas as pd

BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"

RANDOM_SEED = 42
EVENT_CENTER_LAT = 12.9716
EVENT_CENTER_LON = 77.5946
HEAVY_RAIN_TRIGGER_MM = 50.0
MAX_EVENT_DISTANCE_KM = 5.0
DATASET_PATH = DATA_DIR / "dataset.csv"
BASE_INPUT_DEFAULTS = {
    "worker_id": 0,
    "latitude": EVENT_CENTER_LAT,
    "longitude": EVENT_CENTER_LON,
    "rainfall_mm": 0.0,
    "orders_accepted": 0,
    "orders_completed": 0,
    "is_active": 0,
    "gps_movement_km": 0.0,
    "rejected_orders": 0,
    "session_interactions": 0,
    "distance_from_event": 0.0,
    "claim_count_last_7_days": 0,
    "weather_api_1_mm": 0.0,
    "weather_api_2_mm": 0.0,
    "weather_api_3_mm": 0.0,
    "weather_disagreement_mm": 0.0,
    "claim_hour": 12,
}
MIN_GPS_MOVEMENT_KM = 0.5
MAX_REJECTED_ORDERS = 5
MIN_SESSION_INTERACTIONS = 3


def haversine_distance_km(lat1, lon1, lat2, lon2):
    """Compute great-circle distance between two GPS points in kilometers."""
    lat1_rad = np.radians(lat1)
    lon1_rad = np.radians(lon1)
    lat2_rad = np.radians(lat2)
    lon2_rad = np.radians(lon2)

    dlat = lat2_rad - lat1_rad
    dlon = lon2_rad - lon1_rad

    a = (
        np.sin(dlat / 2.0) ** 2
        + np.cos(lat1_rad) * np.cos(lat2_rad) * np.sin(dlon / 2.0) ** 2
    )
    c = 2 * np.arcsin(np.sqrt(a))
    return 6371.0 * c


def simulate_weather_sources(n_rows, rng):
    """Create three noisy weather feeds to emulate official data cross-checking."""
    severe_event = rng.random(n_rows) < 0.65
    true_rainfall = np.where(
        severe_event,
        rng.normal(loc=72, scale=16, size=n_rows),
        rng.normal(loc=28, scale=14, size=n_rows),
    )
    true_rainfall = np.clip(true_rainfall, 0, 140)

    api_1 = np.clip(true_rainfall + rng.normal(0, 6, n_rows), 0, 150)
    api_2 = np.clip(true_rainfall + rng.normal(0, 8, n_rows), 0, 150)
    api_3 = np.clip(true_rainfall + rng.normal(0, 7, n_rows), 0, 150)

    rainfall_mm = np.clip((api_1 + api_2 + api_3) / 3, 0, 150)
    api_spread = np.max(np.column_stack([api_1, api_2, api_3]), axis=1) - np.min(
        np.column_stack([api_1, api_2, api_3]), axis=1
    )

    return api_1, api_2, api_3, rainfall_mm, api_spread


def sanitize_claim_data(df):
    """Normalize schema, fill missing values, and clip invalid numeric inputs."""
    df = df.copy()
    for column, default_value in BASE_INPUT_DEFAULTS.items():
        if column not in df.columns:
            df[column] = default_value

    if df["weather_api_1_mm"].eq(0).all() and "rainfall_mm" in df.columns:
        df["weather_api_1_mm"] = df["rainfall_mm"]
    if df["weather_api_2_mm"].eq(0).all() and "rainfall_mm" in df.columns:
        df["weather_api_2_mm"] = df["rainfall_mm"]
    if df["weather_api_3_mm"].eq(0).all() and "rainfall_mm" in df.columns:
        df["weather_api_3_mm"] = df["rainfall_mm"]

    df["worker_id"] = pd.to_numeric(df["worker_id"], errors="coerce").fillna(0).round().astype(int)
    df["latitude"] = np.clip(
        pd.to_numeric(df["latitude"], errors="coerce").fillna(EVENT_CENTER_LAT), -90, 90
    )
    df["longitude"] = np.clip(
        pd.to_numeric(df["longitude"], errors="coerce").fillna(EVENT_CENTER_LON), -180, 180
    )
    df["rainfall_mm"] = np.clip(pd.to_numeric(df["rainfall_mm"], errors="coerce").fillna(0), 0, 200)
    df["orders_accepted"] = np.clip(
        pd.to_numeric(df["orders_accepted"], errors="coerce").fillna(0), 0, 100
    ).round().astype(int)
    df["orders_completed"] = np.clip(
        pd.to_numeric(df["orders_completed"], errors="coerce").fillna(0), 0, 100
    ).round().astype(int)
    df["is_active"] = np.clip(
        pd.to_numeric(df["is_active"], errors="coerce").fillna(0), 0, 1
    ).round().astype(int)
    df["gps_movement_km"] = np.clip(
        pd.to_numeric(df["gps_movement_km"], errors="coerce").fillna(0), 0, 300
    )
    df["rejected_orders"] = np.clip(
        pd.to_numeric(df["rejected_orders"], errors="coerce").fillna(0), 0, 100
    ).round().astype(int)
    df["session_interactions"] = np.clip(
        pd.to_numeric(df["session_interactions"], errors="coerce").fillna(0), 0, 500
    ).round().astype(int)
    df["distance_from_event"] = np.clip(
        pd.to_numeric(df["distance_from_event"], errors="coerce").fillna(0), 0, 200
    )
    df["claim_count_last_7_days"] = np.clip(
        pd.to_numeric(df["claim_count_last_7_days"], errors="coerce").fillna(0), 0, 50
    ).round().astype(int)
    df["weather_api_1_mm"] = np.clip(
        pd.to_numeric(df["weather_api_1_mm"], errors="coerce").fillna(df["rainfall_mm"]), 0, 200
    )
    df["weather_api_2_mm"] = np.clip(
        pd.to_numeric(df["weather_api_2_mm"], errors="coerce").fillna(df["rainfall_mm"]), 0, 200
    )
    df["weather_api_3_mm"] = np.clip(
        pd.to_numeric(df["weather_api_3_mm"], errors="coerce").fillna(df["rainfall_mm"]), 0, 200
    )
    df["claim_hour"] = np.clip(
        pd.to_numeric(df["claim_hour"], errors="coerce").fillna(12), 0, 23
    ).round().astype(int)

    weather_disagreement = pd.to_numeric(df["weather_disagreement_mm"], errors="coerce")
    recalculated_spread = (
        df[["weather_api_1_mm", "weather_api_2_mm", "weather_api_3_mm"]].max(axis=1)
        - df[["weather_api_1_mm", "weather_api_2_mm", "weather_api_3_mm"]].min(axis=1)
    )
    df["weather_disagreement_mm"] = np.clip(
        weather_disagreement.where(weather_disagreement.notna(), recalculated_spread),
        0,
        200,
    )
    df["orders_completed"] = np.minimum(df["orders_completed"], df["orders_accepted"])
    return df


def activity_validation(
    is_active,
    orders_accepted,
    orders_completed,
    gps_movement_km,
    rejected_orders,
    session_interactions=0,
    min_gps_movement_km=MIN_GPS_MOVEMENT_KM,
    max_rejected_orders=MAX_REJECTED_ORDERS,
    min_session_interactions=MIN_SESSION_INTERACTIONS,
):
    """Validate that app activity represents real delivery effort, not passive login."""
    reasons = []

    if int(is_active) != 1:
        reasons.append("worker not logged in")
    else:
        if orders_accepted <= 0:
            reasons.append("logged in but accepted no orders")
        if orders_completed <= 0:
            reasons.append("no deliveries completed")
        if gps_movement_km < min_gps_movement_km:
            reasons.append("gps movement too low")
        if rejected_orders >= max_rejected_orders:
            reasons.append("too many rejected orders")
        if session_interactions < min_session_interactions:
            reasons.append("too few session interactions")

    checks_total = 5
    failed_checks = len(reasons)
    validation_score = max(0.0, round((checks_total - failed_checks) / checks_total, 2))

    return {
        "is_genuine_activity": failed_checks == 0,
        "failed_checks": failed_checks,
        "validation_score": validation_score,
        "reasons": reasons or ["genuine activity verified"],
    }


def add_rule_checks(df):
    """Add the five rule-based checks used in both training and prediction."""
    df = sanitize_claim_data(df)
    calculated_distance = haversine_distance_km(
        df["latitude"],
        df["longitude"],
        EVENT_CENTER_LAT,
        EVENT_CENTER_LON,
    )
    duplicate_signature = df.duplicated(
        subset=["worker_id", "latitude", "longitude", "rainfall_mm"],
        keep=False,
    )

    df["trigger_met"] = (df["rainfall_mm"] > HEAVY_RAIN_TRIGGER_MM).astype(int)
    df["location_check_pass"] = (
        (df["distance_from_event"] <= MAX_EVENT_DISTANCE_KM) & (df["trigger_met"] == 1)
    ).astype(int)
    df["behavior_check_pass"] = (df["claim_count_last_7_days"] <= 2).astype(int)
    activity_results = [
        activity_validation(
            row.is_active,
            row.orders_accepted,
            row.orders_completed,
            row.gps_movement_km,
            row.rejected_orders,
            row.session_interactions,
        )
        for row in df.itertuples(index=False)
    ]
    df["activity_check_pass"] = [int(result["is_genuine_activity"]) for result in activity_results]
    df["activity_failed_checks"] = [result["failed_checks"] for result in activity_results]
    df["activity_validation_score"] = [result["validation_score"] for result in activity_results]
    df["activity_validation_reasons"] = ["; ".join(result["reasons"]) for result in activity_results]
    df["passive_presence_flag"] = (
        (df["is_active"] == 1)
        & (df["orders_accepted"] == 0)
        & (df["orders_completed"] == 0)
        & (df["gps_movement_km"] < MIN_GPS_MOVEMENT_KM)
    ).astype(int)
    df["official_data_check_pass"] = (
        (df["weather_disagreement_mm"] <= 18) & (df["rainfall_mm"] >= 35)
    ).astype(int)
    df["calculated_distance_km"] = np.round(calculated_distance, 2)
    df["gps_spoof_flag"] = (
        (
            np.abs(df["calculated_distance_km"] - df["distance_from_event"]) > 2.5
        )
        | ((df["distance_from_event"] > 8) & (df["rainfall_mm"] > 70))
    ).astype(int)
    df["duplicate_claim_flag"] = (
        duplicate_signature | (df["claim_count_last_7_days"] >= 4)
    ).astype(int)
    df["time_pattern_flag"] = (
        df["claim_hour"].isin([0, 1, 2, 3, 4, 5, 23]) | (df["claim_count_last_7_days"] >= 5)
    ).astype(int)
    return df


def generate_synthetic_dataset(n_rows=4000, random_seed=RANDOM_SEED):
    """Generate realistic claim-level fraud data for gig-worker insurance."""
    rng = np.random.default_rng(random_seed)

    worker_ids = rng.integers(1000, 3500, size=n_rows)

    latitudes = EVENT_CENTER_LAT + rng.normal(0, 0.04, size=n_rows)
    longitudes = EVENT_CENTER_LON + rng.normal(0, 0.04, size=n_rows)

    location_outlier_mask = rng.random(n_rows) < 0.12
    latitudes[location_outlier_mask] += rng.normal(0.08, 0.03, location_outlier_mask.sum())
    longitudes[location_outlier_mask] += rng.normal(0.08, 0.03, location_outlier_mask.sum())

    true_distance_km = haversine_distance_km(
        latitudes,
        longitudes,
        EVENT_CENTER_LAT,
        EVENT_CENTER_LON,
    )
    distance_noise = rng.normal(0, 0.35, size=n_rows)
    distance_from_event = np.clip(true_distance_km + distance_noise, 0, 20)

    api_1, api_2, api_3, rainfall_mm, api_spread = simulate_weather_sources(n_rows, rng)

    base_orders = np.clip(
        rng.poisson(lam=6, size=n_rows) + rng.normal(0, 1.3, size=n_rows),
        0,
        25,
    )
    orders_accepted = np.clip(
        np.round(base_orders + rng.normal(1.5, 1.2, size=n_rows)),
        0,
        30,
    ).astype(int)
    rain_penalty = np.clip((rainfall_mm - 35) / 9.0, 0, 6)
    distance_penalty = np.clip((distance_from_event - 3) / 2.5, 0, 4)
    orders_completed = np.clip(
        np.round(np.minimum(orders_accepted, base_orders) - rain_penalty - distance_penalty + rng.normal(0, 1.0, size=n_rows)),
        0,
        20,
    ).astype(int)
    rejected_orders = np.clip(
        np.round(np.maximum(0, orders_accepted - orders_completed) + rng.normal(1.0, 1.0, size=n_rows)),
        0,
        20,
    ).astype(int)
    gps_movement_km = np.clip(
        orders_completed * rng.normal(2.2, 0.6, size=n_rows)
        + orders_accepted * rng.normal(0.4, 0.15, size=n_rows)
        - rain_penalty * 0.3,
        0,
        80,
    )
    session_interactions = np.clip(
        np.round(orders_accepted * rng.normal(2.5, 0.5, size=n_rows) + orders_completed * 2 + rng.normal(3, 2, size=n_rows)),
        0,
        150,
    ).astype(int)

    active_probability = np.clip(
        0.82 - 0.02 * np.maximum(rainfall_mm - 40, 0) / 10 + 0.03 * (orders_completed > 0),
        0.1,
        0.95,
    )
    is_active = (rng.random(n_rows) < active_probability).astype(int)

    claim_count_last_7_days = np.clip(
        rng.poisson(0.9, size=n_rows)
        + (rng.random(n_rows) < 0.16).astype(int) * rng.integers(1, 4, size=n_rows),
        0,
        7,
    )
    claim_hour_probabilities = np.array(
        [
            0.025,
            0.02,
            0.015,
            0.015,
            0.015,
            0.02,
            0.025,
            0.04,
            0.06,
            0.07,
            0.075,
            0.075,
            0.07,
            0.065,
            0.06,
            0.055,
            0.05,
            0.05,
            0.045,
            0.04,
            0.035,
            0.03,
            0.025,
            0.025,
        ]
    )
    claim_hour_probabilities = claim_hour_probabilities / claim_hour_probabilities.sum()
    claim_hour = rng.choice(
        np.arange(24),
        size=n_rows,
        p=claim_hour_probabilities,
    )

    hidden_fraud_propensity = rng.beta(2, 8, size=n_rows)
    hidden_spoofing_risk = (rng.random(n_rows) < 0.07).astype(int)
    passive_presence_mask = rng.random(n_rows) < 0.12
    orders_accepted[passive_presence_mask] = rng.integers(0, 1, passive_presence_mask.sum())
    orders_completed[passive_presence_mask] = 0
    gps_movement_km[passive_presence_mask] = np.clip(rng.normal(0.12, 0.08, passive_presence_mask.sum()), 0, 0.35)
    rejected_orders[passive_presence_mask] = rng.integers(5, 12, passive_presence_mask.sum())
    session_interactions[passive_presence_mask] = rng.integers(0, 3, passive_presence_mask.sum())
    is_active[passive_presence_mask] = 1

    df = pd.DataFrame(
        {
            "worker_id": worker_ids,
            "latitude": latitudes,
            "longitude": longitudes,
            "rainfall_mm": rainfall_mm.round(2),
            "orders_accepted": orders_accepted,
            "orders_completed": orders_completed,
            "is_active": is_active,
            "gps_movement_km": np.round(gps_movement_km, 2),
            "rejected_orders": rejected_orders,
            "session_interactions": session_interactions,
            "distance_from_event": distance_from_event.round(2),
            "claim_count_last_7_days": claim_count_last_7_days,
            "weather_api_1_mm": api_1.round(2),
            "weather_api_2_mm": api_2.round(2),
            "weather_api_3_mm": api_3.round(2),
            "weather_disagreement_mm": api_spread.round(2),
            "claim_hour": claim_hour,
        }
    )

    df = add_rule_checks(df)

    fraud_score = (
        1.1 * (df["trigger_met"] == 0).astype(float)
        + 1.5 * (df["distance_from_event"] > MAX_EVENT_DISTANCE_KM).astype(float)
        + 1.2 * (df["is_active"] == 0).astype(float)
        + 1.6 * (df["orders_accepted"] == 0).astype(float)
        + 1.0 * (df["orders_completed"] == 0).astype(float)
        + 1.3 * (df["gps_movement_km"] < MIN_GPS_MOVEMENT_KM).astype(float)
        + 0.9 * (df["rejected_orders"] >= MAX_REJECTED_ORDERS).astype(float)
        + 0.8 * (df["session_interactions"] < MIN_SESSION_INTERACTIONS).astype(float)
        + 1.1 * (df["claim_count_last_7_days"] >= 3).astype(float)
        + 0.8 * (df["weather_disagreement_mm"] > 18).astype(float)
        + 0.9 * (df["rainfall_mm"] < 45).astype(float)
        + 1.1 * df["gps_spoof_flag"]
        + 0.9 * df["duplicate_claim_flag"]
        + 0.7 * df["time_pattern_flag"]
        + 1.5 * df["passive_presence_flag"]
        + 1.4 * hidden_spoofing_risk
        + 2.0 * hidden_fraud_propensity
        + rng.normal(0, 0.75, size=n_rows)
    )

    fraud_probability = 1 / (1 + np.exp(-(fraud_score - 3.0)))
    df["fraud_label"] = (rng.random(n_rows) < fraud_probability).astype(int)

    flip_mask = rng.random(n_rows) < 0.06
    df.loc[flip_mask, "fraud_label"] = 1 - df.loc[flip_mask, "fraud_label"]
    return df


def save_dataset_once(dataset_path=DATASET_PATH, n_rows=4000, random_seed=RANDOM_SEED):
    """Generate the dataset once and reuse it on future runs."""
    dataset_path = Path(dataset_path)
    dataset_path.parent.mkdir(parents=True, exist_ok=True)

    if dataset_path.exists():
        print(f"Dataset already exists at: {dataset_path.resolve()}")
        return pd.read_csv(dataset_path)

    df = generate_synthetic_dataset(n_rows=n_rows, random_seed=random_seed)
    df.to_csv(dataset_path, index=False)
    print(f"Generated and saved dataset to: {dataset_path.resolve()}")
    return df


def load_dataset(dataset_path=DATASET_PATH):
    """Load an existing dataset instead of regenerating it."""
    dataset_path = Path(dataset_path)
    if not dataset_path.exists():
        print(f"Dataset not found at {dataset_path.resolve()}. Generating it now.")
        generated = generate_synthetic_dataset(n_rows=4000, random_seed=RANDOM_SEED)
        dataset_path.parent.mkdir(parents=True, exist_ok=True)
        generated.to_csv(dataset_path, index=False)
        return add_rule_checks(generated)
    print(f"Loaded dataset from: {dataset_path.resolve()}")
    raw_df = pd.read_csv(dataset_path)
    required_columns = {
        "orders_accepted",
        "gps_movement_km",
        "rejected_orders",
        "session_interactions",
    }
    if not required_columns.issubset(raw_df.columns):
        print("Existing dataset schema is outdated. Regenerating dataset with advanced activity features.")
        regenerated = generate_synthetic_dataset(n_rows=len(raw_df), random_seed=RANDOM_SEED)
        regenerated.to_csv(dataset_path, index=False)
        raw_df = regenerated
    return add_rule_checks(raw_df)


def make_new_claim_examples():
    """Create a few new claims for prediction demos."""
    sample = pd.DataFrame(
        {
            "worker_id": [4601, 4602, 4603],
            "latitude": [12.9725, 13.0450, 12.9680],
            "longitude": [77.5900, 77.7100, 77.6010],
            "rainfall_mm": [78.0, 41.0, 67.0],
            "orders_accepted": [3, 0, 6],
            "orders_completed": [2, 0, 4],
            "is_active": [1, 0, 1],
            "gps_movement_km": [5.8, 0.1, 9.4],
            "rejected_orders": [1, 7, 0],
            "session_interactions": [12, 1, 18],
            "distance_from_event": [1.1, 9.2, 0.7],
            "claim_count_last_7_days": [1, 4, 0],
            "weather_api_1_mm": [80.0, 36.0, 68.0],
            "weather_api_2_mm": [75.0, 52.0, 63.0],
            "weather_api_3_mm": [79.0, 33.0, 69.0],
            "weather_disagreement_mm": [5.0, 19.0, 6.0],
            "claim_hour": [10, 2, 23],
        }
    )
    return add_rule_checks(sample)
