"""Exercise the actual macOS shell orchestration with a local fake curl, never network."""

from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import platform
import subprocess
import tempfile
import unittest


FAKE_CURL = r'''#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
root = Path(os.environ['DOWNLOAD_TEST_ROOT'])
args = sys.argv[1:]
def option(name): return args[args.index(name) + 1]
url = args[-1]
control = json.loads((root / 'control.json').read_text())
kind = 'cdn' if url.startswith('https://release-assets.') else 'asset' if '/assets/' in url else 'release'
with (root / 'requests.jsonl').open('a') as log: log.write(json.dumps({'kind': kind}) + '\n')
code = '200'; extra = ''; body = b''; exit_code = 0
if kind == 'release':
    body = (root / 'release.json').read_bytes()
    if control.get('broken_release'): body = b'{'; exit_code = 28
elif kind == 'asset':
    code = '302'; extra = 'Location: https://release-assets.githubusercontent.com/github-production-release-asset/1316997274/fixture\r\n'
else:
    start, end = map(int, option('--range').split('-'))
    payload = b'abcdefghijklmnopqrstuvwxyz'
    body = payload[start:end+1]; code = '206'
    extra = 'Content-Range: bytes %d-%d/%d\r\n' % (start, end, len(payload))
    if control.get('partial'): body = body[:3]; exit_code = 28
    if control.get('wrong_range'): extra = 'Content-Range: bytes 0-9/26\r\n'
    if control.get('cdn_status'):
        code = str(control['cdn_status']); body = b'error'; extra = ''
        if control.get('retry'): extra = 'Retry-After: 17\r\n'
Path(option('--dump-header')).write_bytes(('HTTP/2 ' + code + '\r\n' + extra + '\r\n').encode())
Path(option('--output')).write_bytes(body)
print(code, end='')
sys.exit(exit_code)
'''


