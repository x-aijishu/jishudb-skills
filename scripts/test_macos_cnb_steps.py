"""Run the actual macOS CNB shell path with signed fixtures and no real network."""

import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import tempfile
import unittest


MOCK_HTTP = r"""
const fs = require('node:fs');
const path = require('node:path');
module.exports = async (url, options) => {
  if (!url.startsWith('https://cnb.cool/x-aijishu/jishudb-desktop-releases/-/releases/download/v0.9.9/')) {
    throw new Error('Unexpected network destination; GitHub is unavailable');
  }
  fs.appendFileSync(path.join(__dirname, 'requests.jsonl'), JSON.stringify({url, headers: options.headers}) + '\n');
  const control = JSON.parse(fs.readFileSync(path.join(__dirname, 'control.json')));
  const bytes = Buffer.from('abcdefghijklmnopqrstuvwxyz');
  const [offset, end] = options.headers.Range.slice(6).split('-').map(Number);
  const headers = {'Content-Range': control.wrongRange ? 'bytes 0-9/26' : `bytes ${offset}-${end}/26`};
  if (control.partial) {
    return new Response(new ReadableStream({start(controller) {
      controller.enqueue(bytes.subarray(offset, offset + 3));
      options.signal.addEventListener('abort', () => controller.error(options.signal.reason), {once:true});
      setTimeout(() => {}, 150);
    }}), {status:206, headers});
  }
  return new Response(bytes.subarray(offset, end + 1), {status:206, headers});
};
"""

CREATE_FIXTURE = r"""
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const root = process.argv[2];
const {artifactSpecifications, signCatalog, verifyCatalog} = require(path.join(root, 'release-mirror-catalog.cjs'));
const {normalizedRelease, transportBinding} = require(path.join(root, 'install-macos-cnb.cjs'));
const {privateKey, publicKey} = crypto.generateKeyPairSync('ed25519');
const publicBytes = publicKey.export({format:'der',type:'spki'});
const authority = {algorithm:'Ed25519',publicKey:publicBytes.toString('base64'),
  keyId:'ed25519-sha256:'+crypto.createHash('sha256').update(publicBytes).digest('hex')};
const repo = 'x-aijishu/jishudb-desktop-releases';
const origin = 'https://cnb.cool/'+repo;
const now = Date.now();
const digest = crypto.createHash('sha256').update('abcdefghijklmnopqrstuvwxyz').digest('hex');
const payload = {schemaVersion:1, domain:'jishudb-release-mirror-catalog-v1',product:'jishudb-desktop',channel:'stable',
  sequence:1,version:'0.9.9',sourceRevision:'a'.repeat(40),issuedAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+3600000).toISOString(),
  canonicalRelease:{repository:repo,id:123,tag:'v0.9.9',targetCommitish:'main',url:'https://github.com/'+repo+'/releases/tag/v0.9.9'},
  mirror:{repositoryURL:origin,redirectAllowlist:[{origin:'https://asset.cnb.cool',pathPrefix:'/assets/t/'}]},
  artifacts:artifactSpecifications('0.9.9').map((item,index)=>({...item,size:26,sha256:digest,assetId:index+1,
    canonicalURL:'https://github.com/'+repo+'/releases/download/v0.9.9/'+item.name,
    mirrorURL:origin+'/-/releases/download/v0.9.9/'+item.name}))};
const envelope = signCatalog(payload,privateKey.export({format:'der',type:'pkcs8'}).toString('base64'),authority);
const config = {catalogURL:origin+'/-/releases/latest/download/jishudb-release-catalog.json',authority,minimumSequence:1,minimumVersion:'0.9.9'};
const verified = verifyCatalog(envelope,{authority});
const release = normalizedRelease(verified);
const assets = Object.fromEntries([['installer','.dmg'],['checksum','.dmg.sha256'],['candidate','.dmg.candidate.json']].map(([role,suffix])=>{
 const asset=release.assets.find(entry=>entry.name.endsWith(suffix));
 return [role,{role,id:asset.id,name:asset.name,size:asset.size,url:asset.url,sha256:digest}];
}));
const plan = {schema:'jishudb-agent-install-plan-v2',launchMode:'agent-background',operation:'fresh-install',platform:'darwin-arm64',userId:String(process.getuid()),
  createdAt:new Date(now).toISOString(),expiresAt:new Date(now+1800000).toISOString(),
  release:{repository:repo,id:123,tag:'v0.9.9',version:'0.9.9',targetCommitish:'main',sourceRepository:'x-aijishu/jishudb',sourceRevision:'a'.repeat(40)},
  assets,transport:transportBinding(verified,config),
  installation:{applicationPath:process.env.HOME+'/Applications/JishuDB.app',dataRoot:process.env.HOME+'/Library/Application Support/JishuDB',dataOwnershipAcknowledged:true},
  connection:{client:'test',configTarget:root+'/mcp.json',name:'jishudb',url:'http://127.0.0.1:8088/mcp',profile:'default'},
  publisher:{identity:'developer-id',gatekeeper:'accepted',teamIdentifier:'ABCDEFGHIJ'}};
for (const [name,value] of [['release-mirror-trust.json',config],['install-plan.json',plan]]) {
 fs.writeFileSync(path.join(root,name),JSON.stringify(value),{mode:0o600});
}
"""


