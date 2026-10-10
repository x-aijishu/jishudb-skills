from __future__ import annotations

import json
from pathlib import Path
import subprocess
import tempfile
import unittest
import zipfile


REPOSITORY_ROOT = Path(__file__).resolve().parent.parent
PACKAGER = REPOSITORY_ROOT / "scripts" / "package-jishudb-skillhub.py"
SKILL_ROOT = REPOSITORY_ROOT / "skills" / "jishudb"
EXPECTED_FILES = [
    "jishudb/SKILL.md",
    "jishudb/references/connection-recovery.md",
    "jishudb/references/installation-contract.md",
    "jishudb/scripts/install-macos.sh",
    "jishudb/scripts/install-windows.js",
]


def package(output: Path) -> dict[str, object]:
    result = subprocess.run(
        (
            "python3",
            str(PACKAGER),
            "--output-dir",
            str(output),
            "--allow-dirty",
        ),
        cwd=REPOSITORY_ROOT,
        check=True,
        stdout=subprocess.PIPE,
        text=True,
    )
    return json.loads(result.stdout)


class SkillHubPackageTest(unittest.TestCase):
    def test_package_is_deterministic_and_uses_supported_script_types(self) -> None:
        with tempfile.TemporaryDirectory(prefix="jishudb-skillhub-test-") as temporary:
            root = Path(temporary)
            first = package(root / "first")
            second = package(root / "second")
            first_artifact = Path(str(first["artifactPath"]))
            second_artifact = Path(str(second["artifactPath"]))
            self.assertEqual(first_artifact.read_bytes(), second_artifact.read_bytes())

            manifest = json.loads(Path(str(first["manifestPath"])).read_text(encoding="utf-8"))
            self.assertEqual(manifest["version"], "0.1.15")
            self.assertEqual(manifest["distribution"], "skillhub-compatible")
            self.assertEqual(
                [entry["path"] for entry in manifest["files"]],
                [path.removeprefix("jishudb/") for path in EXPECTED_FILES],
            )

            with zipfile.ZipFile(first_artifact) as archive:
                self.assertEqual(archive.namelist(), EXPECTED_FILES)
                self.assertIsNone(archive.testzip())
                for info in archive.infolist():
                    self.assertEqual(info.date_time, (1980, 1, 1, 0, 0, 0))
                script_names = [name for name in archive.namelist() if "/scripts/" in name]
                self.assertFalse(any(name.endswith((".ps1", ".zsh")) for name in script_names))

                skill = archive.read("jishudb/SKILL.md").decode("utf-8")
                contract = archive.read(
                    "jishudb/references/installation-contract.md"
                ).decode("utf-8")
                self.assertIn("description: >-", skill)
                self.assertIn("scripts/install-macos.sh", skill)
                self.assertIn("scripts/install-windows.js", skill)
                self.assertIn("zsh scripts/install-macos.sh plan", contract)
                self.assertIn("node scripts/install-windows.js check", contract)
                self.assertIn("SkillHub-compatible\npackage commands", contract)
                self.assertNotIn("standard\npackage commands", contract)
                self.assertNotIn("install-macos.zsh", skill + contract)
                self.assertNotIn("install-windows.ps1", skill + contract)

                macos = archive.read("jishudb/scripts/install-macos.sh")
                self.assertEqual(
                    macos,
                    (SKILL_ROOT / "scripts" / "install-macos.zsh").read_bytes(),
                )
                windows = archive.read("jishudb/scripts/install-windows.js")
                self.assertEqual(
                    windows,
                    (SKILL_ROOT / "scripts" / "install-windows.js").read_bytes(),
                )
                self.assertNotIn(b"PowerShell", windows)
                self.assertNotIn(b".ps1", windows)

            windows_path = root / "install-windows.js"
            windows_path.write_bytes(windows)
            subprocess.run(("node", "--check", str(windows_path)), check=True)


if __name__ == "__main__":
    unittest.main()
