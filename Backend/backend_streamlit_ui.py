import json
import subprocess
import sys
from pathlib import Path

import pandas as pd
import requests
import streamlit as st


ROOT_DIR = Path(__file__).resolve().parent
FRAUD_DIR = ROOT_DIR / "fraud"
if str(FRAUD_DIR) not in sys.path:
    sys.path.insert(0, str(FRAUD_DIR))

try:
    from src.predict import predict_single_claim
except Exception:
    predict_single_claim = None


st.set_page_config(page_title="Backend Workflow Checker", layout="wide")


def safe_json(response):
    try:
        return response.json()
    except Exception:
        return {"raw_text": response.text}


def start_background_process(command, cwd):
    creationflags = 0
    if sys.platform.startswith("win"):
        creationflags = 0x00000008 | 0x00000200
    subprocess.Popen(
        command,
        cwd=str(cwd),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=creationflags,
    )


def start_insurance_api():
    start_background_process(["node", "server.js"], ROOT_DIR / "insurance-module")


def start_universal_engine():
    start_background_process(
        [sys.executable, "-m", "uvicorn", "app:app", "--host", "127.0.0.1", "--port", "8000"],
        ROOT_DIR / "universal_disruption_engine" / "universal_disruption_engine",
    )


def start_future_risk_api():
    start_background_process(
        [sys.executable, "-m", "uvicorn", "api.app:app", "--host", "127.0.0.1", "--port", "8002"],
        ROOT_DIR / "risk_prediction",
    )


def call_api(method, url, payload=None, timeout=30):
    try:
        response = requests.request(method, url, json=payload, timeout=timeout)
        return {
            "ok": response.ok,
            "status_code": response.status_code,
            "data": safe_json(response),
        }
    except Exception as exc:
        return {
            "ok": False,
            "status_code": None,
            "data": {"error": str(exc)},
        }


def run_demo_setup_script():
    script_path = ROOT_DIR / "insurance-module" / "scripts" / "setupRealtimeDemo.js"
    result = subprocess.run(
        ["node", str(script_path)],
        cwd=str(ROOT_DIR / "insurance-module"),
        capture_output=True,
        text=True,
        check=False,
    )
    output = (result.stdout or "") + ("\n" + result.stderr if result.stderr else "")
    start = output.find("{")
    end = output.rfind("}")
    if start == -1 or end == -1:
        raise RuntimeError(output.strip() or "Unable to parse setup script output")
    return json.loads(output[start:end + 1])


def render_call_result(title, result):
    st.subheader(title)
    if result["ok"]:
        st.success(f"HTTP {result['status_code']}")
    else:
        st.error(f"Request failed: {result['status_code']}")
    st.json(result["data"])


def workflow_summary(workflow):
    return pd.DataFrame(
        [
            {"Step": "Status", "Value": workflow.get("status")},
            {"Step": "Risk", "Value": workflow.get("risk", {}).get("overallRisk")},
            {"Step": "Fraud Approved", "Value": workflow.get("fraudCheck", {}).get("approved")},
            {"Step": "Weekly Premium", "Value": workflow.get("weeklyPricing", {}).get("weeklyPremium")},
            {"Step": "Coverage", "Value": workflow.get("weeklyPricing", {}).get("coverageAmount")},
            {"Step": "Claim Created", "Value": workflow.get("claim", {}).get("created")},
            {"Step": "Claim Status", "Value": workflow.get("claim", {}).get("status")},
            {"Step": "Payout Processed", "Value": workflow.get("payout", {}).get("processed")},
            {"Step": "Payout Amount", "Value": workflow.get("payout", {}).get("amount")},
        ]
    )


with st.sidebar:
    st.header("Service URLs")
    insurance_api = st.text_input("Insurance API", "http://127.0.0.1:5000")
    universal_api = st.text_input("Universal Engine", "http://127.0.0.1:8000")
    future_risk_api = st.text_input("Future Risk API", "http://127.0.0.1:8002")
    st.caption("Start the three backend services first, then use this UI to verify the flow.")
    st.divider()
    st.header("Quick Start")
    if st.button("Start Insurance API", use_container_width=True):
        start_insurance_api()
        st.success("Started insurance API in background")
    if st.button("Start Universal Engine", use_container_width=True):
        start_universal_engine()
        st.success("Started universal engine in background")
    if st.button("Start Future Risk API", use_container_width=True):
        start_future_risk_api()
        st.success("Started future risk API in background")


st.title("Full Backend Workflow Checker")
st.write(
    "Use this single UI to validate realtime diagnostics, forecast risk, fraud screening, "
    "and the end-to-end insurance workflow."
)

tab_health, tab_demo, tab_workflow, tab_forecast, tab_fraud = st.tabs(
    ["Service Health", "Demo Setup", "Workflow Runner", "Future Risk", "Fraud Sandbox"]
)


