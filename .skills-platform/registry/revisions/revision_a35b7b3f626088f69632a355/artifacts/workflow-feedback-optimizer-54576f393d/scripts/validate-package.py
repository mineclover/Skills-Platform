#!/usr/bin/env python3
"""Validate this skill package's static structure; does not test agent behavior."""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from urllib.parse import unquote, urlsplit

REQUIRED_FILES = (
    'SKILL.md', 'README.md',
    'references/construction-intake.md', 'references/integration.md',
    'references/contract.md', 'references/sources.md',
    'assets/construction-context-template.md', 'assets/workflow-template.md',
    'assets/work-order-template.md',
    'examples/research-pipeline.md', 'examples/bootstrap-and-resume.md',
    'tests/acceptance-cases.md', 'tests/validation-report.md',
    'scripts/validate-package.py',
)
# These markers protect the presence of required sections, not their semantics.
REQUIRED_MARKERS = {
    'SKILL.md': ('## 0. 구축 절차 인식', '## 5. 반영과 구축 절차 복귀'),
    'references/construction-intake.md': tuple(f'### I{i}.' for i in range(8))
        + ('`alignment_status`', '`ready`', '`partial`', '`blocked`', '`stale`'),
    'references/integration.md': ('WorkOrder', 'WorkResult', '`handoff`',
        '`host_state_update`', '`invalidated_refs`'),
    'assets/work-order-template.md': ('owner_stage:', 'runtime_location:',
        'result_status:', 'verification:', 'host_state_update: not_performed'),
}


def check(root: Path) -> dict[str, object]:
    errors: list[str] = []
    documents: dict[str, str] = {}
    for relative in REQUIRED_FILES:
        path = root / relative
        if not path.is_file():
            errors.append(f'Missing file: {relative}')
    if not root.is_dir():
        return {'status': 'FAIL', 'errors': errors + [f'Not a directory: {root}']}

    for path in sorted(root.rglob('*.md')):
        relative = path.relative_to(root).as_posix()
        try:
            documents[relative] = path.read_text(encoding='utf-8')
        except (OSError, UnicodeError) as exc:
            errors.append(f'Cannot read {relative}: {exc}')

    skill = documents.get('SKILL.md', '')
    match = re.match(r'\A---\n(.*?)\n---\n', skill, flags=re.S)
    frontmatter: dict[str, str] = {}
    if not match:
        errors.append('SKILL.md: missing YAML frontmatter delimiters')
    else:
        # This package uses single-line scalar values, not general YAML syntax.
        for line in match.group(1).splitlines():
            field = re.fullmatch(r'([a-z][a-z-]*):\s*(\S.*)', line)
            if not field:
                errors.append(f'Unsupported frontmatter line: {line!r}')
                continue
            key, value = field.groups()
            if key in frontmatter:
                errors.append(f'Duplicate frontmatter key: {key}')
            frontmatter[key] = value
        name = frontmatter.get('name', '')
        if (not 1 <= len(name) <= 64 or
            not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', name)):
            errors.append('Invalid skill name')
        if name != root.name:
            errors.append(f'Skill name {name!r} differs from directory {root.name!r}')
        description = frontmatter.get('description', '')
        if not 1 <= len(description) <= 1024:
            errors.append('description must contain 1–1024 characters')
    skill_lines = len(skill.splitlines())
    if skill_lines >= 500:
        errors.append('SKILL.md should remain below 500 lines')

    local_links = 0
    for relative, text in documents.items():
        # Remove fenced examples so placeholder references are not treated as links.
        without_code = re.sub(r'(?ms)^```[^\n]*\n.*?^```\s*$', '', text)
        fences = re.findall(r'^```', text, flags=re.M)
        if len(fences) % 2:
            errors.append(f'Unbalanced code fences: {relative}')
        for target in re.findall(r'\[[^\]\n]*\]\(([^)\n]+)\)', without_code):
            parsed = urlsplit(target)
            if parsed.scheme or parsed.netloc or not parsed.path:
                continue
            local_links += 1
            resolved = ((root / relative).parent / unquote(parsed.path)).resolve()
            try:
                resolved.relative_to(root.resolve())
            except ValueError:
                errors.append(f'Link leaves package: {relative} -> {target}')
                continue
            if not resolved.is_file():
                errors.append(f'Broken file link: {relative} -> {target}')
        if '\ufffd' in text:
            errors.append(f'Unicode replacement character: {relative}')

    for relative, markers in REQUIRED_MARKERS.items():
        text = documents.get(relative, '')
        for marker in markers:
            if marker not in text:
                errors.append(f'Missing required marker in {relative}: {marker}')

    case_ids = re.findall(r'^\| (A\d{2}) \|',
                          documents.get('tests/acceptance-cases.md', ''), re.M)
    if len(case_ids) != 28 or len(set(case_ids)) != 28:
        errors.append('Expected 28 unique behavior acceptance case specifications')

    return {
        'status': 'PASS' if not errors else 'FAIL',
        'required_files': len(REQUIRED_FILES),
        'markdown_files': len(documents),
        'local_file_links_checked': local_links,
        'skill_lines': skill_lines,
        'description_characters': len(frontmatter.get('description', '')),
        'behavior_case_specifications': len(case_ids),
        'behavior_cases_executed': 0,
        'scope': 'static structure only; no semantic, host, runtime, or LLM validation',
        'errors': errors,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path,
                        default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    report = check(args.root.resolve())
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report['status'] == 'PASS' else 1


if __name__ == '__main__':
    raise SystemExit(main())