@unittest.skipUnless(platform.system() == "Darwin" and platform.machine() == "arm64", "Requires macOS arm64 zsh/JXA")
class DownloadStepsTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="JishuDBDownloadTest.")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.root.chmod(0o700)
        fake = self.root / "curl"
        fake.write_text(FAKE_CURL)
        fake.chmod(0o700)
        source = (Path(__file__).resolve().parents[1] / "skills/jishudb/scripts/install-macos.zsh").read_text()
        # Only the test copy substitutes transport and slice size. Production
        # has no environment/CLI transport override or unchecked fixture path.
        self.script = self.root / "installer.zsh"
        self.script.write_text(source.replace("/usr/bin/curl", str(fake)).replace("DOWNLOAD_SLICE_BYTES=16777216", "DOWNLOAD_SLICE_BYTES=10"))
        now = datetime.now(timezone.utc)
        name = "jishudb-desktop-1.2.3-unsigned-darwin-arm64.dmg"
        digest = hashlib.sha256(b"abcdefghijklmnopqrstuvwxyz").hexdigest()
        assets = {}
        for index, (role, suffix) in enumerate([("installer", ""), ("checksum", ".sha256"), ("candidate", ".candidate.json")], 1):
            assets[role] = dict(role=role, id=index, name=name+suffix, size=26,
                                url=f"https://api.github.com/repos/x-aijishu/jishudb-desktop-releases/releases/assets/{index}", sha256=digest)
        plan = dict(schema="jishudb-agent-install-plan-v1", createdAt=now.isoformat(), expiresAt=(now+timedelta(hours=1)).isoformat(),
                    operation="fresh-install", platform="darwin-arm64", userId=str(os.getuid()),
                    release=dict(repository="x-aijishu/jishudb-desktop-releases", id=1, tag="v1.2.3", version="1.2.3",
                                 targetCommitish="main", sourceRepository="x-aijishu/jishudb", sourceRevision="b"*40),
                    assets=assets, installation=dict(applicationPath=str(Path.home()/"Applications/JishuDB.app"),
                    dataRoot=str(Path.home()/"Library/Application Support/JishuDB"), dataOwnershipAcknowledged=True),
                    connection=dict(client="test", configTarget=str(self.root/"mcp.json"), name="jishudb",
                                    url="http://127.0.0.1:8088/mcp", profile="default"),
                    publisher=dict(identity="none", gatekeeper="manual-required"))
        release = dict(id=1, tag_name="v1.2.3", target_commitish="main", immutable=True, draft=False, prerelease=False,
                       assets=[dict(id=a['id'], name=a['name'], size=a['size'], url=a['url'], state="uploaded", digest="sha256:"+a['sha256']) for a in assets.values()])
        (self.root/"release.json").write_text(json.dumps(release))
        self.plan = self.root/"install-plan.json"
        self.plan.write_text(json.dumps(plan)); self.plan.chmod(0o600)
        self.digest = hashlib.sha256(self.plan.read_bytes()).hexdigest()
        self.control()

    def control(self, **values):
        (self.root/"control.json").write_text(json.dumps(values))

    def step(self, success=True):
        result = subprocess.run(['/bin/zsh', str(self.script), 'download', '--plan', str(self.plan), '--plan-sha256', self.digest],
                                env={**os.environ, 'DOWNLOAD_TEST_ROOT': str(self.root)}, capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode == 0, success, result.stdout + result.stderr)
        self.assertFalse((self.root/'transfer.lock').exists())
        return json.loads(result.stdout.splitlines()[-1])

    def test_timeout_resume_completes_and_reuses_validated_metadata(self):
        self.control(partial=True)
        self.assertEqual(self.step()['downloadedBytes'], 3)
        self.control()
        for expected in [13, 23, 26]:
            self.assertEqual(self.step()['downloadedBytes'], expected)
        # A separately verified complete cache also clears obsolete partial
        # bytes and a private signed URL before reporting readiness.
        (self.root/'installer.partial').write_bytes(b'old'); (self.root/'installer.partial').chmod(0o600)
        (self.root/'download-location.txt').write_text('private obsolete URL'); (self.root/'download-location.txt').chmod(0o600)
        self.assertEqual(self.step()['status'], 'downloaded')
        self.assertFalse((self.root/'installer.partial').exists())
        self.assertEqual((self.root/'jishudb-desktop-1.2.3-unsigned-darwin-arm64.dmg').read_bytes(), b'abcdefghijklmnopqrstuvwxyz')
        requests = [json.loads(line)['kind'] for line in (self.root/'requests.jsonl').read_text().splitlines()]
        self.assertEqual(requests.count('release'), 1)
        self.assertEqual(requests.count('asset'), 1)
        self.assertFalse((self.root/'download-location.txt').exists())

    def test_wrong_range_keeps_original_prefix(self):
        self.step(); self.control(wrong_range=True)
        self.assertEqual(self.step(False)['errorCategory'], 'invalid_download_slice')
        self.assertEqual((self.root/'installer.partial').read_bytes(), b'abcdefghij')

    def test_cdn_rate_limit_waits_without_appending(self):
        self.step(); self.control(cdn_status=429, retry=True)
        result = self.step()
        self.assertEqual((result['status'], result['retryAfterSeconds'], result['downloadedBytes']), ('download_waiting', 17, 10))

    def test_cached_url_refresh_is_bounded(self):
        self.step(); self.control(cdn_status=403)
        self.assertEqual(self.step()['errorCategory'], 'download_url_refresh_required')
        self.assertFalse((self.root/'download-location.txt').exists())
        self.assertEqual(self.step(False)['errorCategory'], 'asset_download_failed')
        self.assertEqual((self.root/'installer.partial').read_bytes(), b'abcdefghij')

    def test_incomplete_snapshot_is_not_published(self):
        self.control(broken_release=True)
        self.assertEqual(self.step(False)['errorCategory'], 'github_api_failed')
        self.assertFalse((self.root/'download-release.json').exists())
        self.control()
        self.assertEqual(self.step()['downloadedBytes'], 10)


if __name__ == '__main__':
    unittest.main()
