from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass
from importlib import import_module
from threading import Lock
from time import monotonic
from contextlib import nullcontext
from typing import Any, Literal

import httpx


DEFAULT_QWEN_MODEL_NAME = "Qwen/Qwen2.5-0.5B-Instruct"
DEFAULT_REASONING_CACHE_SECONDS = 120
DEFAULT_MARKET_BRIEF_CACHE_SECONDS = 300
DEFAULT_PORTFOLIO_COACH_CACHE_SECONDS = 600
DEFAULT_INVESTMENT_CHAT_CACHE_SECONDS = 180
DEFAULT_INVESTMENT_CHAT_MAX_NEW_TOKENS = 72
DEFAULT_REMOTE_LLM_TIMEOUT_SECONDS = 60.0
DEFAULT_REMOTE_LLM_MODEL_SELECTION = "auto"
DEFAULT_REMOTE_SIMPLE_MODEL_SELECTION = "smallest"
DEFAULT_REMOTE_COMPLEX_MODEL_SELECTION = "largest"
DEFAULT_REMOTE_LLM_KEEP_ALIVE = "15m"


@dataclass(frozen=True)
class ReasoningResult:
    text: str
    source: Literal["qwen", "template", "remote-llm"]
    action: Literal["buy", "sell", "hold"] | None = None


@dataclass
class _ReasoningCacheEntry:
    key: str
    text: str
    source: Literal["qwen", "template", "remote-llm"]
    action: Literal["buy", "sell", "hold"] | None
    cached_at: float


_MODEL_LOCK = Lock()
_REASONING_LOCK = Lock()
_REASONING_CACHE: dict[str, _ReasoningCacheEntry] = {}
_TOKENIZER = None
_MODEL = None
_REMOTE_LLM_PROVIDER: str | None = None
_REMOTE_LLM_CLIENT = httpx.Client()
_LOGGER = logging.getLogger("tradewise_backend.news_reasoning")


def _use_qwen_enabled() -> bool:
    raw = os.getenv("ML_NEWS_REPORT_USE_QWEN", "true").strip().lower()
    return raw not in {"0", "false", "off", "no"}


def _cache_seconds(env_key: str, default: int) -> int:
    raw = os.getenv(env_key, str(default)).strip()
    try:
        value = int(raw)
    except ValueError:
        return default
    return max(0, value)


def _reasoning_cache_seconds() -> int:
    return _cache_seconds(
        "ML_NEWS_REASONING_CACHE_SECONDS",
        DEFAULT_REASONING_CACHE_SECONDS,
    )


def _market_brief_cache_seconds() -> int:
    return _cache_seconds(
        "ML_MARKET_BRIEF_CACHE_SECONDS",
        DEFAULT_MARKET_BRIEF_CACHE_SECONDS,
    )


def _portfolio_coach_cache_seconds() -> int:
    return _cache_seconds(
        "ML_PORTFOLIO_COACH_CACHE_SECONDS",
        DEFAULT_PORTFOLIO_COACH_CACHE_SECONDS,
    )


def _investment_chat_cache_seconds() -> int:
    return _cache_seconds(
        "ML_INVESTMENT_CHAT_CACHE_SECONDS",
        DEFAULT_INVESTMENT_CHAT_CACHE_SECONDS,
    )


def _qwen_model_name() -> str:
    configured = os.getenv("ML_QWEN_MODEL_NAME", "").strip()
    return configured or DEFAULT_QWEN_MODEL_NAME


def _qwen_local_only() -> bool:
    raw = os.getenv("ML_QWEN_LOCAL_ONLY", "true").strip().lower()
    return raw not in {"0", "false", "off", "no"}


def _qwen_runtime_supported() -> bool:
    return True


def _qwen_device_map() -> str:
    """Detect available compute device and return appropriate device_map for transformers."""
    try:
        torch = import_module("torch")
        if torch.cuda.is_available():
            return "auto"
    except (ImportError, AttributeError):
        pass
    return "cpu"


def _qwen_allow_cpu() -> bool:
    raw = os.getenv("ML_QWEN_ALLOW_CPU", "false").strip().lower()
    return raw in {"1", "true", "on", "yes"}


def _qwen_allow_chat_cpu() -> bool:
    raw = os.getenv("ML_QWEN_ALLOW_CHAT_CPU", "true").strip().lower()
    return raw not in {"0", "false", "off", "no"}


def _qwen_can_run_in_current_env() -> bool:
    # The 1.5B instruct model is too slow for the default CPU-only dev path.
    # Unless explicitly opted in, use template reasoning instead of letting
    # request handlers stall for minutes or appear to crash locally.
    device_map = _qwen_device_map()
    if device_map == "cpu" and not _qwen_allow_cpu():
        return False
    return True


def _qwen_can_run_chat_in_current_env() -> bool:
    device_map = _qwen_device_map()
    if device_map == "cpu" and not (_qwen_allow_cpu() or _qwen_allow_chat_cpu()):
        return False
    return True


