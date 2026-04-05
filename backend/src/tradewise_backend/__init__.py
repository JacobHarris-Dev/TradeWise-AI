"""TradeWise ML backend package."""

from os import getenv

MODEL_VERSION = getenv("ML_MODEL_VERSION", "dev")