with tab_health:
    st.subheader("Health Checks")
    health_cols = st.columns(3)

    if health_cols[0].button("Check Insurance API", use_container_width=True):
        result = call_api("GET", f"{insurance_api}/health")
        render_call_result("Insurance API Health", result)

    if health_cols[1].button("Check Universal Engine", use_container_width=True):
        result = call_api("GET", f"{universal_api}/")
        render_call_result("Universal Engine Health", result)

    if health_cols[2].button("Check Future Risk API", use_container_width=True):
        result = call_api("GET", f"{future_risk_api}/health")
        render_call_result("Future Risk API Health", result)

    if st.button("Run External Diagnostics", use_container_width=True):
        diagnostics = call_api("GET", f"{insurance_api}/risk/debug/external")
        render_call_result("External Diagnostics", diagnostics)


with tab_demo:
    st.subheader("Create Demo Users and Policies")
    st.write(
        "This calls the existing Node setup script and creates one success-case user and one fraud-case user."
    )
    if st.button("Generate Demo Data", use_container_width=True):
        try:
            demo_payload = run_demo_setup_script()
            st.session_state["demo_payload"] = demo_payload
            st.success("Demo users and policies created")
            st.json(demo_payload)
        except Exception as exc:
            st.error(str(exc))

    if "demo_payload" in st.session_state:
        st.info("Demo IDs are stored in this session and can be reused in the Workflow Runner.")
        st.json(st.session_state["demo_payload"])


with tab_workflow:
    st.subheader("Run Insurance Workflow")
    default_success_user = st.session_state.get("demo_payload", {}).get("successUserId", "")
    default_fraud_user = st.session_state.get("demo_payload", {}).get("fraudUserId", "")

    workflow_col_1, workflow_col_2 = st.columns(2)
    success_user_id = workflow_col_1.text_input("Success User ID", value=default_success_user)
    fraud_user_id = workflow_col_2.text_input("Fraud User ID", value=default_fraud_user)

    run_col_1, run_col_2 = st.columns(2)

    if run_col_1.button("Run Success Workflow", use_container_width=True, disabled=not success_user_id):
        result = call_api("POST", f"{insurance_api}/risk/user/{success_user_id}/workflow", payload={})
        render_call_result("Success Workflow Raw Response", result)
        workflow = result["data"].get("data", {}).get("workflow", {})
        if workflow:
            st.dataframe(workflow_summary(workflow), use_container_width=True)

    if run_col_2.button("Run Fraud Workflow", use_container_width=True, disabled=not fraud_user_id):
        result = call_api("POST", f"{insurance_api}/risk/user/{fraud_user_id}/workflow", payload={})
        render_call_result("Fraud Workflow Raw Response", result)
        workflow = result["data"].get("data", {}).get("workflow", {})
        if workflow:
            st.dataframe(workflow_summary(workflow), use_container_width=True)


with tab_forecast:
    st.subheader("Future Risk Forecast")
    forecast_col_1, forecast_col_2, forecast_col_3 = st.columns(3)
    latitude = forecast_col_1.number_input("Latitude", value=12.9698, format="%.5f")
    longitude = forecast_col_2.number_input("Longitude", value=77.7500, format="%.5f")
    timezone_name = forecast_col_3.text_input("Timezone", value="Asia/Kolkata")

    location_text = st.text_input("Location", value="Whitefield, Bengaluru, IN")
    horizon_hours = st.slider("Forecast Horizon (hours)", min_value=3, max_value=72, value=24, step=3)
    interval_hours = st.slider("Interval (hours)", min_value=1, max_value=12, value=3, step=1)

    activity_col_1, activity_col_2, activity_col_3 = st.columns(3)
    deliveries_completed = activity_col_1.number_input("Deliveries Completed", min_value=0, value=6)
    working_hours = activity_col_2.number_input("Working Hours", min_value=0.0, value=6.0, step=0.5)
    avg_speed = activity_col_3.number_input("Average Speed", min_value=0.0, value=24.0, step=1.0)

    activity_col_4, activity_col_5 = st.columns(2)
    stops = activity_col_4.number_input("Stops / Route Blockages", min_value=0, value=2)
    blocked_routes_pct = activity_col_5.number_input("Blocked Routes %", min_value=0.0, max_value=100.0, value=20.0)

    if st.button("Predict Future Risk", use_container_width=True):
        payload = {
            "user_id": "streamlit-user",
            "policy_id": "streamlit-policy",
            "location_data": {
                "latitude": latitude,
                "longitude": longitude,
                "address": location_text,
                "timezone": timezone_name,
            },
            "activity_profile": {
                "deliveries_completed": deliveries_completed,
                "working_hours": working_hours,
                "avg_speed": avg_speed,
                "stops": stops,
                "blocked_routes_pct": blocked_routes_pct,
                "avg_route_delay_min": 12,
            },
            "historical_claims": 1,
            "horizon_hours": horizon_hours,
            "interval_hours": interval_hours,
            "universal_engine_url": universal_api,
        }
        result = call_api("POST", f"{future_risk_api}/api/predict-future-risk", payload=payload, timeout=60)
        render_call_result("Future Risk Response", result)
        forecast_windows = result["data"].get("forecast_windows", [])
        if forecast_windows:
            st.dataframe(pd.DataFrame(forecast_windows), use_container_width=True)


