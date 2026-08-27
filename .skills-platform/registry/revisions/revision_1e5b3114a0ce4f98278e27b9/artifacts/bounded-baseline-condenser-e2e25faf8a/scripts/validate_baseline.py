#!/usr/bin/env python3
"""Perform lightweight structural validation of a canonical baseline.

This validator does not prove semantic completeness. It catches common
packaging errors: missing required semantic sections, duplicate IDs, broken
ID references, absent token metadata, and explicit hard-limit violations when
an exact token count is available.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any

ID_PATTERN = re.compile(
    r"\b(?:G|NG|REQ|DEC|CTR|INV|FLOW|AC|RISK|OPEN|TODO)-[A-Z0-9][A-Z0-9._-]*\b"
)
HEADING_PATTERN = re.compile(r"^#{1,6}\s+(.+?)\s*$", re.MULTILINE)

REQUIRED_ROLE_GROUPS = {
    "document_control": ("document control", "문서 제어", "문서 관리"),
    "scope": ("scope", "범위", "boundary", "경계"),
    "requirements": ("requirements", "요구사항"),
    "architecture_or_model": (
        "architecture",
        "아키텍처",
        "domain",
        "도메인",
        "data model",
        "데이터 모델",
        "state model",
        "상태 모델",
    ),
    "contracts": ("contracts", "계약", "interfaces", "인터페이스"),
    "validation": ("acceptance", "검증", "수용 기준", "test", "테스트"),
    "decisions_and_open": (
        "decisions",
        "결정",
        "open issues",
        "미결",
        "risks",
        "리스크",
    ),
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", type=Path)
    parser.add_argument("--token-report", type=Path)
    parser.add_argument("--json", action="store_true", dest="as_json")
    return parser.parse_args()


def normalize_heading(value: str) -> str:
    value = re.sub(r"[`*_\[\]()#]", "", value)
    return re.sub(r"\s+", " ", value).strip().lower()


def main() -> int:
    args = parse_args()
    if not args.path.is_file():
        print(f"error: file not found: {args.path}", file=sys.stderr)
        return 2

    text = args.path.read_text(encoding="utf-8")
    headings = [normalize_heading(v) for v in HEADING_PATTERN.findall(text)]
    ids = ID_PATTERN.findall(text)
    counts = Counter(ids)
    duplicate_ids = sorted(item for item, count in counts.items() if count > 1)

    # Repeated IDs can be legitimate references. Flag rather than fail solely
    # on repetition; stronger tooling can distinguish definitions/references.
    role_results: dict[str, bool] = {}
    for role, needles in REQUIRED_ROLE_GROUPS.items():
        role_results[role] = any(
            needle in heading for heading in headings for needle in needles
        )

    frontmatter_present = text.startswith("---\n")
    token_metadata_present = bool(
        re.search(r"(?im)^tokenizer\s*:\s*\S+", text)
        and re.search(r"(?im)^count_status\s*:\s*(?:exact|estimated)", text)
        and re.search(r"(?im)^hard_limit\s*:\s*\d+", text)
    )

    token_report: dict[str, Any] | None = None
    hard_limit_failure = False
    if args.token_report:
        try:
            token_report = json.loads(args.token_report.read_text(encoding="utf-8"))
        except Exception as exc:
            print(f"error: cannot read token report: {exc}", file=sys.stderr)
            return 2
        if token_report.get("count_status") == "exact":
            hard_limit_failure = not bool(token_report.get("under_hard_limit"))

    failures = []
    if not frontmatter_present:
        failures.append("missing_frontmatter")
    if not token_metadata_present:
        failures.append("missing_token_metadata")
    failures.extend(
        f"missing_role:{role}" for role, present in role_results.items() if not present
    )
    if hard_limit_failure:
        failures.append("over_hard_limit")

    warnings = []
    if duplicate_ids:
        warnings.append(
            "IDs occur more than once; verify that each has one definition and the rest are references"
        )
    if "compression limitations" not in "\n".join(headings) and "압축 한계" not in "\n".join(headings):
        warnings.append("no compression-limitations section; acceptable only when there are no limitations")

    result = {
        "path": str(args.path),
        "status": "PASS" if not failures else "FAIL",
        "frontmatter_present": frontmatter_present,
        "token_metadata_present": token_metadata_present,
        "semantic_roles": role_results,
        "id_occurrence_count": len(ids),
        "unique_id_count": len(counts),
        "repeated_ids_to_review": duplicate_ids,
        "token_report": token_report,
        "failures": failures,
        "warnings": warnings,
        "note": "Structural validation does not prove source coverage or semantic preservation.",
    }

    if args.as_json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(f"status: {result['status']}")
        for failure in failures:
            print(f"FAIL: {failure}")
        for warning in warnings:
            print(f"WARN: {warning}")
        for role, present in role_results.items():
            print(f"role.{role}: {'present' if present else 'missing'}")
        print(f"unique_ids: {len(counts)}")
        print(result["note"])

    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
