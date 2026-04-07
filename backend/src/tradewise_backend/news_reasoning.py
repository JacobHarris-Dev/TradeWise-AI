from __future__ import annotations

from dataclasses import dataclass
from importlib import import_module
import os
import sys
from threading import Lock
from time import monotonic
from contextlib import nullcontext


DEFAULT_QWEN_MODEL_NAME = "Qwen/Qwen2.5-1.5B-Instruct"
DEFAULT_REASONING_CACHE_SECONDS = 120


@dataclass(frozen=True)
class ReasoningResult:
    text: str
    source: str


@dataclass
class _ReasoningCacheEntry:
    key: str
    text: str
    source: str
    cached_at: float


_MODEL_LOCK = Lock()
_REASONING_LOCK = Lock()
_REASONING_CACHE: dict[str, _ReasoningCacheEntry] = {}
_TOKENIZER = None
_MODEL = None


def _use_qwen_enabled() -> bool:
    raw = os.getenv("ML_NEWS_REPORT_USE_QWEN", "true").strip().lower()
    return raw not in {"0", "false", "off", "no"}


def _reasoning_cache_seconds() -> int:
    raw = os.getenv("ML_NEWS_REASONING_CACHE_SECONDS", str(DEFAULT_REASONING_CACHE_SECONDS)).strip()
    try:
        value = int(raw)
    except ValueError:
        return DEFAULT_REASONING_CACHE_SECONDS
    return max(0, value)


def _qwen_model_name() -> str:
    configured = os.getenv("ML_QWEN_MODEL_NAME", "").strip()
    return configured or DEFAULT_QWEN_MODEL_NAME


def _qwen_local_only() -> bool:
    raw = os.getenv("ML_QWEN_LOCAL_ONLY", "true").strip().lower()
    return raw not in {"0", "false", "off", "no"}


def _qwen_runtime_supported() -> bool:
    # The current transformers stack used by this backend is unreliable on 3.13+.
    # Fail fast so callers can immediately fall back to template reasoning.
    return sys.version_info < (3, 13)


def _qwen_device_map() -> str:
    """Detect available compute device and return appropriate device_map for transformers."""
    try:
        torch = import_module("torch")
        if torch.cuda.is_available():
            return "auto"
    except (ImportError, AttributeError):
        pass
    return "cpu"


def _template_reasoning(
    ticker: str,
    signal: str,
    confidence: float,
    sentiment: str | None,
    topics: list[str],
    headlines: list[str],
) -> str:
    topic_text = ", ".join(topics[:2]) if topics else "general market updates"
    headline_text = headlines[0] if headlines else "No fresh headline was available."
    sentiment_text = sentiment or "neutral"
    return (
        f"{ticker} in plain terms: the model leans {signal} ({confidence:.1f}% confidence). "
        f"News tone looks {sentiment_text}, mostly around {topic_text}. "
        f"Most important headline right now: {headline_text}."
    )


def _cache_key(
    ticker: str,
    signal: str,
    confidence: float,
    sentiment: str | None,
    topics: list[str],
    headlines: list[str],
) -> str:
    return "|".join(
        [
            ticker,
            signal,
            f"{confidence:.1f}",
            sentiment or "neutral",
            ",".join(topics[:3]),
            " || ".join(headlines[:3]),
        ]
    )


def _cached_reasoning(key: str, ttl_seconds: int) -> ReasoningResult | None:
    if ttl_seconds <= 0:
        return None
    now = monotonic()
    with _REASONING_LOCK:
        cached = _REASONING_CACHE.get(key)
        if cached is None:
            return None
        if (now - cached.cached_at) > ttl_seconds:
            return None
        return ReasoningResult(text=cached.text, source=cached.source)


def _store_cached_reasoning(key: str, text: str, source: str) -> None:
    with _REASONING_LOCK:
        _REASONING_CACHE[key] = _ReasoningCacheEntry(
            key=key,
            text=text,
            source=source,
            cached_at=monotonic(),
        )