def _investment_chat_max_new_tokens() -> int:
    raw = os.getenv(
        "ML_QWEN_INVESTMENT_CHAT_MAX_NEW_TOKENS",
        str(DEFAULT_INVESTMENT_CHAT_MAX_NEW_TOKENS),
    ).strip()
    try:
        value = int(raw)
    except ValueError:
        return DEFAULT_INVESTMENT_CHAT_MAX_NEW_TOKENS
    return max(16, min(value, 96))


def _qwen_quantize_cpu_enabled() -> bool:
    raw = os.getenv("ML_QWEN_QUANTIZE_CPU", "true").strip().lower()
    return raw not in {"0", "false", "off", "no"}


def _remote_llm_base_url() -> str:
    return os.getenv("ML_QWEN_REMOTE_BASE_URL", "").strip()


def _remote_llm_api_key() -> str:
    return os.getenv("ML_QWEN_REMOTE_API_KEY", "").strip()


def _remote_task_complexity(task: str) -> str:
    if task in {"trade_reasoning", "investment_chat"}:
        return "complex"
    return "simple"


def _remote_llm_provider() -> str:
    global _REMOTE_LLM_PROVIDER
    if _REMOTE_LLM_PROVIDER is not None:
        return _REMOTE_LLM_PROVIDER

    configured = os.getenv("ML_QWEN_REMOTE_PROVIDER", "").strip().lower()
    if configured in {"ollama", "openai", "openai-compatible"}:
        _REMOTE_LLM_PROVIDER = configured
        return configured

    if not _remote_llm_enabled():
        _REMOTE_LLM_PROVIDER = "ollama"
        return _REMOTE_LLM_PROVIDER

    try:
        _ollama_available_models()
        _REMOTE_LLM_PROVIDER = "ollama"
    except Exception:
        _REMOTE_LLM_PROVIDER = "openai-compatible"

    return _REMOTE_LLM_PROVIDER


def _remote_llm_headers() -> dict[str, str]:
    headers: dict[str, str] = {"content-type": "application/json"}
    api_key = _remote_llm_api_key()
    if api_key:
        headers["authorization"] = f"Bearer {api_key}"
    return headers


def _ollama_available_models() -> list[dict[str, Any]]:
    base_url = _remote_llm_base_url().rstrip("/")
    if not base_url:
        raise RuntimeError("Remote LLM base URL is not configured.")

    response = _REMOTE_LLM_CLIENT.get(
        f"{base_url}/api/tags",
        headers=_remote_llm_headers(),
        timeout=min(_remote_llm_timeout_seconds(), 10.0),
    )
    response.raise_for_status()
    data = response.json()
    models = data.get("models")
    if not isinstance(models, list):
        raise RuntimeError("Ollama returned an invalid model list.")
    return [model for model in models if isinstance(model, dict)]


def _ollama_model_name(entry: dict[str, Any]) -> str:
    for key in ("name", "model"):
        value = entry.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def _ollama_model_size(entry: dict[str, Any]) -> int:
    value = entry.get("size")
    if isinstance(value, bool):
        return 0
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    return 0


def _select_ollama_model_name(
    models: list[tuple[str, int]],
    selection: str,
) -> str:
    normalized = selection.strip().lower()
    if not models:
        return _qwen_model_name()

    if normalized not in {"", "auto", "smallest", "largest"}:
        return selection.strip()

    qwen_models = [item for item in models if "qwen" in item[0].lower()]
    candidates = qwen_models or models
    if not candidates:
        return _qwen_model_name()

    if normalized in {"largest"}:
        candidates.sort(key=lambda item: (item[1], item[0].lower()), reverse=True)
    else:
        candidates.sort(key=lambda item: (item[1], item[0].lower()))
    return candidates[0][0]


def _preferred_ollama_model_name(selection: str = DEFAULT_REMOTE_LLM_MODEL_SELECTION) -> str:
    try:
        models = _ollama_available_models()
    except Exception:
        return _qwen_model_name()

    named_models: list[tuple[str, int]] = []
    for model in models:
        name = _ollama_model_name(model)
        if not name:
            continue
        named_models.append((name, _ollama_model_size(model)))

    if not named_models:
        return _qwen_model_name()
    return _select_ollama_model_name(named_models, selection)


def _remote_llm_model_selection(task: str) -> str:
    task_key = task.strip().upper()
    per_task = os.getenv(f"ML_QWEN_REMOTE_MODEL_{task_key}", "").strip()
    if per_task:
        return per_task

    complexity = _remote_task_complexity(task)
    if complexity == "complex":
        configured = os.getenv("ML_QWEN_REMOTE_MODEL_COMPLEX", "").strip()
        if configured:
            return configured
        default = DEFAULT_REMOTE_COMPLEX_MODEL_SELECTION
    else:
        configured = os.getenv("ML_QWEN_REMOTE_MODEL_SIMPLE", "").strip()
        if configured:
            return configured
        default = DEFAULT_REMOTE_SIMPLE_MODEL_SELECTION

    base = os.getenv("ML_QWEN_REMOTE_MODEL", "").strip()
    if not base:
        return default
    if base.lower() == "auto":
        return default
    return base


