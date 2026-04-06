from __future__ import annotations

import os
import pickle
from dataclasses import dataclass
from numbers import Integral
from pathlib import Path
from typing import Any, Mapping

import pandas as pd

from .features import FEATURE_COLUMNS, LABEL_MAP, FeatureSnapshot, feature_snapshot_to_dict
from .schemas import ModelProfile, SignalLabel

DEFAULT_MODEL_FILENAME = "tradewise_model.pkl"
DEFAULT_MODEL_ARTIFACT = Path(__file__).resolve().parents[2] / "artifacts" / DEFAULT_MODEL_FILENAME
MODEL_PROFILE_ENV_VARS: dict[ModelProfile, str] = {
    "safe": "ML_MODEL_ARTIFACT_SAFE",
    "neutral": "ML_MODEL_ARTIFACT_NEUTRAL",
    "risky": "ML_MODEL_ARTIFACT_RISKY",
}


@dataclass(frozen=True)
class ModelBundle:
    estimator: Any
    feature_columns: tuple[str, ...]
    label_map: dict[int, SignalLabel]
    model_version: str
    trained_at: str | None = None
    metadata: dict[str, Any] | None = None


@dataclass(frozen=True)
class ModelPrediction:
    signal: SignalLabel
    confidence: float
    model_version: str


def normalize_model_profile(raw_profile: str | None) -> ModelProfile | None:
    if raw_profile is None:
        return None

    profile = raw_profile.strip().lower()
    if profile in MODEL_PROFILE_ENV_VARS:
        return profile

    raise ValueError("Invalid model profile. Use safe, neutral, or risky.")


def get_model_artifact_path(profile: ModelProfile | None = None) -> Path:
    configured_path = None
    if profile is not None:
        configured_path = os.getenv(MODEL_PROFILE_ENV_VARS[profile])
    if not configured_path:
        configured_path = os.getenv("ML_MODEL_ARTIFACT")
    if not configured_path:
        return DEFAULT_MODEL_ARTIFACT

    path = Path(configured_path)
    if path.is_absolute():
        return path
    return Path(__file__).resolve().parents[2] / path


def save_model_bundle(
    payload: Mapping[str, Any] | ModelBundle,
    path: Path | None = None,
) -> Path:
    artifact_path = path or get_model_artifact_path()
    artifact_path.parent.mkdir(parents=True, exist_ok=True)
    with artifact_path.open("wb") as handle:
        pickle.dump(dict(payload.__dict__ if isinstance(payload, ModelBundle) else payload), handle)
    return artifact_path


def load_model_bundle(
    path: Path | None = None,
    profile: ModelProfile | None = None,
) -> ModelBundle | None:
    artifact_path = path or get_model_artifact_path(profile=profile)
    if not artifact_path.exists():
        return None

    try:
        with artifact_path.open("rb") as handle:
            payload = pickle.load(handle)
        return _coerce_bundle(payload)
    except Exception:  # pragma: no cover - defensive fallback for bad artifacts
        return None


def predict_signal(
    bundle: ModelBundle | None,
    features: FeatureSnapshot | Mapping[str, float],
) -> ModelPrediction | None:
    if bundle is None:
        return None

    try:
        row = pd.DataFrame([_normalize_features(features, bundle.feature_columns)])
    except Exception:
        return None

    estimator = bundle.estimator
    if not hasattr(estimator, "predict"):
        return None

    try:
        predicted = estimator.predict(row)[0]
        signal = bundle.label_map.get(_coerce_label_key(predicted))
        if signal not in {"bullish", "bearish", "neutral"}:
            return None
        confidence = _prediction_confidence(estimator, row)
    except Exception:
        return None

    return ModelPrediction(
        signal=signal,
        confidence=confidence,
        model_version=bundle.model_version,
    )


def _coerce_bundle(payload: Any) -> ModelBundle:
    if isinstance(payload, ModelBundle):
        return payload
    if not isinstance(payload, dict) or "estimator" not in payload:
        raise ValueError("Invalid model artifact.")

    feature_columns = tuple(payload.get("feature_columns", FEATURE_COLUMNS))
    label_map = dict(payload.get("label_map", LABEL_MAP))
    return ModelBundle(
        estimator=payload["estimator"],
        feature_columns=feature_columns,
        label_map=label_map,
        model_version=str(payload.get("model_version", "dev")),
        trained_at=payload.get("trained_at"),
        metadata=payload.get("metadata"),
    )


def _normalize_features(
    features: FeatureSnapshot | Mapping[str, float],
    feature_columns: tuple[str, ...],
) -> dict[str, float]:
    if isinstance(features, FeatureSnapshot):
        feature_dict = feature_snapshot_to_dict(features)
    else:
        feature_dict = dict(features)

    return {column: float(feature_dict[column]) for column in feature_columns}


def _coerce_label_key(predicted: Any) -> Any:
    if isinstance(predicted, Integral):
        return int(predicted)
    return predicted


def _prediction_confidence(estimator: Any, row: pd.DataFrame) -> float:
    if not hasattr(estimator, "predict_proba"):
        return 50.0

    probabilities = estimator.predict_proba(row)[0]
    confidence = float(max(probabilities) * 100.0)
    return round(max(0.0, min(100.0, confidence)), 1)