def _load_qwen():
    global _TOKENIZER, _MODEL

    if _TOKENIZER is not None and _MODEL is not None:
        return _TOKENIZER, _MODEL

    try:
        transformers = import_module("transformers")
    except ImportError as exc:
        raise RuntimeError("transformers is not available.") from exc

    AutoTokenizer = getattr(transformers, "AutoTokenizer")
    AutoModelForCausalLM = getattr(transformers, "AutoModelForCausalLM")

    with _MODEL_LOCK:
        if _TOKENIZER is not None and _MODEL is not None:
            return _TOKENIZER, _MODEL

        model_name = _qwen_model_name()
        local_only = _qwen_local_only()
        device_map = _qwen_device_map()
        _TOKENIZER = AutoTokenizer.from_pretrained(model_name, local_files_only=local_only)
        _MODEL = AutoModelForCausalLM.from_pretrained(
            model_name,
            torch_dtype="auto",
            device_map=device_map,
            local_files_only=local_only,
        )
        return _TOKENIZER, _MODEL


def _qwen_reasoning(
    ticker: str,
    signal: str,
    confidence: float,
    sentiment: str | None,
    topics: list[str],
    headlines: list[str],
) -> ReasoningResult:
    if not _qwen_runtime_supported():
        return ReasoningResult(
            text=_template_reasoning(ticker, signal, confidence, sentiment, topics, headlines),
            source="template",
        )

    try:
        torch = import_module("torch")
    except ImportError:
        torch = None

    try:
        tokenizer, model = _load_qwen()

        headline_block = "\n".join([f"- {headline}" for headline in headlines[:3]]) or "- No headline available"
        topic_text = ", ".join(topics[:3]) if topics else "none"
        sentiment_text = sentiment or "neutral"

        prompt = (
            "You are a finance tutor for college students. "
            "Explain what today's headlines may mean in plain language with no jargon. "
            "Keep it short: 4-6 sentences, direct and practical.\n\n"
            f"Ticker: {ticker}\n"
            f"Model signal: {signal}\n"
            f"Model confidence: {confidence:.1f}%\n"
            f"News sentiment: {sentiment_text}\n"
            f"Topics: {topic_text}\n"
            "Headlines:\n"
            f"{headline_block}\n\n"
            "Student-friendly reasoning:"
        )

        inputs = tokenizer(prompt, return_tensors="pt", truncation=True, max_length=2048)
        with torch.no_grad() if torch is not None else nullcontext():
            output_ids = model.generate(
                **inputs,
                max_new_tokens=180,
                do_sample=False,
                temperature=0.2,
                pad_token_id=tokenizer.eos_token_id,
            )

        generated = tokenizer.decode(output_ids[0], skip_special_tokens=True)
        reasoning = generated[len(prompt):].strip() if generated.startswith(prompt) else generated.strip()
        if reasoning:
            return ReasoningResult(text=reasoning, source="qwen")
        return ReasoningResult(
            text=_template_reasoning(ticker, signal, confidence, sentiment, topics, headlines),
            source="template",
        )
    except Exception:
        return ReasoningResult(
            text=_template_reasoning(ticker, signal, confidence, sentiment, topics, headlines),
            source="template",
        )


def build_student_news_reasoning(
    ticker: str,
    signal: str,
    confidence: float,
    sentiment: str | None,
    topics: list[str],
    headlines: list[str],
    force_refresh: bool = False,
) -> ReasoningResult:
    key = _cache_key(ticker, signal, confidence, sentiment, topics, headlines)
    ttl = _reasoning_cache_seconds()

    if not force_refresh:
        cached = _cached_reasoning(key, ttl)
        if cached is not None:
            return cached

    if not _use_qwen_enabled():
        text = _template_reasoning(ticker, signal, confidence, sentiment, topics, headlines)
        _store_cached_reasoning(key, text, "template")
        return ReasoningResult(text=text, source="template")

    if not _qwen_runtime_supported():
        text = _template_reasoning(ticker, signal, confidence, sentiment, topics, headlines)
        _store_cached_reasoning(key, text, "template")
        return ReasoningResult(text=text, source="template")

    reasoning = _qwen_reasoning(ticker, signal, confidence, sentiment, topics, headlines)
    _store_cached_reasoning(key, reasoning.text, reasoning.source)
    return reasoning