def _remote_llm_model_name(task: str = "default") -> str:
    selection = _remote_llm_model_selection(task)
    if _remote_llm_provider() == "ollama":
        return _preferred_ollama_model_name(selection)
    if selection.lower() not in {"auto", "smallest", "largest"}:
        return selection
    return _qwen_model_name()


def _remote_llm_timeout_seconds() -> float:
    raw = os.getenv(
        "ML_QWEN_REMOTE_TIMEOUT_SECONDS",
        str(DEFAULT_REMOTE_LLM_TIMEOUT_SECONDS),
    ).strip()
    try:
        value = float(raw)
    except ValueError:
        return DEFAULT_REMOTE_LLM_TIMEOUT_SECONDS
    return max(1.0, min(value, 300.0))


def _remote_llm_keep_alive() -> str | None:
    raw = os.getenv(
        "ML_QWEN_REMOTE_KEEP_ALIVE",
        DEFAULT_REMOTE_LLM_KEEP_ALIVE,
    ).strip()
    return raw or None


def _remote_llm_enabled() -> bool:
    return bool(_remote_llm_base_url())


def _log_qwen_route(
    *,
    task: str,
    source: str,
    status: str,
    model_name: str | None = None,
    provider: str | None = None,
    detail: str | None = None,
) -> None:
    message = (
        f"task={task} source={source} status={status}"
        f"{f' provider={provider}' if provider else ''}"
        f"{f' model={model_name}' if model_name else ''}"
        f"{f' detail={detail}' if detail else ''}"
    )
    if status == "failed":
        _LOGGER.warning("Qwen routing %s", message)
        return
    _LOGGER.info("Qwen routing %s", message)


def _should_skip_local_qwen() -> bool:
    return _remote_llm_enabled()


def _ollama_chat_completion(
    *,
    prompt: str,
    system_prompt: str,
    max_new_tokens: int,
    task: str,
    model_name: str,
) -> str:
    base_url = _remote_llm_base_url().rstrip("/")
    if not base_url:
        raise RuntimeError("Remote LLM base URL is not configured.")

    payload: dict[str, Any] = {
        "model": model_name,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt},
        ],
        "stream": False,
        "options": {
            "temperature": 0,
            "num_predict": max_new_tokens,
        },
    }
    keep_alive = _remote_llm_keep_alive()
    if keep_alive:
        payload["keep_alive"] = keep_alive

    response = _REMOTE_LLM_CLIENT.post(
        f"{base_url}/api/chat",
        json=payload,
        headers=_remote_llm_headers(),
        timeout=_remote_llm_timeout_seconds(),
    )
    response.raise_for_status()
    data = response.json()
    message = data.get("message") or {}
    content = message.get("content")
    if not isinstance(content, str) or not content.strip():
        raise RuntimeError("Ollama returned an empty message.")
    return content.strip()


def _openai_chat_completion(
    *,
    prompt: str,
    system_prompt: str,
    max_new_tokens: int,
    task: str,
    model_name: str,
) -> str:
    base_url = _remote_llm_base_url().rstrip("/")
    if not base_url:
        raise RuntimeError("Remote LLM base URL is not configured.")

    payload: dict[str, Any] = {
        "model": model_name,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0,
        "max_tokens": max_new_tokens,
    }

    response = _REMOTE_LLM_CLIENT.post(
        f"{base_url}/v1/chat/completions",
        json=payload,
        headers=_remote_llm_headers(),
        timeout=_remote_llm_timeout_seconds(),
    )
    response.raise_for_status()
    data = response.json()
    choices = data.get("choices") or []
    if not choices:
        raise RuntimeError("Remote LLM returned no choices.")
    message = choices[0].get("message") or {}
    content = message.get("content")
    if not isinstance(content, str) or not content.strip():
        raise RuntimeError("Remote LLM returned an empty message.")
    return content.strip()


def _remote_chat_completion(
    *,
    prompt: str,
    system_prompt: str,
    max_new_tokens: int,
    task: str,
) -> str:
    provider = _remote_llm_provider()
    model_name = _remote_llm_model_name(task)
    try:
        if provider == "ollama":
            response = _ollama_chat_completion(
                prompt=prompt,
                system_prompt=system_prompt,
                max_new_tokens=max_new_tokens,
                task=task,
                model_name=model_name,
            )
        else:
            response = _openai_chat_completion(
                prompt=prompt,
                system_prompt=system_prompt,
                max_new_tokens=max_new_tokens,
                task=task,
                model_name=model_name,
            )
    except Exception as exc:
        _log_qwen_route(
            task=task,
            source="remote-llm",
            status="failed",
            provider=provider,
            model_name=model_name,
            detail=exc.__class__.__name__,
        )
        raise
    _log_qwen_route(
        task=task,
        source="remote-llm",
        status="served",
        provider=provider,
        model_name=model_name,
    )
    return response


