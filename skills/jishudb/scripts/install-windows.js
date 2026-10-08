#!/usr/bin/env node
'use strict';

const childProcess = process.getBuiltinModule('node:child_process');
const crypto = process.getBuiltinModule('node:crypto');
const fs = process.getBuiltinModule('node:fs');
const net = process.getBuiltinModule('node:net');
const os = process.getBuiltinModule('node:os');
const path = process.getBuiltinModule('node:path');

const RELEASE_REPOSITORY = 'x-aijishu/jishudb-desktop-releases';
const SOURCE_REPOSITORY = 'x-aijishu/jishudb';
const API_ORIGIN = 'https://api.github.com';
const API_VERSION = '2026-03-10';
const ASSET_REDIRECT_HOST = 'release-assets.githubusercontent.com';
const ASSET_REDIRECT_PREFIX = '/github-production-release-asset/1316997274/';
const PLAN_SCHEMA = 'jishudb-agent-install-plan-v1';
// AI-generated: versioned presentation intent is bound by the reviewed plan digest.
const BACKGROUND_PLAN_SCHEMA = 'jishudb-agent-install-plan-v2';
const PREFERRED_MCP_PORT = 8088;
const RESERVED_LAN_MCP_PORT = 8089;
const DESKTOP_MCP_PORT_SEARCH_LIMIT = 16;
const ENDPOINT_CONFIG_SCHEMA = 1;
const ENDPOINT_CONFIG_FILENAME = 'desktop-endpoint.json';
const PLAN_TTL_MILLISECONDS = 30 * 60 * 1000;
const MAXIMUM_RELEASE_PAGES = 5;
const MAXIMUM_JSON_BYTES = 16 * 1024 * 1024;
const MAXIMUM_CHECKSUM_BYTES = 1024 * 1024;
const MAXIMUM_ASSET_BYTES = 1024 * 1024 * 1024;
const MAXIMUM_PLAN_BYTES = 64 * 1024;
const API_TIMEOUT_MILLISECONDS = 60 * 1000;
const SMALL_ASSET_TIMEOUT_MILLISECONDS = 5 * 60 * 1000;
const HTTP_TIMEOUT_MILLISECONDS = 30 * 60 * 1000;
const SEMVER_PATTERN = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const REVISION_PATTERN = /^[0-9a-f]{40}$/;
const SID_PATTERN = /^S-1-[0-9]+(?:-[0-9]+)+$/;
const CONNECTION_NAME_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const CHILD_ENVIRONMENT_ALLOWLIST = new Set([
  'allusersprofile',
  'appdata',
  'commonprogramfiles',
  'commonprogramfiles(x86)',
  'comspec',
  'homedrive',
  'homepath',
  'lang',
  'localappdata',
  'logonserver',
  'number_of_processors',
  'os',
  'path',
  'pathext',
  'processor_architecture',
  'processor_identifier',
  'programdata',
  'programfiles',
  'programfiles(x86)',
  'public',
  'sessionname',
  'systemdrive',
  'systemroot',
  'temp',
  'tmp',
  'tz',
  'userdomain',
  'username',
  'userprofile',
  'windir',
]);

class InstallError extends Error {
  constructor(category, message) {
    super(`${category}: ${message}`);
    this.name = 'InstallError';
    this.category = category;
    this.publicMessage = message;
  }
}