@unittest.skipUnless(platform.system() == "Darwin" and platform.machine() == "arm64" and shutil.which("node"),
                     "Requires macOS arm64 zsh/JXA and Node.js 22+")
class CnbDownloadStepsTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="JishuDBCnbTest.")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.root.chmod(0o700)
        source_root = Path(__file__).resolve().parents[1] / "skills/jishudb/scripts"
        for name in ["install-macos.zsh", "install-macos-cnb.cjs", "release-mirror-catalog.cjs"]:
            source = (source_root / name).read_text()
            if name.endswith(".zsh"):
                source = source.replace("DOWNLOAD_SLICE_BYTES=16777216", "DOWNLOAD_SLICE_BYTES=10")
                # Any accidental GitHub curl branch fails without accessing the network.
                source = source.replace("/usr/bin/curl", "/usr/bin/false")
            elif name == "install-macos-cnb.cjs":
                source = source.replace("globalThis.fetch", "require('./mock-http.cjs')")
                source = source.replace("transferTimeoutMs = 20000", "transferTimeoutMs = 100")
                source = source.replace("path.join(os.homedir(), '.cache', 'jishudb-agent-install', 'cnb-release-state.json')",
                                        "path.join(__dirname, 'state.json')")
            (self.root / name).write_text(source)
        (self.root / "mock-http.cjs").write_text(MOCK_HTTP)
        creator = self.root / "create-fixture.cjs"
        creator.write_text(CREATE_FIXTURE)
        subprocess.run([shutil.which("node"), str(creator), str(self.root)], check=True, capture_output=True, text=True)
        self.plan = self.root / "install-plan.json"
        self.digest = hashlib.sha256(self.plan.read_bytes()).hexdigest()
        self.control()

    def control(self, **values):
        (self.root / "control.json").write_text(json.dumps(values))

    def step(self, success=True, *options):
        command = ["/bin/zsh", str(self.root / "install-macos.zsh"), "download", "--plan", str(self.plan),
                   "--plan-sha256", self.digest, *options]
        result = subprocess.run(command, capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode == 0, success, result.stdout + result.stderr)
        self.assertFalse((self.root / "transfer.lock").exists())
        return json.loads(result.stdout.splitlines()[-1])

    def test_cnb_source_is_restored_from_approved_plan_and_resumes_without_github(self):
        self.control(partial=True)
        self.assertEqual(self.step()["downloadedBytes"], 3)
        self.control()
        for expected in [13, 23, 26]:
            self.assertEqual(self.step()["downloadedBytes"], expected)
        self.assertEqual(self.step()["status"], "downloaded")
        requests = [json.loads(line) for line in (self.root / "requests.jsonl").read_text().splitlines()]
        self.assertEqual(len(requests), 4)
        self.assertTrue(all("github" not in entry["url"] for entry in requests))

    def test_bad_range_does_not_advance_private_prefix(self):
        self.step()
        self.control(wrongRange=True)
        self.assertEqual(self.step(False)["errorCategory"], "invalid_download_slice")
        self.assertEqual((self.root / "installer.partial").read_bytes(), b"abcdefghij")

    def test_explicit_source_change_and_plan_mutation_are_rejected(self):
        self.assertEqual(self.step(False, "--release-source", "github")["errorCategory"], "release_source_mismatch")
        self.plan.write_text(self.plan.read_text() + " ")
        self.assertEqual(self.step(False)["errorCategory"], "plan_digest_mismatch")


if __name__ == "__main__":
    unittest.main()