def _chat_completion_with_fallback(
    *,
    system_prompt: str,
    prompt: str,
    max_new_tokens: int,
    template_text: str,
    task: str,
) -> ReasoningResult:
    if _remote_llm_enabled():
        try:
            reply = _remote_chat_completion(
                prompt=prompt,
                system_prompt=system_prompt,
                max_new_tokens=max_new_tokens,
                task=task,
            )
            if reply:
                return ReasoningResult(text=reply, source="remote-llm")
        except Exception:
            return ReasoningResult(text=template_text, source="template")

    if (
        not _use_qwen_enabled()
        or not _qwen_runtime_supported()
        or not _qwen_can_run_chat_in_current_env()
    ):
        return ReasoningResult(text=template_text, source="template")

    try:
        torch = import_module("torch")
    except ImportError:
        torch = None

    try:
        tokenizer, model = _load_qwen()
        full_prompt = f"{system_prompt}\n\n{prompt}"
        inputs = tokenizer(full_prompt, return_tensors="pt", truncation=True, max_length=2048)
        with torch.no_grad() if torch is not None else nullcontext():
            output_ids = model.generate(
                **inputs,
                max_new_tokens=max_new_tokens,
                do_sample=False,
                pad_token_id=tokenizer.eos_token_id,
            )

        generated = tokenizer.decode(output_ids[0], skip_special_tokens=True)
        reply = generated[len(full_prompt):].strip() if generated.startswith(full_prompt) else generated.strip()
        if reply:
            return ReasoningResult(text=reply, source="qwen")
    except Exception:
        pass

    return ReasoningResult(text=template_text, source="template")


def _normalize_sentiment(sentiment: str | None) -> str:
    if sentiment in {"positive", "negative", "neutral"}:
        return sentiment
    return "neutral"


def _recommended_trade_action(
    *,
    signal: str,
    confidence: float,
    sentiment: str | None,
    change_percent: float,
    momentum: float,
    short_moving_average: float,
    long_moving_average: float,
) -> Literal["buy", "sell", "hold"]:
    normalized_sentiment = _normalize_sentiment(sentiment)
    trend_up = short_moving_average >= long_moving_average and momentum >= -0.0025
    trend_down = short_moving_average < long_moving_average and momentum <= 0.0025

    if signal == "bullish":
        return "buy"
    if signal == "bearish":
        return "sell"

    if normalized_sentiment == "positive" and (trend_up or change_percent >= -0.5):
        return "buy"
    if normalized_sentiment == "negative" and (trend_down or change_percent <= 0.5):
        return "sell"

    if trend_up and change_percent >= -0.75:
        return "buy"
    if trend_down and change_percent <= 0.75:
        return "sell"

    if (
        confidence < 54.0
        and normalized_sentiment == "neutral"
        and abs(change_percent) < 0.6
        and abs(momentum) < 0.01
    ):
        return "hold"

    return "buy" if change_percent >= 0 else "sell"


def _template_reasoning(
    ticker: str,
    action: Literal["buy", "sell", "hold"],
    signal: str,
    confidence: float,
    sentiment: str | None,
    change_percent: float,
    momentum: float,
    short_moving_average: float,
    long_moving_average: float,
    topics: list[str],
    headlines: list[str],
) -> str:
    trend_direction = "up" if short_moving_average >= long_moving_average else "down"
    move_text = f"{change_percent:+.2f}%"
    momentum_text = f"{momentum * 100:+.1f}%"
    topic_text = ", ".join(topics[:2]) if topics else "general market updates"
    headline_text = headlines[0] if headlines else "No fresh headline was available."
    sentiment_text = _normalize_sentiment(sentiment)

    if action == "buy":
        return (
            f"Buy {ticker} here because TradeWise sees more upside support than downside risk right now. "
            f"The model still leans {signal} at {confidence:.1f}% confidence, the short trend is {trend_direction}, the latest move is {move_text}, and recent momentum is {momentum_text}. "
            f"News tone is {sentiment_text} around {topic_text}, so the main headline to watch is: {headline_text}."
        )
    if action == "sell":
        return (
            f"Sell or trim {ticker} here because protecting capital looks cleaner than pressing for more upside right now. "
            f"The model leans {signal} at {confidence:.1f}% confidence, the short trend is {trend_direction}, the latest move is {move_text}, and recent momentum is {momentum_text}. "
            f"News tone is {sentiment_text} around {topic_text}, so the main headline to watch is: {headline_text}."
        )
    return (
        f"Hold {ticker} for now because the setup is genuinely mixed and TradeWise does not have a clean edge for a buy or sell yet. "
        f"The model is only {confidence:.1f}% confident, the short trend is {trend_direction}, the latest move is {move_text}, and recent momentum is {momentum_text}. "
        f"News tone is {sentiment_text} around {topic_text}, and the headline most worth watching is: {headline_text}."
    )


def _template_market_brief(
    summary: str | None,
    sentiment: str,
    topics: list[str],
    headlines: list[str],
) -> str:
    lead = summary or "Markets are moving, but the backdrop is mixed."
    topic_text = ", ".join(topics[:2]) if topics else "broad market drivers"
    headline_text = headlines[0] if headlines else "No standout headline was available."
    return (
        f"{lead} The current tone looks {sentiment}, with the biggest focus on {topic_text}. "
        f"The main headline to watch is about {headline_text}."
    )


