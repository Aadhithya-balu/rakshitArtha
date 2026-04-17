from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.routes import router
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

app = FastAPI(
    title="Risk Prediction API",
    description="ML-based risk prediction service for parametric insurance",
    version="1.0.0"
)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routes
app.include_router(router)

# Health check
@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "Risk Prediction API",
        "version": "1.0.0"
    }

# Root endpoint
@app.get("/")
def root():
    return {
        "message": "Risk Prediction API v1.0.0",
        "endpoints": {
            "docs": "/docs",
            "health": "/health",
            "predict": "/api/predict",
            "predict_risk": "/api/predict-risk",
            "predict_future_risk": "/api/predict-future-risk",
            "trigger_analysis": "/api/trigger-analysis"
        }
    }
