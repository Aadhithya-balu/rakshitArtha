# Automated Backend System

This is a fully autonomous claim processing system built with Node.js, Express, and MongoDB.

## Features
- **Hourly Automation**: Uses `node-cron` to trigger a processing cycle every hour.
- **Weather Detection**: Integrated with OpenWeatherMap (includes a mock fallback for demos).
- **Fraud Check**: Automated validation of user status and disruption data.
- **Claim & Payout**: Seamless generation of approved claims and simulated payouts.
- **Audit Logs**: Real-time logging of every automation step, accessible via API.

## Project Structure
- `controllers/`: Main automation and log logic.
- `models/`: Mongoose schemas for User, Claim, and Payouts.
- `services/`: Specialized logic for weather, loss calculation, fraud, and payouts.
- `cron/`: Scheduler configuration.
- `utils/`: Logger utility.
- `index.js`: Entry point.
- `seed.js`: Database initialization script.

## Setup Instructions

1.  **Start MongoDB**: Ensure your local MongoDB instance is running.
2.  **Environment Variables**: Update `.env` with your `MONGO_URI` and `WEATHER_API_KEY` (if available).
    - Add `AUTOMATION_SYNC_TOKEN` and use the same value in backend `AUTOMATION_SYNC_TOKEN`.
3.  **Install Dependencies**:
    ```bash
    npm install
    ```
4.  **Seed Data**:
    ```bash
    npm run seed
    ```
5.  **Start the System**:
    ```bash
    npm start
    ```

## API Endpoints
- `GET /logs`: See the latest automation activity.
- `GET /health`: Basic service health.
- `POST /api/v1/sync/users/upsert`: Idempotent user sync upsert (requires `x-sync-token` when configured).
- `POST /api/v1/sync/users/bulk-upsert`: Batch user sync endpoint.
- `GET /api/v1/sync/health`: Sync status + active user counters.

## Demo Tip
The system triggers an initial automation cycle immediately upon startup, so you can see it in action without waiting for the next cron interval.
