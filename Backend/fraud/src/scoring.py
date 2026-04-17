import numpy as np


RULE_CHECK_COLUMNS = [
    "location_check_pass",
    "behavior_check_pass",
    "activity_check_pass",
    "official_data_check_pass",
    "trigger_met",
]


def decision(score):
    return "APPROVE" if score < 4 else "REJECT"


def final_decision(score, gps_spoof, anomaly_flag, activity_check_pass=1, passive_presence_flag=0):
    if gps_spoof == 1:
        return "REJECT"
    if passive_presence_flag == 1:
        return "REJECT"
    if anomaly_flag == "Anomaly" and activity_check_pass == 0:
        return "REJECT"
    return "APPROVE" if score < 4 else "REJECT"


def calculate_failed_checks(df):
    return 5 - df[RULE_CHECK_COLUMNS].sum(axis=1)


def calculate_confidence(y_proba):
    return np.clip(np.abs(np.asarray(y_proba) - 0.5) * 2, 0, 1)


def confidence_band(confidence):
    confidence = np.asarray(confidence)
    return np.where(
        confidence >= 0.7,
        "HIGH",
        np.where(confidence >= 0.4, "MEDIUM", "LOW"),
    )


def calculate_risk(y_proba, failed_checks, anomaly_flag, activity_validation_failed=None, passive_presence_flag=None):
    ml_weight = 0.6
    rule_weight = 0.3
    anomaly_weight = 0.1

    anomaly_score = np.where(np.asarray(anomaly_flag) == -1, 1, 0)
    activity_penalty = np.where(np.asarray(activity_validation_failed) == 1, 1.5, 0) if activity_validation_failed is not None else 0
    passive_presence_penalty = np.where(np.asarray(passive_presence_flag) == 1, 1.0, 0) if passive_presence_flag is not None else 0
    score = (
        (np.asarray(y_proba) * 10 * ml_weight)
        + (np.asarray(failed_checks) * 2 * rule_weight)
        + (anomaly_score * 10 * anomaly_weight)
        + activity_penalty
        + passive_presence_penalty
    )
    return np.clip(score, 0, 10)


def explain_failed_checks(df):
    reason_map = {
        "location_check_pass": "location mismatch",
        "behavior_check_pass": "suspicious claim frequency",
        "activity_check_pass": "weak activity validation or passive app presence",
        "official_data_check_pass": "official weather mismatch",
        "trigger_met": "rain trigger not met",
    }
    failed_reasons = []
    for idx, row in df[RULE_CHECK_COLUMNS].iterrows():
        reasons = [reason_map[column] for column in RULE_CHECK_COLUMNS if row[column] == 0]
        if "activity_validation_reasons" in df.columns and df.loc[idx, "activity_check_pass"] == 0:
            reasons.append(str(df.loc[idx, "activity_validation_reasons"]))
        failed_reasons.append(", ".join(reasons) if reasons else "no rule failures")
    return failed_reasons
