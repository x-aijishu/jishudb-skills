import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../skills/jishudb/scripts/install-macos.zsh', import.meta.url), 'utf8');
const embedded = source.match(/<<'JXA'\r?\n([\s\S]*?)\r?\nJXA\r?\n/)[1];
const { validateDownloadSlice } = runInNewContext(`${embedded}\n({validateDownloadSlice});`, {
  ObjC: { import() {} },
});

function headers(start, end, total, extra = '') {
  return `HTTP/1.1 200 Connection Established\r\n\r\nHTTP/2 206\r\nContent-Range: bytes ${start}-${end}/${total}\r\n${extra}\r\n`;
}

test('bounded timeout commits only received bytes and the next slice starts there', () => {
  const first = validateDownloadSlice(headers(0, 99, 250), '206', 0, 99, 250, 37, 28);
  assert.equal(first, 37);
  const second = validateDownloadSlice(headers(first, 136, 250), '206', first, 136, 250, 100, 0);
  const final = validateDownloadSlice(headers(first + second, 249, 250), '206', 137, 249, 250, 113, 0);
  assert.equal(first + second + final, 250);
});

test('ignored range, wrong offsets, wrong total, duplicate ranges and encoding fail closed', () => {
  for (const [response, code] of [
    ['HTTP/2 200\r\nContent-Length: 250\r\n\r\n', '200'],
    [headers(0, 99, 250), '206'],
    [headers(100, 198, 250), '206'],
    [headers(100, 199, 251), '206'],
    [headers(100, 199, 250, 'Content-Range: bytes 100-199/250\r\n'), '206'],
    [headers(100, 199, 250, 'Content-Encoding: gzip\r\n'), '206'],
  ]) {
    assert.throws(() => validateDownloadSlice(response, code, 100, 199, 250, 50, 28));
  }
});

test('only a bounded timeout may return a partial range', () => {
  assert.throws(() => validateDownloadSlice(headers(0, 99, 250), '206', 0, 99, 250, 50, 0), /truncated/);
  assert.throws(() => validateDownloadSlice(headers(0, 99, 250), '206', 0, 99, 250, 50, 18));
  assert.throws(() => validateDownloadSlice(headers(0, 99, 250), '206', 0, 99, 250, 101, 28));
  assert.throws(() => validateDownloadSlice(headers(0, 99, 250), '206', -1, 99, 250, 50, 28));
  assert.throws(() => validateDownloadSlice(headers(0, 99, 250), '206', 0, 99, 250, NaN, 28));
  assert.equal(validateDownloadSlice(headers(0, 99, 250), '206', 0, 99, 250, 0, 28), 0);
});
