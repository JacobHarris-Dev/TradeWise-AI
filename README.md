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

## Split Machine Setup

You can run the web app and most of the backend on your MacBook, while the LLM
itself runs on your desktop PC.

Recommended wiring:

- MacBook runs `frontend/` and `backend/`
- Desktop PC runs only an OpenAI-compatible model server
- `backend/.env` points `ML_QWEN_REMOTE_BASE_URL` at the desktop server
- `frontend/.env.local` points `ML_BACKEND_URL` at the MacBook backend

Example:

```bash
# frontend/.env.local
ML_BACKEND_URL=http://192.168.1.50:8000

# backend/.env
ML_QWEN_REMOTE_BASE_URL=http://192.168.1.77:8001
ML_QWEN_REMOTE_API_KEY=your-key-if-needed
ML_QWEN_REMOTE_MODEL=Qwen/Qwen2.5-0.5B-Instruct
```

The backend will use the remote desktop model for chat when `ML_QWEN_REMOTE_BASE_URL`
is set. If the remote model is unavailable, it falls back to the local Qwen path
or the template reply, depending on your other env flags.

## Layout

- `frontend/app/api/ml/*`: Next route handlers that proxy browser requests to Python.
- `frontend/lib/stock-quote.ts`: client-facing quote fetch helper used by the Trade page.
- `backend/src/tradewise_backend`: FastAPI app, schema, and signal engine.

## Environment

- Frontend Firebase values stay in `frontend/.env.example`.
- Backend settings stay in `backend/.env.example`.
- The root `scripts/dev.mjs` loader also reads a root `.env` for compatibility with the current local setup.
- Training can use `yfinance` by default, while runtime market data can be switched to Alpaca with `ML_MARKET_DATA_PROVIDER=alpaca` plus Alpaca API credentials.

## Desktop LLM Server

The remote model server only needs to expose an OpenAI-compatible endpoint:
`POST /v1/chat/completions`.

That can be a local serving stack on the desktop such as vLLM, Ollama with an
OpenAI-compatible proxy, or another OpenAI-style inference server. The MacBook
backend will send the chat prompt to that endpoint and keep all other backend
logic local.

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

If you have a Hugging Face access token, you can pass it through the environment or the CLI:

```bash
export HF_TOKEN=your_token_here
python backend/training/download_hf_model.py
```

For faster downloads on supported machines, enable HF transfer acceleration:

```bash
python backend/training/download_hf_model.py --enable-hf-transfer
```

That flag works best after installing the optional transfer helper:

```bash
python -m pip install hf_transfer
```

The default model is `Qwen/Qwen2.5-0.5B-Instruct`.

Helpful options:

```bash
python backend/training/download_hf_model.py --tokenizer-only
python backend/training/download_hf_model.py --cache-dir .hf-cache
python backend/training/download_hf_model.py --model-name Qwen/Qwen2.5-0.5B-Instruct --device-map cpu
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
