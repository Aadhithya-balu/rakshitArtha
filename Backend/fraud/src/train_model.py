import pickle
from pathlib import Path

import matplotlib
import numpy as np
import pandas as pd

matplotlib.use("Agg")
import matplotlib.pyplot as plt

from sklearn.ensemble import IsolationForest, RandomForestClassifier
from sklearn.metrics import (
    ConfusionMatrixDisplay,
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)
from sklearn.model_selection import train_test_split

from src.data_generation import RANDOM_SEED, load_dataset
from src.scoring import calculate_confidence, calculate_failed_checks, calculate_risk, decision

BASE_DIR = Path(__file__).resolve().parents[1]
MODEL_DIR = BASE_DIR / "models"

MODEL_PATH = MODEL_DIR / "fraud_model.pkl"
CONFUSION_MATRIX_PATH = MODEL_DIR / "confusion_matrix.png"
FEATURE_IMPORTANCE_PATH = MODEL_DIR / "feature_importance.png"
MODEL_VERSION = "3.0"


def build_feature_matrix(df):
    feature_columns = [
        "latitude",
        "longitude",
        "rainfall_mm",
        "orders_accepted",
        "orders_completed",
        "is_active",
        "gps_movement_km",
        "rejected_orders",
        "session_interactions",
        "distance_from_event",
        "claim_count_last_7_days",
        "weather_api_1_mm",
        "weather_api_2_mm",
        "weather_api_3_mm",
        "weather_disagreement_mm",
        "claim_hour",
        "trigger_met",
        "location_check_pass",
        "behavior_check_pass",
        "activity_check_pass",
        "activity_failed_checks",
        "activity_validation_score",
        "official_data_check_pass",
        "calculated_distance_km",
        "gps_spoof_flag",
        "passive_presence_flag",
        "duplicate_claim_flag",
        "time_pattern_flag",
    ]
    return df[feature_columns].copy(), feature_columns


def train_supervised_model(X_train, y_train):
    model = RandomForestClassifier(
        n_estimators=250,
        max_depth=10,
        min_samples_leaf=5,
        class_weight="balanced_subsample",
        random_state=RANDOM_SEED,
    )
    model.fit(X_train, y_train)
    return model


def train_unsupervised_model(X_train):
    model = IsolationForest(
        n_estimators=200,
        contamination=0.12,
        random_state=RANDOM_SEED,
    )
    model.fit(X_train)
    return model


def evaluate_model(model, X_test, y_test):
    y_pred = model.predict(X_test)
    y_proba = model.predict_proba(X_test)[:, 1]

    accuracy = accuracy_score(y_test, y_pred)
    precision = precision_score(y_test, y_pred, zero_division=0)
    recall = recall_score(y_test, y_pred, zero_division=0)
    f1 = f1_score(y_test, y_pred, zero_division=0)
    cm = confusion_matrix(y_test, y_pred)

    print("=== Supervised Model Evaluation ===")
    print(f"Accuracy : {accuracy:.3f}")
    print(f"Precision: {precision:.3f}")
    print(f"Recall   : {recall:.3f}")
    print(f"F1-score : {f1:.3f}")
    print("\nConfusion Matrix:")
    print(cm)
    print("\nClassification Report:")
    print(classification_report(y_test, y_pred, digits=3))

    metrics = {
        "accuracy": round(accuracy, 3),
        "precision": round(precision, 3),
        "recall": round(recall, 3),
        "f1_score": round(f1, 3),
    }
    return y_pred, y_proba, cm, metrics


def plot_confusion_matrix(cm, output_path=CONFUSION_MATRIX_PATH):
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    disp = ConfusionMatrixDisplay(confusion_matrix=cm, display_labels=["Legit", "Fraud"])
    disp.plot(cmap="Blues", values_format="d")
    plt.title("Fraud Detection Confusion Matrix")
    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches="tight")
    plt.close()
    print(f"Saved confusion matrix plot to: {output_path.resolve()}")


def plot_feature_importance(model, feature_names, output_path=FEATURE_IMPORTANCE_PATH):
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    importance_df = pd.DataFrame(
        {"feature": feature_names, "importance": model.feature_importances_}
    ).sort_values("importance", ascending=True)

    plt.figure(figsize=(10, 7))
    plt.barh(importance_df["feature"], importance_df["importance"], color="#4c78a8")
    plt.xlabel("Importance")
    plt.ylabel("Feature")
    plt.title("Feature Importance for Fraud Detection")
    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches="tight")
    plt.close()
    print(f"Saved feature importance plot to: {output_path.resolve()}")


