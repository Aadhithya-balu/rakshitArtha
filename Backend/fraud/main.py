from src.data_generation import load_dataset, make_new_claim_examples, save_dataset_once
from src.predict import predict_claims
from src.train_model import MODEL_PATH, MODEL_VERSION, load_model, train_and_save_model


def main():
    print("=== Step 1: Save Dataset Only Once ===")
    save_dataset_once()

    print("\n=== Step 2: Load Dataset Instead of Regenerate ===")
    dataset = load_dataset()
    print(dataset.head())

    print("\n=== Step 3: Save Model ===")
    should_retrain = not MODEL_PATH.exists()
    if not should_retrain:
        existing_model = load_model()
        should_retrain = existing_model.get("model_version") != MODEL_VERSION
        if should_retrain:
            print("Existing model version is outdated. Retraining with the new scoring pipeline.")
        else:
            print(f"Model already exists at: {MODEL_PATH.resolve()}")

    if should_retrain:
        _, evaluation_df = train_and_save_model()
        print("\nSample evaluation predictions:")
        print(evaluation_df.head(10))

    print("\n=== Step 4: Load Model Without Retraining ===")
    model_bundle = load_model()
    print("Loaded model metrics:", model_bundle["metrics"])

    print("\n=== Step 5: Predict New Claims ===")
    new_claims = make_new_claim_examples()
    prediction_results = predict_claims(new_claims)
    print(prediction_results[
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
            "activity_validation_status",
            "activity_validation_score",
            "fraud_probability",
            "confidence_score",
            "failed_checks",
            "fraud_risk_score_0_to_10",
            "decision",
        ]
    ])


if __name__ == "__main__":
    main()
