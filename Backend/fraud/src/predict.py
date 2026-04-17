import numpy as np
import pandas as pd

from src.data_generation import add_rule_checks
from src.scoring import (
    calculate_confidence,
    calculate_failed_checks,
    calculate_risk,
    confidence_band,
    explain_failed_checks,
    final_decision,
)
from src.train_model import load_model


def generate_decisions(df, y_proba, anomaly_flags, dynamic_threshold):
    failed_rule_count = calculate_failed_checks(df)
    risk_score = calculate_risk(
        y_proba,
        failed_rule_count,
        anomaly_flags,
        activity_validation_failed=(df["activity_check_pass"] == 0).astype(int),
        passive_presence_flag=df.get("passive_presence_flag", 0),
    )
    confidence = calculate_confidence(y_proba)
    anomaly_labels = np.where(anomaly_flags == -1, "Anomaly", "Normal")
    decisions = np.array(
        [
            final_decision(
                score,
                gps_spoof,
                anomaly_label,
                activity_check_pass=activity_check_pass,
                passive_presence_flag=passive_presence_flag,
            )
            for score, gps_spoof, anomaly_label, activity_check_pass, passive_presence_flag in zip(
                risk_score,
                df["gps_spoof_flag"],
                anomaly_labels,
                df["activity_check_pass"],
                df.get("passive_presence_flag", 0),
            )
        ]
    )
    priority_review = np.where(risk_score >= dynamic_threshold, "YES", "NO")
    return failed_rule_count, risk_score.round(2), confidence, decisions, priority_review, anomaly_labels


def predict_claims(claims_df, model_path=None):
    model_bundle = load_model(model_path)
    prepared_df = add_rule_checks(claims_df)
    feature_names = model_bundle["feature_names"]

    X = prepared_df[feature_names]
    rf_model = model_bundle["rf_model"]
    iso_model = model_bundle["iso_model"]
    dynamic_threshold = model_bundle.get("dynamic_threshold", 7.0)

    fraud_probability = rf_model.predict_proba(X)[:, 1]
    predicted_fraud = rf_model.predict(X)
    anomaly_score = iso_model.decision_function(X)
    anomaly_flag = iso_model.predict(X)

    failed_checks, risk_score, confidence, decisions, priority_review, anomaly_labels = generate_decisions(
        prepared_df,
        fraud_probability,
        anomaly_flag,
        dynamic_threshold,
    )

    results = prepared_df.copy()
    results["predicted_fraud"] = predicted_fraud
    results["fraud_probability"] = np.round(fraud_probability, 3)
    results["confidence_score"] = np.round(confidence, 3)
    results["confidence_level"] = confidence_band(confidence)
    results["anomaly_score"] = np.round(anomaly_score, 3)
    results["anomaly_flag"] = anomaly_labels
    results["failed_checks"] = failed_checks.astype(int)
    results["failed_check_reasons"] = explain_failed_checks(prepared_df)
    results["activity_validation_status"] = np.where(
        prepared_df["activity_check_pass"] == 1,
        "GENUINE_ACTIVITY",
        "SUSPICIOUS_ACTIVITY"
    )
    results["activity_validation_score"] = prepared_df.get("activity_validation_score", 0)
    results["activity_validation_reasons"] = prepared_df.get("activity_validation_reasons", "not available")
    results["passive_presence_flag"] = prepared_df.get("passive_presence_flag", 0).astype(int)
    results["fraud_risk_score_0_to_10"] = risk_score
    results["dynamic_risk_threshold_75p"] = round(dynamic_threshold, 2)
    results["above_dynamic_threshold"] = priority_review
    results["decision"] = decisions
    return results


def predict_single_claim(claim_payload, model_path=None):
    result_df = predict_claims(pd.DataFrame([claim_payload]), model_path=model_path)
    return result_df.iloc[0].to_dict()
