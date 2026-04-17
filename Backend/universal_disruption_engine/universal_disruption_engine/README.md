# Delivery Prediction API

A FastAPI-based REST API that predicts delivery time using a machine learning model trained on environmental and traffic conditions.

## Requirements

- Python 3.8+
- fastapi
- uvicorn
- joblib
- numpy

Install dependencies:

```bash
pip install fastapi uvicorn joblib numpy
```

## Run the API

```bash
uvicorn app:app --reload
```

The API will be available at `http://127.0.0.1:8000`.

## Endpoints

### `GET /`

Health check.

**Response:**
```json
{"message": "Delivery Prediction API"}
```

---

### `GET /predict`

Predicts delivery time based on environmental and traffic inputs.

**Query Parameters:**

| Parameter     | Type  | Description                        |
|---------------|-------|------------------------------------|
| `rainfall`    | float | Rainfall in mm                     |
| `aqi`         | int   | Air Quality Index                  |
| `traffic`     | float | Traffic congestion level           |
| `humidity`    | int   | Humidity percentage                |
| `temperature` | float | Temperature in °C                  |

**Example Request:**

```
GET /predict?rainfall=5.2&aqi=80&traffic=3.5&humidity=70&temperature=28.0
```

**Example Response:**

```json
{"predicted_delivery_time": 42.5}
```

## Project Structure

```
K-means-api/
├── app.py                # FastAPI application
├── delivery_model.pkl    # Trained ML model
└── final_dataset2.csv    # Dataset used for training
```
