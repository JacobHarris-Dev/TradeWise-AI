"""Download a Hugging Face causal language model into the local cache.

This keeps model setup reproducible for local experiments and future backend
integration work.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

DEFAULT_MODEL_NAME = "Qwen/Qwen2.5-1.5B-Instruct"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Download a Hugging Face tokenizer and causal LM.",
    )
    parser.add_argument(
        "--model-name",
        default=DEFAULT_MODEL_NAME,
        help="Model id on Hugging Face Hub.",
    )
    parser.add_argument(
        "--cache-dir",
        default=None,
        help="Optional cache directory. Defaults to the Hugging Face cache.",
    )
    parser.add_argument(
        "--revision",
        default=None,
        help="Optional model revision, tag, or commit sha.",
    )
    parser.add_argument(
        "--device-map",
        default="auto",
        help='Device placement passed to from_pretrained, e.g. "auto" or "cpu".',
    )
    parser.add_argument(
        "--trust-remote-code",
        action="store_true",
        help="Enable trust_remote_code for models that require it.",
    )
    parser.add_argument(
        "--tokenizer-only",
        action="store_true",
        help="Download only the tokenizer for a lighter smoke test.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    cache_dir = Path(args.cache_dir).expanduser().resolve() if args.cache_dir else None

    print(f"Torch runtime: {torch.__version__}")
    print(f"CUDA available: {torch.cuda.is_available()}")
    if torch.cuda.is_available():
        print(f"CUDA device: {torch.cuda.get_device_name(0)}")

    tokenizer = AutoTokenizer.from_pretrained(
        args.model_name,
        cache_dir=str(cache_dir) if cache_dir else None,
        revision=args.revision,
        trust_remote_code=args.trust_remote_code,
    )
    print(f"Tokenizer ready: {args.model_name}")
    print(f"Tokenizer class: {tokenizer.__class__.__name__}")

    if args.tokenizer_only:
        print("Skipped model weights download (--tokenizer-only).")
        return

    model = AutoModelForCausalLM.from_pretrained(
        args.model_name,
        cache_dir=str(cache_dir) if cache_dir else None,
        revision=args.revision,
        device_map=args.device_map,
        torch_dtype="auto",
        trust_remote_code=args.trust_remote_code,
    )
    print(f"Model ready: {args.model_name}")
    print(f"Model class: {model.__class__.__name__}")
    print(f"Device map: {args.device_map}")


if __name__ == "__main__":
    main()