function fail(category, message) {
  throw new InstallError(category, message);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireExactProperties(value, expected, label) {
  if (!isRecord(value)) fail('invalid_contract', `${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail('invalid_contract', `${label} fields do not match the reviewed schema`);
  }
}

function requirePattern(value, pattern, label) {
  if (typeof value !== 'string' || !pattern.test(value)) {
    fail('invalid_contract', `${label} is invalid`);
  }
  return value;
}

function requireSafeInteger(value, label, { positive = false } = {}) {
  if (!Number.isSafeInteger(value) || (positive && value <= 0)) {
    fail('invalid_contract', `${label} is invalid`);
  }
  return value;
}

function requireSafeText(value, label, maximumLength = 4096) {
  if (typeof value !== 'string' || value.trim() === '' || value.length > maximumLength || /[\u0000-\u001f\u007f]/.test(value)) {
    fail('invalid_contract', `${label} is invalid`);
  }
  return value;
}

function approvedDesktopMcpPorts() {
  const ports = [PREFERRED_MCP_PORT];
  for (let port = PREFERRED_MCP_PORT + 1; ports.length < DESKTOP_MCP_PORT_SEARCH_LIMIT; port += 1) {
    if (port !== RESERVED_LAN_MCP_PORT) ports.push(port);
  }
  return ports;
}

function isDesktopMcpUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    const parsed = new URL(value);
    const port = Number(parsed.port);
    return parsed.protocol === 'http:'
      && parsed.hostname === '127.0.0.1'
      && parsed.pathname === '/mcp'
      && parsed.search === ''
      && parsed.hash === ''
      && parsed.username === ''
      && parsed.password === ''
      && approvedDesktopMcpPorts().includes(port);
  } catch {
    return false;
  }
}

function parseArguments(argv) {
  const mode = argv[0];
  if (!['check', 'plan', 'execute'].includes(mode)) {
    fail('invalid_arguments', 'first argument must be check, plan, or execute');
  }
  const allowed = new Set(['-PlanPath', '-PlanSha256', '-Client', '-ConfigTarget', '-ConnectionName']);
  const allowedByMode = {
    check: new Set(),
    plan: new Set(['-PlanPath', '-Client', '-ConfigTarget', '-ConnectionName']),
    execute: new Set(['-PlanPath', '-PlanSha256']),
  };
  const values = Object.create(null);
  for (let index = 1; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(key) || value === undefined || Object.hasOwn(values, key)) {
      fail('invalid_arguments', `invalid or duplicate argument ${JSON.stringify(key)}`);
    }
    if (!allowedByMode[mode].has(key)) fail('invalid_arguments', `${key} is not valid in ${mode} mode`);
    values[key] = value;
  }
  if (mode === 'check' && argv.length !== 1) fail('invalid_arguments', 'check mode accepts no additional arguments');
  return {
    mode,
    planPath: values['-PlanPath'] ?? '',
    planSha256: values['-PlanSha256'] ?? '',
    client: values['-Client'] ?? '',
    configTarget: values['-ConfigTarget'] ?? '',
    connectionName: values['-ConnectionName'] ?? 'jishudb',
  };
}

function assertWindowsX64() {
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    fail('unsupported_platform', 'automatic Windows installation requires Windows x64');
  }
  const major = Number(process.versions.node.split('.')[0]);
  if (!Number.isInteger(major) || major < 22) {
    fail('unsupported_node_runtime', 'automatic Windows installation requires Node.js 22 or later');
  }
}

function normalizeLocalWindowsPath(value, label) {
  if (typeof value !== 'string' || /[\0\r\n]/.test(value)
      || value.startsWith('\\\\') || value.startsWith('//')
      || value.startsWith('\\\\?\\') || value.startsWith('\\\\.\\')
      || !path.win32.isAbsolute(value)) {
    fail('invalid_path', `${label} must be an absolute local-drive path`);
  }
  const resolved = path.win32.resolve(value);
  if (!/^[A-Za-z]:\\/.test(resolved) || resolved.slice(2).includes(':')) {
    fail('invalid_path', `${label} must not use UNC, device, or alternate-data-stream syntax`);
  }
  const unsafeComponent = resolved.slice(3).split('\\').some((component) => {
    const basename = component.split('.')[0].toUpperCase();
    return /[<>"|?*]/.test(component) || component.endsWith('.') || component.endsWith(' ')
      || /^(CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])$/.test(basename);
  });
  if (unsafeComponent) fail('invalid_path', `${label} contains an unsupported Windows path component`);
  return resolved;
}

function assertNoReparseAncestors(target, label) {
  const resolved = normalizeLocalWindowsPath(target, label);
  const root = path.win32.parse(resolved).root;
  const segments = resolved.slice(root.length).split('\\').filter(Boolean);
  let current = root;
  for (const segment of segments) {
    current = path.win32.join(current, segment);
    if (!fs.existsSync(current)) break;
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) fail('invalid_path', `${label} must not contain a reparse ancestor`);
    const real = fs.realpathSync.native(current);
    if (path.win32.resolve(real).toLowerCase() !== path.win32.resolve(current).toLowerCase()) {
      fail('invalid_path', `${label} must not resolve through another path`);
    }
  }
  return resolved;
}

function resolveSystemTools() {
  const systemRoot = assertNoReparseAncestors(process.env.SystemRoot ?? '', 'SystemRoot');
  if (process.env.WINDIR
      && normalizeLocalWindowsPath(process.env.WINDIR, 'WINDIR').toLowerCase() !== systemRoot.toLowerCase()) {
    fail('unsupported_platform', 'SystemRoot and WINDIR disagree');
  }
  const system32 = path.join(systemRoot, 'System32');
  const tools = {
    whoami: path.join(system32, 'whoami.exe'),
    icacls: path.join(system32, 'icacls.exe'),
  };
  for (const [name, target] of Object.entries(tools)) {
    let stat;
    try {
      stat = fs.lstatSync(target);
    } catch (error) {
      fail('unsupported_platform', `${name}.exe is unavailable: ${error.message}`);
    }
    if (!stat.isFile() || stat.isSymbolicLink()) fail('unsupported_platform', `${name}.exe is not a regular system file`);
  }
  return tools;
}

function runNative(command, args, options = {}) {
  const resolvedCommand = assertNoReparseAncestors(command, 'native command');
  const result = childProcess.spawnSync(resolvedCommand, args, {
    encoding: options.encoding ?? 'utf8',
    env: options.env ?? process.env,
    maxBuffer: options.maxBuffer ?? 1024 * 1024,
    stdio: options.stdio,
    shell: false,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const diagnostic = options.stdio ? `exit ${result.status}` : (result.stderr || result.stdout || `exit ${result.status}`).trim();
    fail(options.category ?? 'native_command_failed', `${options.label ?? path.basename(command)} failed: ${diagnostic}`);
  }
  return result;
}

function getCurrentWindowsIdentity(tools) {
  const account = runNative(tools.whoami, [], { label: 'whoami' }).stdout.trim();
  const user = runNative(tools.whoami, ['/user', '/fo', 'csv', '/nh'], { label: 'whoami SID' }).stdout;
  const sid = user.match(/S-1-[0-9]+(?:-[0-9]+)+/)?.[0] ?? '';
  if (!account || /[\0\r\n]/.test(account) || !SID_PATTERN.test(sid)) {
    fail('unsupported_platform', 'current Windows account or SID is invalid');
  }
  return { account, sid };
}

function assertRegularPath(target, expectedType, category = 'invalid_plan') {
  let resolved;
  try {
    resolved = assertNoReparseAncestors(target, 'path');
  } catch (error) {
    if (error instanceof InstallError) fail(category, error.publicMessage);
    throw error;
  }
  let stat;
  try {
    stat = fs.lstatSync(resolved);
  } catch (error) {
    fail(category, `path is missing: ${error.message}`);
  }
  const validType = expectedType === 'directory' ? stat.isDirectory() : stat.isFile();
  if (!validType || stat.isSymbolicLink()) fail(category, `path must be a regular ${expectedType}`);
  return stat;
}

function parseIcaclsEntries(stdout, target) {
  const entries = [];
  const normalizedTarget = target.toLowerCase();
  for (const original of stdout.split(/\r?\n/)) {
    let line = original.trim();
    if (!line) continue;
    if (line.toLowerCase().startsWith(normalizedTarget)) line = line.slice(target.length).trim();
    const separator = line.lastIndexOf(':(');
    if (separator <= 0) continue;
    entries.push({ identity: line.slice(0, separator).trim(), rights: line.slice(separator + 1) });
  }
  return entries;
}

function aclRightsTokens(entry) {
  return [...entry.rights.matchAll(/\(([^)]+)\)/g)].map((match) => match[1].toUpperCase());
}

function isMandatoryIntegrityEntry(entry) {
  if (!entry.identity.toLowerCase().startsWith('mandatory label\\')) return false;
  const allowed = new Set(['CI', 'I', 'IO', 'NR', 'NW', 'NX', 'OI']);
  const tokens = aclRightsTokens(entry);
  return tokens.some(token => ['NR', 'NW', 'NX'].includes(token))
    && tokens.every(token => allowed.has(token));
}

function isPrivateAclEntries(entries, directory, identity) {
  const accessEntries = entries.filter(entry => !isMandatoryIntegrityEntry(entry));
  const allowedIdentities = new Set([identity.sid, `*${identity.sid}`, identity.account].map((value) => value.toLowerCase()));
  const tokens = accessEntries.length === 1
    ? [...accessEntries[0].rights.matchAll(/\(([^)]+)\)/g)].map((match) => match[1]).sort()
    : [];
  const expectedTokens = directory ? ['CI', 'F', 'OI'] : ['F'];
  return accessEntries.length === 1
    && allowedIdentities.has(accessEntries[0].identity.toLowerCase())
    && tokens.length === expectedTokens.length
    && tokens.every((token, index) => token === expectedTokens[index]);
}

function assertPrivateAcl(target, directory, identity, tools) {
  const result = runNative(tools.icacls, [target], { label: 'inspect private ACL' });
  const entries = parseIcaclsEntries(result.stdout, target);
  if (!isPrivateAclEntries(entries, directory, identity)) {
    const allowedIdentities = new Set(
      [identity.sid, `*${identity.sid}`, identity.account].map(value => value.toLowerCase()),
    );
    const summary = entries.map((entry) => {
      let principal = 'other-principal';
      if (allowedIdentities.has(entry.identity.toLowerCase())) principal = 'current-user';
      else if (isMandatoryIntegrityEntry(entry)) principal = 'mandatory-label';
      return `${principal}:${aclRightsTokens(entry).sort().join(',') || 'none'}`;
    }).join('|') || 'none';
    fail(
      'invalid_permissions',
      `private path ACL is not one explicit current-user FullControl entry; observed ${summary}`,
    );
  }
}

function setPrivateAcl(target, directory, identity, tools) {
  assertRegularPath(target, directory ? 'directory' : 'file', 'invalid_permissions');
  runNative(tools.icacls, [target, '/inheritancelevel:r'], { label: 'disable ACL inheritance' });
  runNative(
    tools.icacls,
    [target, '/remove:g', '*S-1-5-18', '*S-1-5-32-544'],
    { label: 'remove system and administrator ACL grants' },
  );
  const grant = `*${identity.sid}:${directory ? '(OI)(CI)F' : 'F'}`;
  runNative(tools.icacls, [target, '/grant:r', grant], { label: 'set private ACL' });
  runNative(tools.icacls, [target, '/setowner', `*${identity.sid}`], { label: 'set private owner' });
  runNative(tools.icacls, [target, '/verify'], { label: 'verify private ACL' });
  assertPrivateAcl(target, directory, identity, tools);
}

function createPrivateDirectory(target, identity, tools) {
  const resolved = normalizeLocalWindowsPath(target, 'private directory');
  assertNoReparseAncestors(path.win32.dirname(resolved), 'private directory parent');
  fs.mkdirSync(resolved, { recursive: false });
  setPrivateAcl(resolved, true, identity, tools);
}

function writePrivateFileExclusive(target, content, identity, tools) {
  const descriptor = fs.openSync(target, 'wx', 0o600);
  try {
    fs.writeFileSync(descriptor, content);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  setPrivateAcl(target, false, identity, tools);
  assertRegularPath(target, 'file');
}

function sha256File(target) {
  const hash = crypto.createHash('sha256');
  const descriptor = fs.openSync(target, 'r');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    for (;;) {
      const count = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (count === 0) break;
      hash.update(buffer.subarray(0, count));
    }
  } finally {
    fs.closeSync(descriptor);
  }
  return hash.digest('hex');
}

function sha256Bytes(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function assertFileDigest(target, expected, label) {
  if (sha256File(target) !== expected) fail('digest_mismatch', `${label} SHA-256 does not match the GitHub API digest`);
}

function assertFileSize(target, expected, label) {
  const stat = assertRegularPath(target, 'file', 'asset_size_mismatch');
  if (stat.size !== expected) fail('asset_size_mismatch', `${label} size does not match the GitHub API`);
}

async function readBoundedBody(response, maximumBytes, category, message) {
  const declared = response.headers.get('content-length');
  if (declared !== null && (!/^[0-9]+$/.test(declared) || Number(declared) > maximumBytes)) {
    if (response.body) await response.body.cancel().catch(() => {});
    fail(category, message);
  }
  if (!response.body) fail(category, 'HTTP response body is unavailable');
  const chunks = [];
  let total = 0;
  for await (const chunk of response.body) {
    total += chunk.length;
    if (total > maximumBytes) {
      await response.body.cancel().catch(() => {});
      fail(category, message);
    }
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks, total);
}

async function fetchWithTimeout(url, options, timeoutMilliseconds) {
  return fetch(url, {
    ...options,
    signal: AbortSignal.timeout(timeoutMilliseconds),
    redirect: 'manual',
  });
}

function assertApiDestination(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail('invalid_api_destination', 'GitHub API URL is invalid');
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'api.github.com' || parsed.port
      || parsed.username || parsed.password || parsed.hash) {
    fail('invalid_api_destination', 'GitHub API URL is outside the reviewed origin');
  }
  return parsed;
}

async function invokeApiJson(url) {
  const parsed = assertApiDestination(url);
  const response = await fetchWithTimeout(parsed, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'jishudb-agent-install/0.2',
      'X-GitHub-Api-Version': API_VERSION,
    },
  }, API_TIMEOUT_MILLISECONDS);
  if (response.status !== 200) {
    if (response.body) await response.body.cancel().catch(() => {});
    fail('github_api_failed', `GitHub API returned HTTP ${response.status}`);
  }
  const body = await readBoundedBody(response, MAXIMUM_JSON_BYTES, 'github_api_failed', 'GitHub API response exceeds the supported size');
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    fail('github_api_failed', 'GitHub API returned invalid JSON');
  }
}

async function getReleasePages(fetchPage = async (page) => invokeApiJson(
  `${API_ORIGIN}/repos/${RELEASE_REPOSITORY}/releases?per_page=100&page=${page}`,
)) {
  const releases = [];
  for (let page = 1; page <= MAXIMUM_RELEASE_PAGES; page += 1) {
    const items = await fetchPage(page);
    if (!Array.isArray(items)) fail('github_api_failed', 'GitHub releases response must be an array');
    releases.push(...items);
    if (items.length < 100) return releases;
  }
  fail('pagination_bound', `release selection exceeded ${MAXIMUM_RELEASE_PAGES} pages`);
}

function getApiDigest(asset, label) {
  if (!isRecord(asset) || asset.state !== 'uploaded' || !Number.isSafeInteger(asset.size) || asset.size <= 0) {
    fail('invalid_release_asset', `${label} is not a complete uploaded asset`);
  }
  requirePattern(asset.digest, /^sha256:[0-9a-f]{64}$/, `${label} digest`);
  return asset.digest.slice(7);
}

function getExactAsset(release, name, label) {
  const matches = Array.isArray(release.assets) ? release.assets.filter((asset) => asset?.name === name) : [];
  if (matches.length !== 1) fail('invalid_release_asset', `${label} must exist exactly once`);
  const asset = matches[0];
  getApiDigest(asset, label);
  requireSafeInteger(asset.id, `${label} ID`, { positive: true });
  if (asset.url !== `${API_ORIGIN}/repos/${RELEASE_REPOSITORY}/releases/assets/${asset.id}`) {
    fail('invalid_release_asset', `${label} API URL is not canonical`);
  }
  return asset;
}

function parseSemver(value) {
  if (typeof value !== 'string' || value.length > 64) return null;
  const match = SEMVER_PATTERN.exec(value);
  if (!match || match.slice(1).some((part) => part.length > 10)) return null;
  const parts = match.slice(1).map((part) => BigInt(part));
  return parts.some((part) => part > 2147483647n) ? null : parts;
}

function compareSemver(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] > right[index]) return -1;
    if (left[index] < right[index]) return 1;
  }
  return 0;
}

async function selectEligibleRelease(fetchPage) {
  const eligible = [];
  for (const release of await getReleasePages(fetchPage)) {
    if (!isRecord(release) || release.draft || release.prerelease || release.immutable !== true) continue;
    const tag = typeof release.tag_name === 'string' ? release.tag_name : '';
    const version = tag.startsWith('v') ? tag.slice(1) : '';
    const versionParts = parseSemver(version);
    if (!versionParts) continue;
    const installerName = `JishuDB-Windows-x64-${version}-Setup.exe`;
    try {
      eligible.push({
        versionParts,
        version,
        release,
        installer: getExactAsset(release, installerName, 'installer'),
        checksum: getExactAsset(release, `${installerName}.sha256`, 'checksum'),
        candidate: getExactAsset(release, `${installerName}.candidate.json`, 'candidate'),
      });
    } catch (error) {
      if (!(error instanceof InstallError)) throw error;
    }
  }
  if (eligible.length === 0) fail('no_eligible_immutable_release', 'no eligible immutable stable Windows release is available');
  eligible.sort((left, right) => compareSemver(left.versionParts, right.versionParts));
  return eligible[0];
}

function isAllowedAssetRedirect(source, target) {
  return source.protocol === 'https:'
    && source.hostname === 'api.github.com'
    && source.port === ''
    && /^\/repos\/x-aijishu\/jishudb-desktop-releases\/releases\/assets\/[1-9][0-9]*$/.test(source.pathname)
    && target.protocol === 'https:'
    && target.hostname === ASSET_REDIRECT_HOST
    && target.port === ''
    && target.username === ''
    && target.password === ''
    && target.hash === ''
    && target.pathname.startsWith(ASSET_REDIRECT_PREFIX);
}

async function saveAsset(
  url,
  destination,
  maximumBytes = MAXIMUM_ASSET_BYTES,
  timeoutMilliseconds = HTTP_TIMEOUT_MILLISECONDS,
) {
  const source = assertApiDestination(url);
  let response = await fetchWithTimeout(source, {
    headers: {
      Accept: 'application/octet-stream',
      'User-Agent': 'jishudb-agent-install/0.2',
      'X-GitHub-Api-Version': API_VERSION,
    },
  }, timeoutMilliseconds);
  if (response.status === 302) {
    const location = response.headers.get('location');
    if (!location) fail('invalid_asset_redirect', 'asset redirect has no Location');
    const target = new URL(location, source);
    if (!isAllowedAssetRedirect(source, target)) fail('invalid_asset_redirect', 'asset redirect is outside the reviewed GitHub release host');
    if (response.body) await response.body.cancel().catch(() => {});
    response = await fetchWithTimeout(target, {}, timeoutMilliseconds);
  }
  if (response.status !== 200) {
    if (response.body) await response.body.cancel().catch(() => {});
    fail('asset_download_failed', `asset request returned HTTP ${response.status}`);
  }
  const declared = response.headers.get('content-length');
  if (declared !== null && (!/^[0-9]+$/.test(declared) || Number(declared) > maximumBytes)) {
    if (response.body) await response.body.cancel().catch(() => {});
    fail('asset_download_failed', 'asset exceeds the supported size');
  }
  if (!response.body) fail('asset_download_failed', 'asset response body is unavailable');

  const descriptor = fs.openSync(destination, 'wx', 0o600);
  let total = 0;
  try {
    for await (const chunk of response.body) {
      total += chunk.length;
      if (total > maximumBytes) fail('asset_download_failed', 'asset exceeds the supported size');
      let offset = 0;
      while (offset < chunk.length) offset += fs.writeSync(descriptor, chunk, offset, chunk.length - offset);
    }
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function compareVersion(left, right) {
  const normalize = (value) => value.split('.').map((part) => Number(part));
  const a = normalize(left);
  const b = normalize(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function validateWindowsCandidate(candidate, selected, windowsRelease = os.release()) {
  requireExactProperties(candidate, [
    'artifact', 'authorization', 'bundleIdentifier', 'distribution', 'minimumSystemVersion',
    'product', 'productName', 'publication', 'revision', 'runtimeLock', 'schemaVersion',
    'source', 'target', 'version',
    ...(Object.hasOwn(candidate, 'agentBackgroundLaunch') ? ['agentBackgroundLaunch'] : []),
  ], 'candidate');
  if (Object.hasOwn(candidate, 'agentBackgroundLaunch') && candidate.agentBackgroundLaunch !== 1) fail('invalid_candidate', 'unsupported Agent launch contract');
  requireExactProperties(candidate.runtimeLock, ['path', 'sha256'], 'candidate.runtimeLock');
  requireExactProperties(candidate.artifact, ['name', 'sha256', 'size'], 'candidate.artifact');
  requireExactProperties(candidate.distribution, ['authenticode', 'installationScope', 'mode', 'publisherIdentity', 'smartScreenAssessment'], 'candidate.distribution');
  requireExactProperties(candidate.authorization, ['mode', 'publisherIdentity'], 'candidate.authorization');
  requireExactProperties(candidate.publication, ['requested'], 'candidate.publication');
  requireExactProperties(candidate.source, ['repository', 'runId', 'runAttempt'], 'candidate.source');
  if (candidate.schemaVersion !== 1 || candidate.product !== 'jishudb-desktop'
      || candidate.productName !== 'JishuDB' || candidate.bundleIdentifier !== 'com.aijishu.jishudb'
      || candidate.target !== 'windows-x64' || candidate.version !== selected.version) {
    fail('invalid_candidate', 'candidate product, target, or version is invalid');
  }
  requirePattern(candidate.revision, REVISION_PATTERN, 'candidate revision');
  requirePattern(candidate.minimumSystemVersion, /^10\.0\.[0-9]+$/, 'candidate minimum Windows version');
  if (!/^[0-9]+\.[0-9]+\.[0-9]+(?:\.[0-9]+)?$/.test(windowsRelease)) {
    fail('unsupported_platform', 'current Windows version is invalid');
  }
  requirePattern(String(candidate.source.runId), /^[1-9][0-9]*$/, 'candidate source run ID');
  requireSafeInteger(candidate.source.runAttempt, 'candidate source run attempt', { positive: true });
  if (compareVersion(windowsRelease, candidate.minimumSystemVersion) < 0 || Number(windowsRelease.split('.')[2] ?? 0) < 22000) {
    fail('unsupported_platform', 'automatic installation requires a supported Windows 11 build');
  }
  if (candidate.source.repository !== SOURCE_REPOSITORY
      || candidate.artifact.name !== selected.installer.name
      || candidate.artifact.sha256 !== getApiDigest(selected.installer, 'installer')
      || candidate.artifact.size !== selected.installer.size
      || candidate.runtimeLock.path !== 'packaging/windows/desktop-runtime-lock.json'
      || !SHA256_PATTERN.test(candidate.runtimeLock.sha256)
      || candidate.distribution.mode !== 'per-user-nsis-v1'
      || candidate.distribution.publisherIdentity !== 'none'
      || candidate.distribution.authenticode !== 'not-signed'
      || candidate.distribution.smartScreenAssessment !== 'unknown-publisher-manual-approval-required'
      || candidate.distribution.installationScope !== 'current-user'
      || candidate.authorization.mode !== 'windows-fresh-install-v1'
      || candidate.authorization.publisherIdentity !== 'none'
      || candidate.publication.requested !== true) {
    fail('invalid_candidate', 'candidate source, artifact, distribution, or authorization is invalid');
  }
}

function newAssetPlan(asset, role) {
  return {
    role,
    id: requireSafeInteger(asset.id, `${role} ID`, { positive: true }),
    name: requireSafeText(asset.name, `${role} name`, 255),
    size: requireSafeInteger(asset.size, `${role} size`, { positive: true }),
    url: requireSafeText(asset.url, `${role} URL`, 2048),
    sha256: getApiDigest(asset, role),
  };
}

function assertPlanShape(plan) {
  requireExactProperties(plan, ['schema', 'createdAt', 'expiresAt', 'operation', 'platform', 'userSid', 'release', 'assets', 'installation', 'connection', 'publisher', ...(plan.schema === BACKGROUND_PLAN_SCHEMA ? ['launchMode'] : [])], 'plan');
  requireExactProperties(plan.release, ['repository', 'id', 'tag', 'version', 'targetCommitish', 'sourceRepository', 'sourceRevision'], 'plan.release');
  requireExactProperties(plan.assets, ['installer', 'checksum', 'candidate'], 'plan.assets');
  requireExactProperties(plan.installation, ['applicationRoot', 'dataRoot', 'bootstrapPath', 'desktopShortcut', 'dataOwnershipAcknowledged'], 'plan.installation');
  requireExactProperties(plan.connection, ['client', 'configTarget', 'name', 'url', 'profile'], 'plan.connection');
  requireExactProperties(plan.publisher, ['identity', 'authenticode', 'smartScreen'], 'plan.publisher');
  for (const role of ['installer', 'checksum', 'candidate']) {
    requireExactProperties(plan.assets[role], ['role', 'id', 'name', 'size', 'url', 'sha256'], `plan.assets.${role}`);
  }
}

async function assertReleaseMatchesPlan(plan) {
  const release = await invokeApiJson(`${API_ORIGIN}/repos/${RELEASE_REPOSITORY}/releases/${plan.release.id}`);
  if (!isRecord(release) || release.immutable !== true || release.draft || release.prerelease
      || release.tag_name !== plan.release.tag || String(release.target_commitish) !== plan.release.targetCommitish) {
    fail('release_drift', 'release identity or immutable state changed');
  }
  for (const role of ['installer', 'checksum', 'candidate']) {
    const expected = plan.assets[role];
    const actual = getExactAsset(release, expected.name, role);
    if (actual.id !== expected.id || actual.size !== expected.size || actual.url !== expected.url
        || getApiDigest(actual, role) !== expected.sha256) {
      fail('release_drift', `${role} asset changed after approval`);
    }
  }
}

function isTcpPortAvailable(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', (error) => {
      if (error.code === 'EADDRINUSE' || error.code === 'EACCES') resolve(false);
      else reject(error);
    });
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () => {
      server.close((error) => error ? reject(error) : resolve(true));
    });
  });
}

async function getFreeDesktopMcpUrl() {
  for (const port of approvedDesktopMcpPorts()) {
    if (await isTcpPortAvailable(port)) return `http://127.0.0.1:${port}/mcp`;
  }
  fail('endpoint_unavailable', 'no free port exists in the bounded Desktop endpoint set');
}

function removeFileQuietly(target) {
  if (!target) return;
  try {
    fs.rmSync(target, { force: true });
  } catch {
    // Best-effort transaction cleanup.
  }
}

function removeDirectoryQuietly(target) {
  if (!target) return;
  try {
    fs.rmSync(target, { force: true, recursive: true });
  } catch {
    // Best-effort transaction cleanup.
  }
}

async function runCheck(context) {
  assertWindowsX64();
  const probeRoot = path.join(context.tempRoot, `JishuDBAgentCheck-${crypto.randomUUID().replaceAll('-', '')}`);
  try {
    createPrivateDirectory(probeRoot, context.identity, context.tools);
    const probeFile = path.join(probeRoot, 'acl-probe.json');
    writePrivateFileExclusive(probeFile, '{}\n', context.identity, context.tools);
    const releaseProbe = await getReleasePages(async (page) => [{ page }]);
    if (releaseProbe.length !== 1 || releaseProbe[0].page !== 1) {
      fail('unsupported_node_runtime', 'Node.js release-list behavior is incompatible');
    }
    return { status: 'compatible', host: 'node', version: process.version };
  } finally {
    removeDirectoryQuietly(probeRoot);
  }
}

async function runPlan(args, context) {
  assertWindowsX64();
  if (!args.client.trim() || !args.configTarget.trim()) fail('invalid_arguments', 'Client and ConfigTarget are required in plan mode');
  requireSafeText(args.client.trim(), 'Client', 512);
  requireSafeText(args.configTarget, 'ConfigTarget');
  let configTarget;
  try {
    configTarget = assertNoReparseAncestors(args.configTarget, 'ConfigTarget');
  } catch (error) {
    if (error instanceof InstallError) fail('invalid_arguments', error.publicMessage);
    throw error;
  }
  if (!CONNECTION_NAME_PATTERN.test(args.connectionName)) fail('invalid_arguments', 'ConnectionName must be filesystem-safe');

  const evidenceRoot = path.join(context.tempRoot, `JishuDBAgentEvidence-${crypto.randomUUID().replaceAll('-', '')}`);
  let targetPlanPath = '';
  let targetPlanParent = '';
  let planParentCreated = false;
  let planReady = false;
  try {
    createPrivateDirectory(evidenceRoot, context.identity, context.tools);
    const selected = await selectEligibleRelease();
    const candidatePath = path.join(evidenceRoot, 'candidate.json');
    const checksumPath = path.join(evidenceRoot, 'checksum.txt');
    await saveAsset(selected.candidate.url, candidatePath, MAXIMUM_JSON_BYTES, SMALL_ASSET_TIMEOUT_MILLISECONDS);
    await saveAsset(selected.checksum.url, checksumPath, MAXIMUM_CHECKSUM_BYTES, SMALL_ASSET_TIMEOUT_MILLISECONDS);
    assertFileSize(candidatePath, selected.candidate.size, 'candidate');
    assertFileSize(checksumPath, selected.checksum.size, 'checksum');
    assertFileDigest(candidatePath, getApiDigest(selected.candidate, 'candidate'), 'candidate');
    assertFileDigest(checksumPath, getApiDigest(selected.checksum, 'checksum'), 'checksum');
    const candidate = JSON.parse(fs.readFileSync(candidatePath, 'utf8'));
    validateWindowsCandidate(candidate, selected);
    const expectedChecksum = `${getApiDigest(selected.installer, 'installer')}  ${selected.installer.name}\n`;
    if (fs.readFileSync(checksumPath, 'utf8').replaceAll('\r\n', '\n') !== expectedChecksum) {
      fail('invalid_checksum', 'adjacent checksum content is not exact');
    }

    const customPlanPath = args.planPath.trim() !== '';
    if (customPlanPath) {
      try {
        targetPlanPath = assertNoReparseAncestors(args.planPath, 'custom plan path');
      } catch (error) {
        if (error instanceof InstallError) fail('invalid_plan_path', error.publicMessage);
        throw error;
      }
      targetPlanParent = path.dirname(targetPlanPath);
    } else {
      targetPlanParent = path.join(context.tempRoot, `JishuDBAgentInstall-${crypto.randomUUID().replaceAll('-', '')}`);
      targetPlanPath = path.join(targetPlanParent, 'install-plan.json');
    }
    if (fs.existsSync(targetPlanPath)) fail('invalid_plan_path', 'plan output already exists');
    if (customPlanPath && fs.existsSync(targetPlanParent)) fail('invalid_plan_path', 'custom plan parent must be absent');
    if (!fs.existsSync(targetPlanParent)) {
      if (!fs.existsSync(path.dirname(targetPlanParent))) {
        fail('invalid_plan_path', 'custom plan parent must have an existing local parent directory');
      }
      planParentCreated = true;
      createPrivateDirectory(targetPlanParent, context.identity, context.tools);
    }

    const localAppData = context.localAppData;
    const applicationRoot = path.join(localAppData, 'Programs', 'JishuDB');
    const dataRoot = path.join(localAppData, 'Programs', 'JishuDBData');
    const bootstrapPath = path.join(localAppData, 'JishuDB', 'data-location.json');
    const mcpUrl = await getFreeDesktopMcpUrl();
    const now = new Date();
    const plan = {
      schema: candidate.agentBackgroundLaunch === 1 ? BACKGROUND_PLAN_SCHEMA : PLAN_SCHEMA,
      ...(candidate.agentBackgroundLaunch === 1 ? {launchMode: 'agent-background'} : {}),
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + PLAN_TTL_MILLISECONDS).toISOString(),
      operation: 'fresh-install',
      platform: 'windows-x64',
      userSid: context.identity.sid,
      release: {
        repository: RELEASE_REPOSITORY,
        id: requireSafeInteger(selected.release.id, 'release ID', { positive: true }),
        tag: selected.release.tag_name,
        version: selected.version,
        targetCommitish: requireSafeText(String(selected.release.target_commitish), 'target commitish', 512),
        sourceRepository: SOURCE_REPOSITORY,
        sourceRevision: candidate.revision,
      },
      assets: {
        installer: newAssetPlan(selected.installer, 'installer'),
        checksum: newAssetPlan(selected.checksum, 'checksum'),
        candidate: newAssetPlan(selected.candidate, 'candidate'),
      },
      installation: {
        applicationRoot,
        dataRoot,
        bootstrapPath,
        desktopShortcut: true,
        dataOwnershipAcknowledged: true,
      },
      connection: {
        client: requireSafeText(args.client.trim(), 'client', 512),
        configTarget,
        name: args.connectionName,
        url: mcpUrl,
        profile: 'default',
      },
      publisher: {
        identity: 'none',
        authenticode: 'not-signed',
        smartScreen: 'unknown-publisher-manual-approval-required',
      },
    };
    const planBytes = Buffer.from(`${JSON.stringify(plan, null, 2)}\n`, 'utf8');
    if (planBytes.length > MAXIMUM_PLAN_BYTES) fail('invalid_plan', 'plan exceeds the supported size');
    const digest = sha256Bytes(planBytes);
    writePrivateFileExclusive(targetPlanPath, planBytes, context.identity, context.tools);
    await assertReleaseMatchesPlan(plan);
    if (sha256File(targetPlanPath) !== digest) fail('plan_drift', 'plan changed before approval');
    planReady = true;
    return {
      status: 'approval_required',
      planPath: targetPlanPath,
      planSha256: digest,
      approval: {
        version: plan.release.version,
        releaseId: plan.release.id,
        installer: plan.assets.installer.name,
        installerSha256: plan.assets.installer.sha256,
        applicationRoot,
        dataRoot,
        client: plan.connection.client,
        configTarget: plan.connection.configTarget,
        mcpUrl: plan.connection.url,
        profile: 'default',
        launchMode: plan.launchMode ?? 'foreground',
        publisher: 'unsigned',
        coveredMutations: ['download', 'per-user install', 'Desktop launch', 'non-secret client entry'],
        userPresence: ['SmartScreen or Unknown Publisher', 'first administrator', 'MCP secret entry', 'client trust'],
      },
    };
  } finally {
    removeDirectoryQuietly(evidenceRoot);
    if (!planReady) {
      removeFileQuietly(targetPlanPath);
      if (planParentCreated) removeDirectoryQuietly(targetPlanParent);
    }
  }
}

