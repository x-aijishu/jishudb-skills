from __future__ import annotations

import hashlib
from importlib import import_module
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import unittest

bundle = import_module("bundle-task-setup")


class BundledSetupTest(unittest.TestCase):
    def test_independently_installed_tasks_have_complete_setup_resources(self) -> None:
        """Copy only each task, then resolve its guide, links, helpers and hashes."""
        files = bundle.bundle_files()
        targets = bundle.task_roots(bundle.REPOSITORY_ROOT)
        self.assertEqual(len(targets), 11)
        with tempfile.TemporaryDirectory() as temporary:
            for target in targets:
                with self.subTest(skill=target.name):
                    isolated = Path(temporary) / target.name
                    shutil.copytree(target, isolated)
                    bundle.synchronize(isolated, files, check=True)
                    entry = (isolated / "SKILL.md").read_text(encoding="utf-8")
                    guide_link = re.search(r'\[[^\]]+\]\((references/jishudb-setup/setup.md)\)', entry)
                    self.assertIsNotNone(guide_link)
                    setup = (isolated / guide_link[1]).parent
                    self.assertEqual(list(isolated.rglob("SKILL.md")), [isolated / "SKILL.md"])
                    for markdown in isolated.rglob("*.md"):
                        prose = re.sub(r'```.*?```', '', markdown.read_text(encoding="utf-8"), flags=re.DOTALL)
                        for link in re.findall(r'\[[^\]]+\]\(([^)\s]+)\)', prose):
                            if link.startswith(('https://', 'http://', '#')):
                                continue
                            resource = (markdown.parent / link.split('#')[0]).resolve()
                            self.assertTrue(resource.is_relative_to(isolated.resolve()), str(resource))
                            self.assertTrue(resource.exists(), str(resource))
                    manifest = json.loads((setup / "bundle-manifest.json").read_text())
                    for item in manifest['files']:
                        self.assertEqual(hashlib.sha256((setup / item['path']).read_bytes()).hexdigest(), item['sha256'])
                    canonical = bundle.REPOSITORY_ROOT / 'skills/jishudb/scripts'
                    self.assertEqual((setup / 'scripts/install-macos.sh').read_bytes(), (canonical / 'install-macos.zsh').read_bytes())
                    self.assertEqual((setup / 'scripts/install-windows.js').read_bytes(), (canonical / 'install-windows.js').read_bytes())
                    subprocess.run(['node', '--check', str(setup / 'scripts/install-windows.js')], check=True, capture_output=True)

    def test_check_detects_drift_and_regeneration_restores_bytes(self) -> None:
        files = bundle.bundle_files()
        with tempfile.TemporaryDirectory() as temporary:
            task = Path(temporary)
            bundle.synchronize(task, files, check=False)
            helper = task / bundle.BUNDLE_PATH / 'scripts/install-windows.js'
            helper.write_text('tampered helper')
            with self.assertRaisesRegex(ValueError, 'Stale or missing'):
                bundle.synchronize(task, files, check=True)
            bundle.synchronize(task, files, check=False)
            bundle.synchronize(task, files, check=True)
            unexpected = task / bundle.BUNDLE_PATH / 'unexpected.txt'
            unexpected.write_text('preserve unrelated content')
            with self.assertRaisesRegex(ValueError, 'Unexpected files'):
                bundle.synchronize(task, files, check=False)
            self.assertEqual(unexpected.read_text(), 'preserve unrelated content')

    def test_symlink_bundle_cannot_write_outside_task(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            task = root / 'task'
            target = root / 'outside'
            task.mkdir()
            target.mkdir()
            try:
                (task / 'references').symlink_to(target, target_is_directory=True)
            except OSError:
                self.skipTest('Host does not permit symlinks')
            with self.assertRaisesRegex(ValueError, 'symlink'):
                bundle.synchronize(task, bundle.bundle_files(), check=False)
            self.assertEqual(list(target.iterdir()), [])


if __name__ == '__main__':
    unittest.main()
