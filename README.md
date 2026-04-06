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

## Hugging Face Setup

If you want to experiment with a local instruct model, the repo now includes a
download helper at `backend/training/download_hf_model.py`.

1. Install the backend dependencies:

```bash
python -m pip install -r backend/requirements.txt
```

2. Log in if the model requires it:

```bash
hf auth login
```

3. Download the default instruct model:

```bash
python backend/training/download_hf_model.py
```

The default model is `Qwen/Qwen2.5-1.5B-Instruct`.

Helpful options:

```bash
python backend/training/download_hf_model.py --tokenizer-only
python backend/training/download_hf_model.py --cache-dir .hf-cache
python backend/training/download_hf_model.py --model-name Qwen/Qwen2.5-1.5B-Instruct --device-map cpu
```

If you want the model to load on an NVIDIA GPU instead of CPU, install the CUDA
PyTorch wheel first:

```bash
python -m pip install --force-reinstall torch --index-url https://download.pytorch.org/whl/cu130
```

By default, Hugging Face stores downloads under `~/.cache/huggingface/` unless
you override the cache directory.

## News Context

TradeWise can now start blending recent stock headlines into the explanation
layer as supporting context.

- Live quote responses can include a short news summary, sentiment, and detected topics.
- `backend/src/tradewise_backend/news.py` pulls recent `yfinance` headlines and converts them into lightweight structured context.
- `backend/training/enrich_dataset_with_news.py` can enrich an existing CSV with `news_summary`, `news_sentiment`, `news_sentiment_score`, `news_topics`, and `news_headline_count`.

Example:

```bash
python backend/training/enrich_dataset_with_news.py --input-csv tradewise_training_dataset.csv
```

This first pass is intentionally simple: the trading signal still comes from the
quant model, while recent news is used as supporting explanation context.
For older historical CSVs, `yfinance` news often will not backfill many rows;
it is strongest for live explanations and MVP-quality recent context.