function parseStrictIso(value, label) {
  if (typeof value !== 'string') fail('invalid_plan', `${label} is invalid`);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) fail('invalid_plan', `${label} is invalid`);
  return parsed;
}

function validatePlan(plan, context) {
  assertPlanShape(plan);
  if (!([PLAN_SCHEMA, BACKGROUND_PLAN_SCHEMA].includes(plan.schema)) || (plan.schema === BACKGROUND_PLAN_SCHEMA && plan.launchMode !== 'agent-background') || plan.operation !== 'fresh-install' || plan.platform !== 'windows-x64'
      || plan.userSid !== context.identity.sid || plan.release.repository !== RELEASE_REPOSITORY
      || plan.release.sourceRepository !== SOURCE_REPOSITORY || !isDesktopMcpUrl(plan.connection.url)
      || plan.connection.profile !== 'default' || plan.installation.dataOwnershipAcknowledged !== true) {
    fail('invalid_plan', 'plan is outside the reviewed automatic-install contract');
  }
  requirePattern(plan.userSid, SID_PATTERN, 'plan user SID');
  requirePattern(plan.release.version, SEMVER_PATTERN, 'plan version');
  requirePattern(plan.release.sourceRevision, REVISION_PATTERN, 'plan source revision');
  if (plan.release.tag !== `v${plan.release.version}`) fail('invalid_plan', 'plan release tag is invalid');
  requireSafeInteger(plan.release.id, 'plan release ID', { positive: true });
  requireSafeText(plan.release.targetCommitish, 'plan target commitish', 512);
  const installerName = `JishuDB-Windows-x64-${plan.release.version}-Setup.exe`;
  const expectedNames = {
    installer: installerName,
    checksum: `${installerName}.sha256`,
    candidate: `${installerName}.candidate.json`,
  };
  for (const role of ['installer', 'checksum', 'candidate']) {
    const asset = plan.assets[role];
    requireSafeInteger(asset.id, `plan ${role} ID`, { positive: true });
    requireSafeInteger(asset.size, `plan ${role} size`, { positive: true });
    requirePattern(asset.sha256, SHA256_PATTERN, `plan ${role} digest`);
    if (asset.role !== role || asset.name !== expectedNames[role]
        || asset.url !== `${API_ORIGIN}/repos/${RELEASE_REPOSITORY}/releases/assets/${asset.id}`) {
      fail('invalid_plan', `plan ${role} asset identity is invalid`);
    }
  }
  const localAppData = context.localAppData;
  if (plan.installation.applicationRoot !== path.join(localAppData, 'Programs', 'JishuDB')
      || plan.installation.dataRoot !== path.join(localAppData, 'Programs', 'JishuDBData')
      || plan.installation.bootstrapPath !== path.join(localAppData, 'JishuDB', 'data-location.json')
      || typeof plan.installation.desktopShortcut !== 'boolean') {
    fail('invalid_plan', 'plan installation destinations are invalid');
  }
  if (!CONNECTION_NAME_PATTERN.test(plan.connection.name)
      || typeof plan.connection.client !== 'string' || !plan.connection.client.trim()
      || plan.connection.client.length > 4096 || /[\u0000-\u001f\u007f]/.test(plan.connection.client)
      || typeof plan.connection.configTarget !== 'string' || plan.connection.configTarget.length > 4096
      || /[\u0000-\u001f\u007f]/.test(plan.connection.configTarget)
      || !path.isAbsolute(plan.connection.configTarget)) {
    fail('invalid_plan', 'plan connection identity is invalid');
  }
  try {
    const normalizedConfigTarget = assertNoReparseAncestors(plan.connection.configTarget, 'plan ConfigTarget');
    if (normalizedConfigTarget.toLowerCase() !== plan.connection.configTarget.toLowerCase()) {
      fail('invalid_plan', 'plan ConfigTarget is not canonical');
    }
  } catch (error) {
    if (error instanceof InstallError && error.category !== 'invalid_plan') fail('invalid_plan', error.publicMessage);
    throw error;
  }
  if (plan.publisher.identity !== 'none' || plan.publisher.authenticode !== 'not-signed'
      || plan.publisher.smartScreen !== 'unknown-publisher-manual-approval-required') {
    fail('invalid_plan', 'plan publisher identity is invalid');
  }
  const createdAt = parseStrictIso(plan.createdAt, 'plan createdAt');
  const expiresAt = parseStrictIso(plan.expiresAt, 'plan expiresAt');
  const now = new Date();
  if (expiresAt <= createdAt || expiresAt - createdAt > PLAN_TTL_MILLISECONDS || now > expiresAt
      || createdAt.getTime() > now.getTime() + 5 * 60 * 1000) {
    fail('expired_plan', 'installation plan is expired or has an invalid lifetime');
  }
}

