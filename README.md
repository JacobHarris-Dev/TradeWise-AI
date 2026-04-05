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
