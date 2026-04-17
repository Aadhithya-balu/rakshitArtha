import pandas as pd
import streamlit as st

from src.data_generation import load_dataset
from src.predict import predict_claims, predict_single_claim


st.set_page_config(page_title="Fraud Detection System", layout="wide")
st.title("Fraud Detection System")

with st.sidebar:
    st.header("Claim Input")
    worker_id = st.number_input("Worker ID", min_value=0, value=4601, step=1)
    lat = st.number_input("Latitude", value=12.97, format="%.5f")
    lon = st.number_input("Longitude", value=77.59, format="%.5f")
    rainfall = st.number_input("Rainfall (mm)", min_value=0.0, max_value=200.0, value=60.0)
    orders_completed = st.number_input("Orders completed", min_value=0, max_value=100, value=2)
    is_active = st.selectbox("Is active", options=[1, 0], format_func=lambda v: "Yes" if v == 1 else "No")
    distance_from_event = st.number_input(
        "Distance from event (km)", min_value=0.0, max_value=200.0, value=2.0
    )
    claim_count = st.number_input("Claim count last 7 days", min_value=0, max_value=50, value=1)
    claim_hour = st.slider("Claim hour", min_value=0, max_value=23, value=10)

claim_payload = {
    "worker_id": worker_id,
    "latitude": lat,
    "longitude": lon,
    "rainfall_mm": rainfall,
    "orders_completed": orders_completed,
    "is_active": is_active,
    "distance_from_event": distance_from_event,
    "claim_count_last_7_days": claim_count,
    "claim_hour": claim_hour,
}

if st.button("Check Fraud", use_container_width=True):
    result = predict_single_claim(claim_payload)
    col1, col2, col3 = st.columns(3)
    col1.metric("Risk Score", f"{result['fraud_risk_score_0_to_10']:.2f}/10")
    col2.metric("Decision", result["decision"])
    col3.metric("Confidence", f"{result['confidence_score']:.2%}")
    st.write(
        f"Claim failed {int(result['failed_checks'])} checks, which suggests "
        f"{'higher' if result['failed_checks'] >= 3 else 'lower'} rule-based risk."
    )
    st.json(
        {
            "failed_check_reasons": result["failed_check_reasons"],
            "anomaly_flag": result["anomaly_flag"],
            "gps_spoof_flag": int(result["gps_spoof_flag"]),
            "duplicate_claim_flag": int(result["duplicate_claim_flag"]),
            "time_pattern_flag": int(result["time_pattern_flag"]),
            "above_dynamic_threshold": result["above_dynamic_threshold"],
        }
    )

st.header("Dashboard")
dataset = load_dataset()
predictions = predict_claims(dataset)

fraud_rate = float(dataset["fraud_label"].mean())
decision_counts = predictions["decision"].value_counts().reindex(["APPROVE", "REJECT"], fill_value=0)
risk_bins = pd.cut(
    predictions["fraud_risk_score_0_to_10"],
    bins=[0, 4, 7, 10],
    labels=["Low", "Medium", "High"],
    include_lowest=True,
)
risk_distribution = risk_bins.value_counts().reindex(["Low", "Medium", "High"], fill_value=0)

metric_1, metric_2, metric_3 = st.columns(3)
metric_1.metric("Fraud Rate", f"{fraud_rate:.1%}")
metric_2.metric("Approved Claims", int(decision_counts["APPROVE"]))
metric_3.metric("Rejected Claims", int(decision_counts["REJECT"]))

chart_col_1, chart_col_2 = st.columns(2)
with chart_col_1:
    st.subheader("Risk Distribution")
    st.bar_chart(risk_distribution)
with chart_col_2:
    st.subheader("Claims Approved vs Rejected")
    st.bar_chart(decision_counts)
