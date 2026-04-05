"""TradeWise ML backend package."""

from __future__ import annotations

from os import getenv, environ
from pathlib import Path


def _load_local_env() -> None:
    env_path = Path(__file__).resolve().parents[2] / ".env"
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        environ.setdefault(key.strip(), value.strip())


_load_local_env()

MODEL_VERSION = getenv("ML_MODEL_VERSION", "dev")