function writeDesktopEndpointConfig(bootstrapPath, mcpUrl, context) {
  if (!isDesktopMcpUrl(mcpUrl)) fail('invalid_endpoint', 'approved Desktop MCP endpoint is invalid');
  const stateRoot = path.dirname(bootstrapPath);
  if (!fs.existsSync(stateRoot)) createPrivateDirectory(stateRoot, context.identity, context.tools);
  else assertRegularPath(stateRoot, 'directory', 'invalid_endpoint');
  const endpointPath = path.join(stateRoot, ENDPOINT_CONFIG_FILENAME);
  if (fs.existsSync(endpointPath)) fail('endpoint_conflict', 'Desktop endpoint configuration appeared before launch');
  const port = Number(new URL(mcpUrl).port);
  writePrivateFileExclusive(endpointPath, `${JSON.stringify({ localPort: port, schemaVersion: ENDPOINT_CONFIG_SCHEMA }, null, 2)}\n`, context.identity, context.tools);
}

async function runExecute(args, context) {
  assertWindowsX64();
  if (!args.planPath.trim() || !args.planSha256.trim()) fail('invalid_arguments', 'PlanPath and PlanSha256 are required in execute mode');
  requirePattern(args.planSha256, SHA256_PATTERN, 'PlanSha256');
  let resolvedPlan;
  try {
    resolvedPlan = assertNoReparseAncestors(args.planPath, 'plan path');
  } catch (error) {
    if (error instanceof InstallError) fail('invalid_plan', error.publicMessage);
    throw error;
  }
  const transactionRoot = path.dirname(resolvedPlan);
  assertRegularPath(transactionRoot, 'directory');
  assertPrivateAcl(transactionRoot, true, context.identity, context.tools);
  const planStat = assertRegularPath(resolvedPlan, 'file');
  if (planStat.size <= 0 || planStat.size > MAXIMUM_PLAN_BYTES) fail('invalid_plan', 'plan size is invalid');
  assertPrivateAcl(resolvedPlan, false, context.identity, context.tools);
  const planBytes = fs.readFileSync(resolvedPlan);
  if (planBytes.length !== planStat.size || sha256Bytes(planBytes) !== args.planSha256) {
    fail('plan_digest_mismatch', 'plan SHA-256 does not match the approved digest');
  }
  let plan;
  try {
    plan = JSON.parse(planBytes.toString('utf8'));
  } catch {
    fail('invalid_plan', 'plan JSON is invalid');
  }
  validatePlan(plan, context);
  const mcpPort = Number(new URL(plan.connection.url).port);
  if (!await isTcpPortAvailable(mcpPort)) fail('endpoint_conflict', 'the approved Desktop MCP port is no longer available; create a new plan');
  for (const target of [plan.installation.applicationRoot, plan.installation.dataRoot]) {
    if (fs.existsSync(target)) fail('existing_installation', 'automatic installation requires absent application and data destinations');
  }

  const installerPath = path.join(transactionRoot, plan.assets.installer.name);
  const checksumPath = path.join(transactionRoot, plan.assets.checksum.name);
  const candidatePath = path.join(transactionRoot, plan.assets.candidate.name);
  try {
    await assertReleaseMatchesPlan(plan);
    for (const [asset, destination, maximumBytes, timeoutMilliseconds] of [
      [plan.assets.candidate, candidatePath, MAXIMUM_JSON_BYTES, SMALL_ASSET_TIMEOUT_MILLISECONDS],
      [plan.assets.checksum, checksumPath, MAXIMUM_CHECKSUM_BYTES, SMALL_ASSET_TIMEOUT_MILLISECONDS],
      [plan.assets.installer, installerPath, MAXIMUM_ASSET_BYTES, HTTP_TIMEOUT_MILLISECONDS],
    ]) {
      await saveAsset(asset.url, destination, maximumBytes, timeoutMilliseconds);
      assertFileSize(destination, asset.size, asset.role);
      assertFileDigest(destination, asset.sha256, asset.role);
    }
    const expectedChecksum = `${plan.assets.installer.sha256}  ${plan.assets.installer.name}\n`;
    if (fs.readFileSync(checksumPath, 'utf8').replaceAll('\r\n', '\n') !== expectedChecksum) {
      fail('invalid_checksum', 'adjacent checksum content is not exact');
    }
    const candidate = JSON.parse(fs.readFileSync(candidatePath, 'utf8'));
    const selected = {
      version: plan.release.version,
      installer: {
        id: plan.assets.installer.id,
        name: plan.assets.installer.name,
        size: plan.assets.installer.size,
        state: 'uploaded',
        url: plan.assets.installer.url,
        digest: `sha256:${plan.assets.installer.sha256}`,
      },
    };
    validateWindowsCandidate(candidate, selected);
    if ((candidate.agentBackgroundLaunch === 1) !== (plan.schema === BACKGROUND_PLAN_SCHEMA)) fail('invalid_candidate', 'Agent launch capability no longer matches the approved plan');
    if (candidate.revision !== plan.release.sourceRevision) fail('invalid_candidate', 'candidate source revision does not match the approved plan');
    await assertReleaseMatchesPlan(plan);

    const installer = childProcess.spawnSync(installerPath, [
      '/S',
      `/JISHUDB_AGENT_PLAN=${resolvedPlan}`,
      `/JISHUDB_AGENT_PLAN_SHA256=${args.planSha256}`,
    ], {
      env: sanitizedChildEnvironment(),
      stdio: 'ignore',
      windowsHide: false,
      shell: false,
    });
    if (installer.error) throw installer.error;
    if (installer.status !== 0) fail('installer_failed', `Windows installer returned exit code ${installer.status}`);

    const application = path.join(plan.installation.applicationRoot, 'JishuDB.exe');
    const runtime = path.join(plan.installation.applicationRoot, 'resources', 'runtime', 'jishudb.exe');
    assertRegularPath(application, 'file', 'installed_receipt_invalid');
    assertRegularPath(plan.installation.bootstrapPath, 'file', 'installed_receipt_invalid');
    assertRegularPath(runtime, 'file', 'installed_receipt_invalid');
    writeDesktopEndpointConfig(plan.installation.bootstrapPath, plan.connection.url, context);
    const launched = childProcess.spawn(application, plan.launchMode === 'agent-background' ? ['--jishudb-agent-background'] : [], {
      detached: true,
      env: sanitizedChildEnvironment(),
      stdio: 'ignore',
      windowsHide: false,
      shell: false,
    });
    await new Promise((resolve, reject) => {
      launched.once('spawn', resolve);
      launched.once('error', reject);
    });
    launched.unref();
    return {
      status: 'installed',
      version: plan.release.version,
      applicationRoot: plan.installation.applicationRoot,
      dataRoot: plan.installation.dataRoot,
      mcpUrl: plan.connection.url,
      next: 'wait_for_desktop_and_user_onboarding',
    };
  } finally {
    for (const target of [installerPath, checksumPath, candidatePath]) removeFileQuietly(target);
  }
}

