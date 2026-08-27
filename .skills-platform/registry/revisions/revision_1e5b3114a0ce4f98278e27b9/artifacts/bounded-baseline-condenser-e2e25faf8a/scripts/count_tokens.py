#!/usr/bin/env python3
"""Count tokens in a baseline document.

Exact mode uses `tiktoken` when installed. Estimated mode is intentionally
reported as non-certifying; it must not be represented as exact compliance.

Examples:
  python scripts/count_tokens.py MASTER_BASELINE.md
  python scripts/count_tokens.py MASTER_BASELINE.md --encoding o200k_base --hard-limit 80000
  python scripts/count_tokens.py MASTER_BASELINE.md --require-exact
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", type=Path)
    parser.add_argument("--encoding", default="o200k_base")
    parser.add_argument("--working-target", type=int, default=72_000)
    parser.add_argument("--warning-threshold", type=int, default=76_000)
    parser.add_argument("--hard-limit", type=int, default=80_000)
    parser.add_argument(
        "--require-exact",
        action="store_true",
        help="Fail when the requested tokenizer cannot be loaded.",
    )
    parser.add_argument("--json", action="store_true", dest="as_json")
    return parser.parse_args()


def exact_count(text: str, encoding_name: str) -> tuple[int | None, str | None]:
    try:
        import tiktoken  # type: ignore
    except ModuleNotFoundError:
        return None, "tiktoken is not installed"

    try:
        encoding = tiktoken.get_encoding(encoding_name)
    except Exception as exc:  # pragma: no cover - dependent on package data
        return None, f"cannot load encoding {encoding_name!r}: {exc}"

    return len(encoding.encode(text)), None


def estimated_count(text: str) -> dict[str, int]:
    """Return a non-certifying estimate range.

    The central estimate treats CJK/Hangul characters more densely than Latin
    prose. The UTF-8 byte count is included as a deliberately loose upper
    bound for byte-level tokenizers. None of these values certify a model's
    actual token count.
    """

    cjk_or_hangul = 0
    other = 0
    for ch in text:
        code = ord(ch)
        if (
            0x1100 <= code <= 0x11FF
            or 0x3130 <= code <= 0x318F
            or 0xAC00 <= code <= 0xD7AF
            or 0x3400 <= code <= 0x4DBF
            or 0x4E00 <= code <= 0x9FFF
            or 0x3040 <= code <= 0x30FF
        ):
            cjk_or_hangul += 1
        else:
            other += 1

    central = cjk_or_hangul + math.ceil(other / 3.6)
    lower = math.ceil((cjk_or_hangul * 0.7) + (other / 5.0))
    byte_upper = len(text.encode("utf-8"))
    return {
        "estimated_lower": lower,
        "estimated_central": central,
        "non_certifying_byte_upper": byte_upper,
    }


def classify(count: int, working_target: int, warning: int, hard_limit: int) -> str:
    if count <= working_target:
        return "within_working_target"
    if count <= warning:
        return "warning_zone"
    if count <= hard_limit:
        return "near_hard_limit"
    return "over_hard_limit"


def main() -> int:
    args = parse_args()
    if not args.path.is_file():
        print(f"error: file not found: {args.path}", file=sys.stderr)
        return 2
    if not (0 < args.working_target <= args.warning_threshold <= args.hard_limit):
        print("error: require working_target <= warning_threshold <= hard_limit", file=sys.stderr)
        return 2

    text = args.path.read_text(encoding="utf-8")
    count, error = exact_count(text, args.encoding)

    result: dict[str, Any] = {
        "path": str(args.path),
        "encoding": args.encoding,
        "working_target": args.working_target,
        "warning_threshold": args.warning_threshold,
        "hard_limit": args.hard_limit,
    }

    if count is not None:
        result.update(
            {
                "count_status": "exact",
                "token_count": count,
                "classification": classify(
                    count,
                    args.working_target,
                    args.warning_threshold,
                    args.hard_limit,
                ),
                "under_hard_limit": count <= args.hard_limit,
            }
        )
        exit_code = 0 if count <= args.hard_limit else 1
    else:
        if args.require_exact:
            print(f"error: exact count unavailable: {error}", file=sys.stderr)
            return 3
        estimate = estimated_count(text)
        central = estimate["estimated_central"]
        result.update(
            {
                "count_status": "estimated",
                "reason": error,
                **estimate,
                "classification_by_central_estimate": classify(
                    central,
                    args.working_target,
                    args.warning_threshold,
                    args.hard_limit,
                ),
                "under_hard_limit": None,
                "note": "Estimated mode does not certify compliance.",
            }
        )
        exit_code = 0

    if args.as_json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        for key, value in result.items():
            print(f"{key}: {value}")
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