with tab_fraud:
    st.subheader("Fraud Sandbox")
    if predict_single_claim is None:
        st.error("Unable to import the local fraud predictor. Check Python environment and module paths.")
    else:
        fraud_left, fraud_mid, fraud_right = st.columns(3)
        worker_id = fraud_left.number_input("Worker ID", min_value=1, value=9001, step=1)
        claim_lat = fraud_mid.number_input("Claim Latitude", value=12.9698, format="%.5f")
        claim_lon = fraud_right.number_input("Claim Longitude", value=77.7500, format="%.5f")

        fraud_c1, fraud_c2, fraud_c3 = st.columns(3)
        rainfall_mm = fraud_c1.number_input("Rainfall (mm)", min_value=0.0, value=76.0, step=1.0)
        weather_api_1 = fraud_c2.number_input("Weather API 1 (mm)", min_value=0.0, value=74.0, step=1.0)
        weather_api_2 = fraud_c3.number_input("Weather API 2 (mm)", min_value=0.0, value=77.0, step=1.0)

        fraud_c4, fraud_c5, fraud_c6 = st.columns(3)
        weather_api_3 = fraud_c4.number_input("Weather API 3 (mm)", min_value=0.0, value=75.0, step=1.0)
        weather_spread = fraud_c5.number_input("Weather Disagreement", min_value=0.0, value=3.0, step=1.0)
        distance_from_event = fraud_c6.number_input("Distance From Event (km)", min_value=0.0, value=1.2, step=0.1)

        fraud_c7, fraud_c8, fraud_c9 = st.columns(3)
        is_active = fraud_c7.selectbox("Logged In", options=[1, 0], format_func=lambda value: "Yes" if value == 1 else "No")
        orders_accepted = fraud_c8.number_input("Orders Accepted", min_value=0, value=0)
        orders_completed = fraud_c9.number_input("Orders Completed", min_value=0, value=0)

        fraud_c10, fraud_c11, fraud_c12 = st.columns(3)
        gps_movement_km = fraud_c10.number_input("GPS Movement (km)", min_value=0.0, value=0.08, step=0.1)
        rejected_orders = fraud_c11.number_input("Rejected Orders", min_value=0, value=9)
        session_interactions = fraud_c12.number_input("Session Interactions", min_value=0, value=1)

        fraud_c13, fraud_c14 = st.columns(2)
        claim_count = fraud_c13.number_input("Claims Last 7 Days", min_value=0, value=3)
        claim_hour = fraud_c14.slider("Claim Hour", min_value=0, max_value=23, value=14)

        if st.button("Evaluate Fraud Claim", use_container_width=True):
            payload = {
                "worker_id": worker_id,
                "latitude": claim_lat,
                "longitude": claim_lon,
                "rainfall_mm": rainfall_mm,
                "orders_accepted": orders_accepted,
                "orders_completed": orders_completed,
                "is_active": is_active,
                "gps_movement_km": gps_movement_km,
                "rejected_orders": rejected_orders,
                "session_interactions": session_interactions,
                "distance_from_event": distance_from_event,
                "claim_count_last_7_days": claim_count,
                "weather_api_1_mm": weather_api_1,
                "weather_api_2_mm": weather_api_2,
                "weather_api_3_mm": weather_api_3,
                "weather_disagreement_mm": weather_spread,
                "claim_hour": claim_hour,
            }
            result = predict_single_claim(payload)
            metric_1, metric_2, metric_3 = st.columns(3)
            metric_1.metric("Decision", result["decision"])
            metric_2.metric("Fraud Score", f"{result['fraud_risk_score_0_to_10']:.2f}/10")
            metric_3.metric("Activity Status", result["activity_validation_status"])
            st.json(
                {
                    "activity_validation_reasons": result["activity_validation_reasons"],
                    "failed_check_reasons": result["failed_check_reasons"],
                    "passive_presence_flag": int(result["passive_presence_flag"]),
                    "gps_spoof_flag": int(result["gps_spoof_flag"]),
                    "anomaly_flag": result["anomaly_flag"],
                }
            )