def _normalize_student_brief_text(text: str, fallback_text: str, max_sentences: int = 3) -> str:
    cleaned = re.sub(r"[ \t]*\n+[ \t]*", " ", text).strip()
    cleaned = cleaned.replace("**", "").replace("__", "")
    cleaned = re.sub(r"#+\s*", "", cleaned)
    cleaned = re.sub(r"\s{2,}", " ", cleaned)

    sentences = re.split(r"(?<=[.!?])\s+", cleaned)
    kept: list[str] = []
    for sentence in sentences:
        candidate = sentence.strip(" -*•")
        if not candidate:
            continue
        lowered = candidate.lower().strip(":")
        if lowered in {"market brief", "overview", "brief"}:
            continue
        if lowered.startswith("topics") or lowered.startswith("headlines"):
            continue
        kept.append(candidate)
        if len(kept) >= max_sentences:
            break

    normalized = " ".join(kept).strip()
    if not normalized:
        return fallback_text
    return normalized


def _normalize_investment_chat_text(
    text: str,
    fallback_text: str,
    *,
    max_sentences: int = 3,
) -> str:
    cleaned = re.sub(r"[ \t]*\n+[ \t]*", " ", text).strip()
    cleaned = cleaned.replace("**", "").replace("__", "")
    cleaned = re.sub(r"#+\s*", "", cleaned)
    cleaned = re.sub(r"\s{2,}", " ", cleaned)

    sentences = re.split(r"(?<=[.!?])\s+", cleaned)
    kept: list[str] = []
    for sentence in sentences:
        candidate = sentence.strip(" -*•")
        if not candidate:
            continue
        kept.append(candidate)
        if len(kept) >= max_sentences:
            break

    normalized = " ".join(kept).strip()
    return normalized or fallback_text


def _template_portfolio_coach(
    *,
    cash: float,
    total_equity: float,
    day_change_percent: float,
    positions: list[dict[str, Any]],
) -> str:
    if not positions:
        return (
            f"Your paper account is all cash right now at ${cash:.2f}. "
            "That keeps risk low, but you will need to open positions to learn how the portfolio behaves in live conditions."
        )

    largest = max(positions, key=lambda item: float(item.get("marketValue", 0.0)))
    largest_ticker = str(largest.get("ticker", "your largest holding"))
    return (
        f"Your paper account is worth ${total_equity:.2f} and is currently {'up' if day_change_percent >= 0 else 'down'} "
        f"{abs(day_change_percent):.2f}%. "
        f"{largest_ticker} is your largest holding, so that position has the biggest influence on your results. "
        f"Cash on hand is ${cash:.2f}, which sets how much flexibility you have for the next move."
    )


def _bucketed_value(value: float, step: float) -> str:
    if step <= 0:
        return f"{value:.2f}"
    bucket = round(value / step) * step
    return f"{bucket:.2f}"