function redactDiagnostic(value) {
  return String(value)
    .replace(/([?&][A-Za-z0-9_.~-]{1,64}=)[^&\s]*/g, '$1<redacted>')
    .replace(/\b(Bearer)\s+[^\s]+/gi, '$1 <redacted>');
}

function sanitizedChildEnvironment(source = process.env) {
  const environment = Object.create(null);
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'string' && CHILD_ENVIRONMENT_ALLOWLIST.has(key.toLowerCase())) {
      environment[key] = value;
    }
  }
  return environment;
}

async function main(argv = process.argv.slice(2)) {
  try {
    const args = parseArguments(argv);
    assertWindowsX64();
    const tools = resolveSystemTools();
    const identity = getCurrentWindowsIdentity(tools);
    const tempRoot = assertNoReparseAncestors(os.tmpdir(), 'temporary directory');
    const localAppData = assertNoReparseAncestors(process.env.LOCALAPPDATA ?? '', 'LOCALAPPDATA');
    assertRegularPath(tempRoot, 'directory', 'unsupported_platform');
    assertRegularPath(localAppData, 'directory', 'unsupported_platform');
    const context = { identity, localAppData, tempRoot, tools };
    let result;
    if (args.mode === 'check') result = await runCheck(context);
    else if (args.mode === 'plan') result = await runPlan(args, context);
    else result = await runExecute(args, context);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return 0;
  } catch (error) {
    const diagnostic = redactDiagnostic(error?.message ?? error);
    process.stderr.write(`${diagnostic}\n`);
    const known = error instanceof InstallError;
    process.stdout.write(`${JSON.stringify({
      status: 'failed',
      errorCategory: known ? error.category : 'unexpected_failure',
      message: known ? error.publicMessage : 'installation helper failed; inspect the local diagnostic',
    })}\n`);
    return 1;
  }
}

const exported = {
  InstallError,
  approvedDesktopMcpPorts,
  assertPlanShape,
  compareSemver,
  getReleasePages,
  isAllowedAssetRedirect,
  isDesktopMcpUrl,
  isPrivateAclEntries,
  normalizeLocalWindowsPath,
  parseArguments,
  parseIcaclsEntries,
  parseSemver,
  redactDiagnostic,
  sanitizedChildEnvironment,
  selectEligibleRelease,
  validatePlan,
  validateWindowsCandidate,
};

const commonJsModule = typeof module === 'object' && module?.exports ? module : null;
if (commonJsModule) commonJsModule.exports = exported;

const directCommonJsExecution = commonJsModule && typeof require === 'function' && require.main === commonJsModule;
if (!commonJsModule || directCommonJsExecution) {
  main().then((status) => { process.exitCode = status; });
}
