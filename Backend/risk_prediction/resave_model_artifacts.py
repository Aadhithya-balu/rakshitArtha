from pathlib import Path

import joblib


BASE_DIR = Path(__file__).resolve().parent
MODEL_DIR = BASE_DIR / "model"


def resave_artifact(name: str):
    path = MODEL_DIR / name
    artifact = joblib.load(path)
    backup_path = MODEL_DIR / f"{name}.bak"
    if not backup_path.exists():
        joblib.dump(artifact, backup_path)
    joblib.dump(artifact, path)
    return str(path)


def main():
    artifacts = [
        "risk_model.pkl",
        "scaler.pkl",
        "label_encoder.pkl"
    ]
    for artifact in artifacts:
        saved = resave_artifact(artifact)
        print(f"Re-saved {saved}")


if __name__ == "__main__":
    main()
