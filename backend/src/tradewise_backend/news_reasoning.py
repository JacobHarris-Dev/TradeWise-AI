from __future__ import annotations

import os
from dataclasses import dataclass
from importlib import import_module
from threading import Lock
from time import monotonic
from contextlib import nullcontext
from typing import Any

import httpx


DEFAULT_QWEN_MODEL_NAME = "Qwen/Qwen2.5-0.5B-Instruct"
DEFAULT_REASONING_CACHE_SECONDS = 120
DEFAULT_INVESTMENT_CHAT_MAX_NEW_TOKENS = 96
DEFAULT_REMOTE_LLM_TIMEOUT_SECONDS = 60.0


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


def _remote_llm_model_name() -> str:
    configured = os.getenv("ML_QWEN_REMOTE_MODEL", "").strip()
    return configured or _qwen_model_name()


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


def _remote_llm_enabled() -> bool:
    return bool(_remote_llm_base_url())


def _should_skip_local_qwen() -> bool:
    return _remote_llm_enabled()


def _openai_chat_completion(
    *,
    prompt: str,
    system_prompt: str,
    max_new_tokens: int,
) -> str:
    base_url = _remote_llm_base_url().rstrip("/")
    if not base_url:
        raise RuntimeError("Remote LLM base URL is not configured.")

    headers: dict[str, str] = {"content-type": "application/json"}
    api_key = _remote_llm_api_key()
    if api_key:
        headers["authorization"] = f"Bearer {api_key}"

    payload: dict[str, Any] = {
        "model": _remote_llm_model_name(),
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0,
        "max_tokens": max_new_tokens,
    }

    response = httpx.post(
        f"{base_url}/v1/chat/completions",
        json=payload,
        headers=headers,
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
    signal: str,
    confidence: float,
    sentiment: str | None,
    topics: list[str],
    headlines: list[str],
) -> ReasoningResult:
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

    if _remote_llm_enabled():
        try:
            reply = _openai_chat_completion(
                prompt=prompt,
                system_prompt="You are a finance tutor for college students.",
                max_new_tokens=180,
            )
            if reply:
                return ReasoningResult(text=reply, source="remote-llm")
        except Exception:
            return ReasoningResult(
                text=_template_reasoning(ticker, signal, confidence, sentiment, topics, headlines),
                source="template",
            )

    if not _qwen_runtime_supported():
        return ReasoningResult(
            text=_template_reasoning(ticker, signal, confidence, sentiment, topics, headlines),
            source="template",
        )
    if not _qwen_can_run_in_current_env():
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

    if _remote_llm_enabled():
        reasoning = _qwen_reasoning(ticker, signal, confidence, sentiment, topics, headlines)
        _store_cached_reasoning(key, reasoning.text, reasoning.source)
        return reasoning

    if not _use_qwen_enabled():
        text = _template_reasoning(ticker, signal, confidence, sentiment, topics, headlines)
        _store_cached_reasoning(key, text, "template")
        return ReasoningResult(text=text, source="template")

    if not _qwen_runtime_supported():
        text = _template_reasoning(ticker, signal, confidence, sentiment, topics, headlines)
        _store_cached_reasoning(key, text, "template")
        return ReasoningResult(text=text, source="template")
    if not _qwen_can_run_in_current_env():
        text = _template_reasoning(ticker, signal, confidence, sentiment, topics, headlines)
        _store_cached_reasoning(key, text, "template")
        return ReasoningResult(text=text, source="template")

    reasoning = _qwen_reasoning(ticker, signal, confidence, sentiment, topics, headlines)
    _store_cached_reasoning(key, reasoning.text, reasoning.source)
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

    prompt_text = (
        "You are TradeWise AI, a concise investing copilot for students. "
        "Respond in exactly 4 short sentences. Avoid guarantees and hype. "
        "Use one sentence to name the 3 selected stocks and explain the overall theme. "
        "Use one sentence per stock to give a concrete reason for each pick based on sector fit, momentum, quality, or diversification. "
        "End with a short risk sentence.\n\n"
        f"User goal: {clean_prompt}\n"
        f"Risk profile: {model_profile}\n"
        f"Sectors inferred: {sector_text}\n"
        f"Selected stocks: {selected_text}\n"
        f"Selection rationale: {rationale_text}\n\n"
        "Assistant reply:"
    )

    if _remote_llm_enabled():
        try:
            reply = _openai_chat_completion(
                prompt=prompt_text,
                system_prompt="You are TradeWise AI, a concise investing copilot for students.",
                max_new_tokens=_investment_chat_max_new_tokens(),
            )
            if reply:
                return ReasoningResult(text=reply, source="remote-llm")
        except Exception:
            return ReasoningResult(
                text=(
                    f"I mapped your goal to a {model_profile} profile and selected {selected_text}. "
                    f"{rationale_text} While staying focused on {sector_text}."
                ),
                source="template",
            )

    if (
        _should_skip_local_qwen()
        or
        not _use_qwen_enabled()
        or not _qwen_runtime_supported()
        or not _qwen_can_run_chat_in_current_env()
    ):
        return ReasoningResult(
            text=(
                f"I mapped your goal to a {model_profile} profile and selected {selected_text}. "
                f"{rationale_text} While staying focused on {sector_text}."
            ),
            source="template",
        )

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
            return ReasoningResult(text=reply, source="qwen")
    except Exception:
        pass

    return ReasoningResult(
        text=(
            f"I mapped your goal to a {model_profile} profile and selected {selected_text}. "
            f"{rationale_text} While staying focused on {sector_text}."
        ),
        source="template",
    )
