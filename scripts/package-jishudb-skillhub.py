#!/usr/bin/env python3
"""Build a deterministic SkillHub-compatible JishuDB Skill archive."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import zipfile


REPOSITORY_ROOT = Path(__file__).resolve().parent.parent
SKILL_ROOT = REPOSITORY_ROOT / "skills" / "jishudb"
CANONICAL_FILES = (
    "SKILL.md",
    "references/connection-recovery.md",
    "references/installation-contract.md",
    "scripts/install-macos.zsh",
    "scripts/install-windows.js",
)
COMPATIBLE_FILES = (
    "SKILL.md",
    "references/connection-recovery.md",
    "references/installation-contract.md",
    "scripts/install-macos.sh",
    "scripts/install-windows.js",
)


def fail(message: str) -> None:
    raise RuntimeError(f"JishuDB SkillHub package: {message}")


def run_git(*arguments: str) -> str:
    result = subprocess.run(
        ("git", *arguments),
        cwd=REPOSITORY_ROOT,
        check=True,
        stdout=subprocess.PIPE,
        text=True,
    )
    return result.stdout.strip()


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def replace_exact(text: str, old: str, new: str, label: str) -> str:
    if text.count(old) != 1:
        fail(f"{label} must occur exactly once")
    return text.replace(old, new)


def render_skillhub_skill(source: str) -> str:
    # Rewrite both inline commands and resource links in the standalone entrypoint.
    if "scripts/install-macos.zsh" not in source:
        fail("macOS helper path is missing")
    return source.replace("scripts/install-macos.zsh", "scripts/install-macos.sh")


def render_skillhub_contract(source: str) -> str:
    result = replace_exact(
        source,
        "the following standard\npackage commands:",
        "the following SkillHub-compatible\npackage commands:",
        "standard package command heading",
    )
    result = replace_exact(
        result,
        "scripts/install-macos.zsh plan \\",
        "zsh scripts/install-macos.sh plan \\",
        "macOS plan command",
    )
    result = replace_exact(
        result,
        "scripts/install-macos.zsh execute \\",
        "zsh scripts/install-macos.sh execute \\",
        "macOS execute command",
    )
    if "install-macos.zsh" in result or "install-windows.ps1" in result:
        fail("compatible contract contains an unsupported script path")
    return result


def build_files() -> dict[str, tuple[bytes, int]]:
    paths = tuple(SKILL_ROOT.rglob("*"))
    for path in paths:
        if path.is_symlink():
            fail(f"symlink is not publishable: {path.relative_to(SKILL_ROOT)}")
    actual = tuple(sorted(
        path.relative_to(SKILL_ROOT).as_posix()
        for path in paths
        if path.is_file()
    ))
    if actual != CANONICAL_FILES:
        fail(f"canonical file inventory must equal {', '.join(CANONICAL_FILES)}")

    skill = (SKILL_ROOT / "SKILL.md").read_text(encoding="utf-8")
    contract = (SKILL_ROOT / "references" / "installation-contract.md").read_text(
        encoding="utf-8"
    )
    macos = (SKILL_ROOT / "scripts" / "install-macos.zsh").read_bytes()
    windows = (SKILL_ROOT / "scripts" / "install-windows.js").read_bytes()
    return {
        "SKILL.md": (render_skillhub_skill(skill).encode("utf-8"), 0o644),
        "references/connection-recovery.md": (
            (SKILL_ROOT / "references" / "connection-recovery.md").read_bytes(), 0o644,
        ),
        "references/installation-contract.md": (
            render_skillhub_contract(contract).encode("utf-8"),
            0o644,
        ),
        "scripts/install-macos.sh": (macos, 0o755),
        "scripts/install-windows.js": (windows, 0o755),
    }


def write_zip(path: Path, files: dict[str, tuple[bytes, int]]) -> None:
    with zipfile.ZipFile(
        path,
        "x",
        compression=zipfile.ZIP_DEFLATED,
        compresslevel=9,
    ) as archive:
        for relative in COMPATIBLE_FILES:
            data, mode = files[relative]
            info = zipfile.ZipInfo(f"jishudb/{relative}", (1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = mode << 16
            archive.writestr(
                info,
                data,
                compress_type=zipfile.ZIP_DEFLATED,
                compresslevel=9,
            )


def write_text_exclusive(path: Path, value: str) -> None:
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8", newline="") as handle:
        handle.write(value)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--allow-dirty", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    status = run_git("status", "--porcelain", "--untracked-files=all")
    dirty = bool(status)
    if dirty and not args.allow_dirty:
        fail("release packaging requires a clean worktree")
    revision = run_git("rev-parse", "HEAD")
    if not re.fullmatch(r"[0-9a-f]{40}", revision):
        fail("source revision is invalid")

    skill = (SKILL_ROOT / "SKILL.md").read_text(encoding="utf-8")
    version_match = re.search(
        r'^\s*version:\s*"([0-9]+\.[0-9]+\.[0-9]+)"\s*$',
        skill,
        re.MULTILINE,
    )
    if not version_match:
        fail("Skill metadata version is missing")
    version = version_match.group(1)
    files = build_files()

    output = args.output_dir.resolve()
    output.mkdir(parents=True, exist_ok=True, mode=0o700)
    artifact = output / f"jishudb-skillhub-{version}.zip"
    write_zip(artifact, files)
    artifact_bytes = artifact.read_bytes()
    artifact_digest = sha256_bytes(artifact_bytes)
    manifest = {
        "schemaVersion": 1,
        "product": "jishudb-agent-skill",
        "name": "jishudb",
        "version": version,
        "distribution": "skillhub-compatible",
        "sourceRevision": revision,
        "sourceTreeDirty": dirty,
        "publicationEligible": not dirty,
        "artifact": {
            "name": artifact.name,
            "size": len(artifact_bytes),
            "sha256": artifact_digest,
        },
        "files": [
            {
                "path": relative,
                "size": len(files[relative][0]),
                "sha256": sha256_bytes(files[relative][0]),
                "mode": f"{files[relative][1]:03o}",
            }
            for relative in COMPATIBLE_FILES
        ],
    }
    manifest_path = Path(f"{artifact}.manifest.json")
    checksum_path = Path(f"{artifact}.sha256")
    write_text_exclusive(manifest_path, json.dumps(manifest, indent=2) + "\n")
    write_text_exclusive(checksum_path, f"{artifact_digest}  {artifact.name}\n")
    print(
        json.dumps(
            {
                "artifactPath": str(artifact),
                "manifestPath": str(manifest_path),
                "checksumPath": str(checksum_path),
                "publicationEligible": not dirty,
            }
        )
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1) from error