def save_model(model_bundle, model_path=MODEL_PATH):
    model_path = Path(model_path)
    model_path.parent.mkdir(parents=True, exist_ok=True)
    with model_path.open("wb") as model_file:
        pickle.dump(model_bundle, model_file)
    print(f"Saved model bundle to: {model_path.resolve()}")


def load_model(model_path=MODEL_PATH):
    model_path = Path(model_path) if model_path is not None else MODEL_PATH
    if not model_path.exists():
        print(f"Model not found at {model_path.resolve()}. Training a new model bundle.")
        train_and_save_model(model_path=model_path)
    with model_path.open("rb") as model_file:
        model_bundle = pickle.load(model_file)
    if model_bundle.get("model_version") != MODEL_VERSION:
        print("Stored model bundle is outdated. Retraining with the latest feature set.")
        train_and_save_model(model_path=model_path)
        with model_path.open("rb") as model_file:
            model_bundle = pickle.load(model_file)
    print(f"Loaded model bundle from: {model_path.resolve()}")
    return model_bundle


def train_and_save_model(dataset_path=None, model_path=MODEL_PATH):
    dataset_path = dataset_path or (BASE_DIR / "data" / "dataset.csv")
    df = load_dataset(dataset_path)
    print("\nFraud label distribution:")
    print(df["fraud_label"].value_counts(normalize=True).rename("ratio").round(3))

    X, feature_names = build_feature_matrix(df)
    y = df["fraud_label"]

    X_train, X_test, y_train, y_test, df_train, df_test = train_test_split(
        X,
        y,
        df,
        test_size=0.25,
        stratify=y,
        random_state=RANDOM_SEED,
    )

    rf_model = train_supervised_model(X_train, y_train)
    iso_model = train_unsupervised_model(X_train)
    y_pred, y_proba, cm, metrics = evaluate_model(rf_model, X_test, y_test)
    train_anomaly_flags = iso_model.predict(X_train)
    train_failed_checks = calculate_failed_checks(df_train)
    train_risk_scores = calculate_risk(
        rf_model.predict_proba(X_train)[:, 1],
        train_failed_checks,
        train_anomaly_flags,
        activity_validation_failed=(df_train["activity_check_pass"] == 0).astype(int),
        passive_presence_flag=df_train["passive_presence_flag"],
    )
    dynamic_threshold = float(np.percentile(train_risk_scores, 75))

    plot_confusion_matrix(cm)
    plot_feature_importance(rf_model, feature_names)

    model_bundle = {
        "rf_model": rf_model,
        "iso_model": iso_model,
        "feature_names": feature_names,
        "metrics": metrics,
        "train_columns": list(X_train.columns),
        "dynamic_threshold": dynamic_threshold,
        "model_version": MODEL_VERSION,
    }
    save_model(model_bundle, model_path=model_path)

    test_anomaly_flags = iso_model.predict(X_test)
    test_failed_checks = calculate_failed_checks(df_test)
    test_risk_scores = calculate_risk(
        y_proba,
        test_failed_checks,
        test_anomaly_flags,
        activity_validation_failed=(df_test["activity_check_pass"] == 0).astype(int),
        passive_presence_flag=df_test["passive_presence_flag"],
    )
    test_confidence = calculate_confidence(y_proba)

    evaluation_df = df_test[
        [
            "worker_id",
            "rainfall_mm",
            "orders_accepted",
            "distance_from_event",
            "orders_completed",
            "is_active",
            "gps_movement_km",
            "rejected_orders",
            "session_interactions",
            "claim_count_last_7_days",
            "claim_hour",
            "fraud_label",
            "activity_validation_reasons",
        ]
    ].copy()
    evaluation_df["predicted_fraud"] = y_pred
    evaluation_df["predicted_probability"] = np.round(y_proba, 3)
    evaluation_df["confidence_score"] = np.round(test_confidence, 3)
    evaluation_df["failed_checks"] = test_failed_checks.astype(int)
    evaluation_df["risk_score"] = np.round(test_risk_scores, 2)
    evaluation_df["decision"] = [decision(score) for score in test_risk_scores]
    evaluation_df["above_dynamic_threshold"] = test_risk_scores >= dynamic_threshold
    return model_bundle, evaluation_df
