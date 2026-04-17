from flask import Flask, jsonify, request

from src.data_generation import load_dataset
from src.predict import predict_claims, predict_single_claim


def build_dashboard_payload():
    dataset = load_dataset()
    predictions = predict_claims(dataset)
    return {
        "fraud_rate": round(float(dataset["fraud_label"].mean()), 3),
        "risk_distribution": {
            "approve": int((predictions["decision"] == "APPROVE").sum()),
            "reject": int((predictions["decision"] == "REJECT").sum()),
        },
        "claims_outcome": predictions["decision"].value_counts().to_dict(),
        "high_risk_above_threshold": int((predictions["above_dynamic_threshold"] == "YES").sum()),
    }


def create_app():
    app = Flask(__name__)

    @app.route("/predict", methods=["POST"])
    def predict():
        data = request.get_json(force=True, silent=False) or {}
        result = predict_single_claim(data)
        response = {
            "risk_score": round(float(result["fraud_risk_score_0_to_10"]), 2),
            "decision": result["decision"],
            "confidence_score": round(float(result["confidence_score"]), 3),
            "confidence_level": result["confidence_level"],
            "failed_checks": int(result["failed_checks"]),
            "failed_check_reasons": result["failed_check_reasons"],
            "activity_validation_status": result["activity_validation_status"],
            "activity_validation_score": float(result["activity_validation_score"]),
            "activity_validation_reasons": result["activity_validation_reasons"],
            "anomaly_flag": result["anomaly_flag"],
            "above_dynamic_threshold": result["above_dynamic_threshold"],
            "gps_spoof_flag": int(result["gps_spoof_flag"]),
            "passive_presence_flag": int(result["passive_presence_flag"]),
            "duplicate_claim_flag": int(result["duplicate_claim_flag"]),
            "time_pattern_flag": int(result["time_pattern_flag"]),
        }
        return jsonify(response)

    @app.route("/dashboard", methods=["GET"])
    def dashboard():
        return jsonify(build_dashboard_payload())

    return app


app = create_app()


if __name__ == "__main__":
    app.run(debug=False)
