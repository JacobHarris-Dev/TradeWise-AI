# TradeWise-AI

TradeWise is split into two parts:

- `frontend/`: Next.js app, Firebase auth, dashboard, trade UI, and the same-origin ML proxy routes.
- `backend/`: Python FastAPI ML service powered by `numpy`, `pandas`, `matplotlib`, and `QuantLib`.

## Run It

```bash
npm run dev
```

That starts both services together:

- Frontend: `http://localhost:3000`
- Backend: `http://127.0.0.1:8000`

## Layout

- `frontend/app/api/ml/*`: Next route handlers that proxy browser requests to Python.
- `frontend/lib/stock-quote.ts`: client-facing quote fetch helper used by the Trade page.
- `backend/src/tradewise_backend`: FastAPI app, schema, and signal engine.

## Environment

- Frontend Firebase values stay in `frontend/.env.example`.
- Backend settings stay in `backend/.env.example`.
- The root `scripts/dev.mjs` loader also reads a root `.env` for compatibility with the current local setup.
- Training can use `yfinance` by default, while runtime market data can be switched to Alpaca with `ML_MARKET_DATA_PROVIDER=alpaca` plus Alpaca API credentials.

## Model Training

The training entry point lives at `backend/training/trained_model.py`. `backend/training/train_model.py` now forwards to the same implementation so existing commands still work.

Examples:

```bash
python backend/training/trained_model.py --provider yfinance --interval 1d --period 1y
python backend/training/trained_model.py --provider alpaca --interval 15m --alpaca-feed delayed_sip
python backend/training/trained_model.py --dataset-csv tradewise_training_dataset.csv
```

Practical default:

- Use `yfinance` for historical training and experimentation.
- Use Alpaca with `--interval 15m --alpaca-feed delayed_sip` when you want the model to train on the same delayed intraday bar shape you expect during market hours.
- `yfinance` intraday intervals are limited to roughly the last 60 days, so the training script automatically caps open-ended intraday downloads to that window.
- `tradewise_training_dataset.csv` can now be used directly for training; the script translates its engineered columns into the runtime feature set used by the API.