def _cache_key(
    ticker: str,
    action: Literal["buy", "sell", "hold"],
    signal: str,
    confidence: float,
    sentiment: str | None,
    change_percent: float,
    momentum: float,
    trend_direction: str,
    topics: list[str],
    headlines: list[str],
) -> str:
    return "|".join(
        [
            ticker,
            action,
            signal,
            f"{confidence:.1f}",
            sentiment or "neutral",
            f"{change_percent:.2f}",
            f"{momentum:.4f}",
            trend_direction,
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
        return ReasoningResult(text=cached.text, source=cached.source, action=cached.action)


def _store_cached_reasoning(
    key: str,
    text: str,
    source: Literal["qwen", "template", "remote-llm"],
    action: Literal["buy", "sell", "hold"] | None = None,
) -> None:
    with _REASONING_LOCK:
        _REASONING_CACHE[key] = _ReasoningCacheEntry(
            key=key,
            text=text,
            source=source,
            action=action,
            cached_at=monotonic(),
        )


def build_market_news_brief(
    *,
    summary: str | None,
    sentiment: str,
    topics: list[str],
    headlines: list[str],
    force_refresh: bool = False,
) -> ReasoningResult:
    key = "|".join(
        [
            "market-brief",
            summary or "",
            sentiment,
            ",".join(topics[:3]),
            " || ".join(headlines[:3]),
        ]
    )
    ttl = _market_brief_cache_seconds()
    if not force_refresh:
        cached = _cached_reasoning(key, ttl)
        if cached is not None:
            return cached

    template_text = _template_market_brief(summary, sentiment, topics, headlines)
    topic_text = ", ".join(topics[:3]) if topics else "none"
    headline_block = "\n".join(f"- {headline}" for headline in headlines[:4]) or "- No headline available"
    prompt = (
        "Write a short market brief for a college student in exactly 3 short sentences. "
        "Keep it plain English, practical, and focused on what matters today. "
        "Do not use markdown, bullets, labels, or section headers. "
        "Explain what the headlines mean instead of listing them back word-for-word.\n\n"
        f"Market summary: {summary or 'No summary available'}\n"
        f"Sentiment: {sentiment}\n"
        f"Topics: {topic_text}\n"
        f"Headlines:\n{headline_block}\n\n"
        "Brief:"
    )
    result = _chat_completion_with_fallback(
        system_prompt="You are a concise market brief writer for beginner investors.",
        prompt=prompt,
        max_new_tokens=120,
        template_text=template_text,
        task="market_brief",
    )
    normalized_text = _normalize_student_brief_text(result.text, template_text)
    _store_cached_reasoning(key, normalized_text, result.source)
    return ReasoningResult(text=normalized_text, source=result.source)


def build_portfolio_coach_reply(
    *,
    cash: float,
    total_equity: float,
    day_change_percent: float,
    positions: list[dict[str, Any]],
    force_refresh: bool = False,
) -> ReasoningResult:
    serialized_positions = [
        {
            "ticker": str(item.get("ticker", "")),
            "shares": float(item.get("shares", 0.0)),
            "marketValue": float(item.get("marketValue", 0.0)),
            "changePercent": float(item.get("changePercent", 0.0) or 0.0),
        }
        for item in positions[:5]
    ]
    key = "|".join(
        [
            "portfolio-coach-v4",
            _bucketed_value(cash, 25.0),
            _bucketed_value(total_equity, 25.0),
            _bucketed_value(day_change_percent, 0.25),
            ";".join(
                f"{item['ticker']}:{item['shares']}:{_bucketed_value(item['marketValue'], 25.0)}:{_bucketed_value(item['changePercent'], 0.25)}"
                for item in serialized_positions
            ),
        ]
    )
    ttl = _portfolio_coach_cache_seconds()
    if not force_refresh:
        cached = _cached_reasoning(key, ttl)
        if cached is not None:
            return cached

    template_text = _template_portfolio_coach(
        cash=cash,
        total_equity=total_equity,
        day_change_percent=day_change_percent,
        positions=serialized_positions,
    )

    if serialized_positions:
        positions_block = "\n".join(
            (
                f"- {item['ticker']}: shares={item['shares']:.0f}, "
                f"market_value=${item['marketValue']:.2f}, change={item['changePercent']:.2f}%"
            )
            for item in serialized_positions
        )
    else:
        positions_block = "- No open positions. The account is fully in cash."

    prompt = (
        "Write a portfolio coach note for a student investor in exactly 3 sentences. "
        "Mention concentration, cash flexibility, and one practical risk observation. "
        "If there are no open positions, explain what staying fully in cash means for risk and learning instead of discussing concentration in holdings. "
        "Do not give guarantees or tell the user to buy specific securities. "
        "Use only the numbers provided below and do not invent targets, thresholds, or allocations. "
        "Avoid repeating exact dollar amounts unless they materially help the explanation.\n\n"
        f"Cash: ${cash:.2f}\n"
        f"Total equity: ${total_equity:.2f}\n"
        f"Portfolio change percent: {day_change_percent:.2f}%\n"
        f"Positions:\n{positions_block}\n\n"
        "Coach note:"
    )
    result = _chat_completion_with_fallback(
        system_prompt="You are a concise portfolio coach for beginner investors.",
        prompt=prompt,
        max_new_tokens=140,
        template_text=template_text,
        task="portfolio_coach",
    )
    _store_cached_reasoning(key, result.text, result.source)
    return result


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
        if device_map == "cpu" and _qwen_quantize_cpu_enabled():
            try:
                torch = import_module("torch")
                _MODEL = torch.quantization.quantize_dynamic(
                    _MODEL,
                    {torch.nn.Linear},
                    dtype=torch.qint8,
                )
            except Exception:
                pass
        return _TOKENIZER, _MODEL


def _qwen_reasoning(
    ticker: str,
    action: Literal["buy", "sell", "hold"],
    signal: str,
    confidence: float,
    sentiment: str | None,
    change_percent: float,
    momentum: float,
    short_moving_average: float,
    long_moving_average: float,
    topics: list[str],
    headlines: list[str],
) -> ReasoningResult:
    headline_block = "\n".join([f"- {headline}" for headline in headlines[:3]]) or "- No headline available"
    topic_text = ", ".join(topics[:3]) if topics else "none"
    sentiment_text = _normalize_sentiment(sentiment)
    trend_direction = "up" if short_moving_average >= long_moving_average else "down"
    decision_label = action.upper()
    prompt = (
        "You are TradeWise AI, explaining one trading decision to a beginner. "
        "Use exactly 3 sentences. "
        "Sentence 1 must start with the decision word itself: Buy, Sell, or Hold. "
        "Sentence 2 must justify the decision using the model signal, confidence, short trend, recent momentum, and the latest move. "
        "Sentence 3 must explain how the current news tone or headlines support or weaken that decision. "
        "Use Hold only because the evidence is mixed or weak. "
        "Do not mention options. Do not hedge with both buy and sell in the same answer.\n\n"
        f"Ticker: {ticker}\n"
        f"Decision: {decision_label}\n"
        f"Model signal: {signal}\n"
        f"Model confidence: {confidence:.1f}%\n"
        f"Latest move: {change_percent:+.2f}%\n"
        f"Recent momentum: {momentum * 100:+.1f}%\n"
        f"Short trend: {trend_direction}\n"
        f"News sentiment: {sentiment_text}\n"
        f"Topics: {topic_text}\n"
        "Headlines:\n"
        f"{headline_block}\n\n"
        "Trade decision explanation:"
    )

    if _remote_llm_enabled():
        try:
            reply = _remote_chat_completion(
                prompt=prompt,
                system_prompt="You are TradeWise AI, a decisive paper-trading coach for beginners.",
                max_new_tokens=180,
                task="trade_reasoning",
            )
            if reply:
                return ReasoningResult(text=reply, source="remote-llm", action=action)
        except Exception:
            return ReasoningResult(
                text=_template_reasoning(
                    ticker,
                    action,
                    signal,
                    confidence,
                    sentiment,
                    change_percent,
                    momentum,
                    short_moving_average,
                    long_moving_average,
                    topics,
                    headlines,
                ),
                source="template",
                action=action,
            )

    if not _qwen_runtime_supported():
        return ReasoningResult(
            text=_template_reasoning(
                ticker,
                action,
                signal,
                confidence,
                sentiment,
                change_percent,
                momentum,
                short_moving_average,
                long_moving_average,
                topics,
                headlines,
            ),
            source="template",
            action=action,
        )
    if not _qwen_can_run_in_current_env():
        return ReasoningResult(
            text=_template_reasoning(
                ticker,
                action,
                signal,
                confidence,
                sentiment,
                change_percent,
                momentum,
                short_moving_average,
                long_moving_average,
                topics,
                headlines,
            ),
            source="template",
            action=action,
        )

    try:
        torch = import_module("torch")
    except ImportError:
        torch = None

    try:
        tokenizer, model = _load_qwen()

        inputs = tokenizer(prompt, return_tensors="pt", truncation=True, max_length=2048)
        with torch.no_grad() if torch is not None else nullcontext():
            output_ids = model.generate(
                **inputs,
                max_new_tokens=180,
                do_sample=False,
                pad_token_id=tokenizer.eos_token_id,
            )

        generated = tokenizer.decode(output_ids[0], skip_special_tokens=True)
        reasoning = generated[len(prompt):].strip() if generated.startswith(prompt) else generated.strip()
        if reasoning:
            return ReasoningResult(text=reasoning, source="qwen", action=action)
        return ReasoningResult(
            text=_template_reasoning(
                ticker,
                action,
                signal,
                confidence,
                sentiment,
                change_percent,
                momentum,
                short_moving_average,
                long_moving_average,
                topics,
                headlines,
            ),
            source="template",
            action=action,
        )
    except Exception:
        return ReasoningResult(
            text=_template_reasoning(
                ticker,
                action,
                signal,
                confidence,
                sentiment,
                change_percent,
                momentum,
                short_moving_average,
                long_moving_average,
                topics,
                headlines,
            ),
            source="template",
            action=action,
        )


def build_student_news_reasoning(
    ticker: str,
    signal: str,
    confidence: float,
    sentiment: str | None,
    change_percent: float,
    momentum: float,
    short_moving_average: float,
    long_moving_average: float,
    topics: list[str],
    headlines: list[str],
    force_refresh: bool = False,
) -> ReasoningResult:
    action = _recommended_trade_action(
        signal=signal,
        confidence=confidence,
        sentiment=sentiment,
        change_percent=change_percent,
        momentum=momentum,
        short_moving_average=short_moving_average,
        long_moving_average=long_moving_average,
    )
    key = _cache_key(
        ticker,
        action,
        signal,
        confidence,
        sentiment,
        change_percent,
        momentum,
        "up" if short_moving_average >= long_moving_average else "down",
        topics,
        headlines,
    )
    ttl = _reasoning_cache_seconds()

    if not force_refresh:
        cached = _cached_reasoning(key, ttl)
        if cached is not None:
            return cached

    if _remote_llm_enabled():
        reasoning = _qwen_reasoning(
            ticker,
            action,
            signal,
            confidence,
            sentiment,
            change_percent,
            momentum,
            short_moving_average,
            long_moving_average,
            topics,
            headlines,
        )
        _store_cached_reasoning(key, reasoning.text, reasoning.source, reasoning.action)
        return reasoning

    if not _use_qwen_enabled():
        text = _template_reasoning(
            ticker,
            action,
            signal,
            confidence,
            sentiment,
            change_percent,
            momentum,
            short_moving_average,
            long_moving_average,
            topics,
            headlines,
        )
        _store_cached_reasoning(key, text, "template", action)
        return ReasoningResult(text=text, source="template", action=action)

    if not _qwen_runtime_supported():
        text = _template_reasoning(
            ticker,
            action,
            signal,
            confidence,
            sentiment,
            change_percent,
            momentum,
            short_moving_average,
            long_moving_average,
            topics,
            headlines,
        )
        _store_cached_reasoning(key, text, "template", action)
        return ReasoningResult(text=text, source="template", action=action)
    if not _qwen_can_run_in_current_env():
        text = _template_reasoning(
            ticker,
            action,
            signal,
            confidence,
            sentiment,
            change_percent,
            momentum,
            short_moving_average,
            long_moving_average,
            topics,
            headlines,
        )
        _store_cached_reasoning(key, text, "template", action)
        return ReasoningResult(text=text, source="template", action=action)

    reasoning = _qwen_reasoning(
        ticker,
        action,
        signal,
        confidence,
        sentiment,
        change_percent,
        momentum,
        short_moving_average,
        long_moving_average,
        topics,
        headlines,
    )
    _store_cached_reasoning(key, reasoning.text, reasoning.source, reasoning.action)
    return reasoning


def build_investment_chat_reply(
    *,
    prompt: str,
    model_profile: str,
    sectors: list[str],
    tracked_tickers: list[str],
) -> ReasoningResult:
    clean_prompt = prompt.strip()
    if not clean_prompt:
        return ReasoningResult(
            text="Tell me your investing goal and I can suggest three stocks to track.",
            source="template",
        )

    sector_text = ", ".join(sectors[:3]) if sectors else "no sector preference"
    ticker_text = ", ".join(tracked_tickers[:3]) if tracked_tickers else "none selected yet"
    selected_tickers = [ticker.strip() for ticker in tracked_tickers[:3] if ticker.strip()]
    selected_text = ", ".join(selected_tickers) if selected_tickers else ticker_text
    rationale_text = (
        f"{selected_tickers[0]} anchors the basket."
        if len(selected_tickers) == 1
        else (
            f"{selected_tickers[0]} anchors the basket, {selected_tickers[1]} adds balance."
            if len(selected_tickers) == 2
            else (
                f"{selected_tickers[0]} anchors the basket, {selected_tickers[1]} adds balance, "
                f"and {selected_tickers[2]} gives you a different angle."
                if len(selected_tickers) >= 3
                else "The basket stays aligned with your sectors."
            )
        )
    )
    fallback_text = (
        f"I mapped your goal to a {model_profile} profile and selected {selected_text}. "
        f"{rationale_text} While staying focused on {sector_text}."
    )
    key = "|".join(
        [
            "investment-chat-v2",
            clean_prompt.lower(),
            model_profile,
            ",".join(sectors[:3]),
            ",".join(selected_tickers[:3]),
        ]
    )
    cached = _cached_reasoning(key, _investment_chat_cache_seconds())
    if cached is not None:
        return cached

    prompt_text = (
        "You are TradeWise AI, a concise investing copilot for students. "
        "Respond in exactly 3 short sentences. Avoid guarantees, hype, markdown, bullets, and labels. "
        "Sentence 1 must name the selected stocks and explain the overall theme. "
        "Sentence 2 must give concrete reasons for the strongest two picks. "
        "Sentence 3 must explain the remaining pick and end with one short risk note.\n\n"
        f"User goal: {clean_prompt}\n"
        f"Risk profile: {model_profile}\n"
        f"Sectors inferred: {sector_text}\n"
        f"Selected stocks: {selected_text}\n"
        f"Selection rationale: {rationale_text}\n\n"
        "Assistant reply:"
    )

    if _remote_llm_enabled():
        try:
            reply = _remote_chat_completion(
                prompt=prompt_text,
                system_prompt="You are TradeWise AI, a concise investing copilot for students.",
                max_new_tokens=_investment_chat_max_new_tokens(),
                task="investment_chat",
            )
            if reply:
                normalized_reply = _normalize_investment_chat_text(
                    reply,
                    fallback_text,
                )
                _store_cached_reasoning(key, normalized_reply, "remote-llm")
                return ReasoningResult(text=normalized_reply, source="remote-llm")
        except Exception:
            _store_cached_reasoning(key, fallback_text, "template")
            return ReasoningResult(text=fallback_text, source="template")

    if (
        _should_skip_local_qwen()
        or
        not _use_qwen_enabled()
        or not _qwen_runtime_supported()
        or not _qwen_can_run_chat_in_current_env()
    ):
        _store_cached_reasoning(key, fallback_text, "template")
        return ReasoningResult(text=fallback_text, source="template")

    try:
        torch = import_module("torch")
    except ImportError:
        torch = None

    try:
        tokenizer, model = _load_qwen()
        inputs = tokenizer(prompt_text, return_tensors="pt", truncation=True, max_length=2048)
        with torch.no_grad() if torch is not None else nullcontext():
            output_ids = model.generate(
                **inputs,
                max_new_tokens=_investment_chat_max_new_tokens(),
                do_sample=False,
                pad_token_id=tokenizer.eos_token_id,
            )

        generated = tokenizer.decode(output_ids[0], skip_special_tokens=True)
        reply = generated[len(prompt_text):].strip() if generated.startswith(prompt_text) else generated.strip()
        if reply:
            normalized_reply = _normalize_investment_chat_text(
                reply,
                fallback_text,
            )
            _store_cached_reasoning(key, normalized_reply, "qwen")
            return ReasoningResult(text=normalized_reply, source="qwen")
    except Exception:
        pass

    _store_cached_reasoning(key, fallback_text, "template")
    return ReasoningResult(text=fallback_text, source="template")
