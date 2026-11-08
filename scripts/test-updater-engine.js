'use strict';

/**
 * Offline/local test for the updater engine.
 * Run: node scripts/test-updater-engine.js
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const engine = require('../electron/updater-engine');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const OLD_EXE = path.join(DIST, 'ArcadiaSMP-Launcher-0.2.5-setup.exe');
const NEW_EXE = path.join(DIST, 'ArcadiaSMP-Launcher-0.2.6-setup.exe');
const NEW_BM = path.join(DIST, 'ArcadiaSMP-Launcher-0.2.6-setup.exe.blockmap');
const TMP = path.join(process.env.TEMP || __dirname, 'arcadia-updater-test');

function sha512(file) {
  return crypto.createHash('sha512').update(fs.readFileSync(file)).digest('base64');
}

function assert(condition, message) {
  if (!condition) throw new Error('FAIL: ' + message);
  console.log('ok - ' + message);
}

function serve(file, range, res) {
  const stat = fs.statSync(file);
  if (range) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(range);
    if (!match) {
      res.writeHead(416);
      res.end();
      return;
    }
    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : stat.size - 1;
    if (start >= stat.size || end < start) {
      res.writeHead(416);
      res.end();
      return;
    }
    res.writeHead(206, {
      'Content-Type': 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      'Content-Range': 'bytes ' + start + '-' + end + '/' + stat.size,
      'Content-Length': end - start + 1,
    });
    fs.createReadStream(file, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, {
    'Content-Type': 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Content-Length': stat.size,
  });
  fs.createReadStream(file).pipe(res);
}

function startServer() {
  const server = http.createServer((req, res) => {
    if (req.url === '/exe') return serve(NEW_EXE, req.headers.range, res);
    if (req.url === '/bm') return serve(NEW_BM, req.headers.range, res);
    res.writeHead(404);
    res.end('nope');
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function main() {
  assert(engine.compareVersions('0.2.7', '0.2.6') > 0, 'version 0.2.7 > 0.2.6');
  assert(engine.compareVersions('0.2.6', '0.2.6') === 0, 'version 0.2.6 == 0.2.6');
  assert(engine.compareVersions('0.2.5', '0.2.6') < 0, 'version 0.2.5 < 0.2.6');

  const oldMap = engine.readBlockMapFile(path.join(DIST, 'ArcadiaSMP-Launcher-0.2.5-setup.exe.blockmap'));
  const newMap = engine.readBlockMapFile(NEW_BM);
  assert(!!oldMap.files && !!newMap.files, 'blockmaps read');

  const plan = engine.planDownload(
    engine.normalizeBlockMapNames(oldMap, newMap.files[0].name),
    newMap
  );
  console.log(
    'differential plan: download ' +
      engine.bytesText(plan.download) +
      ' / ' +
      engine.bytesText(plan.download + plan.copy) +
      ' (' +
      Math.round((plan.download / (plan.download + plan.copy)) * 100) +
      '%)'
  );

  fs.mkdirSync(TMP, { recursive: true });
  const server = await startServer();
  const base = 'http://127.0.0.1:' + server.address().port;
  const meta = {
    version: '0.2.6',
    tag: 'v0.2.6-test',
    path: path.basename(NEW_EXE),
    sha512: sha512(NEW_EXE),
    size: fs.statSync(NEW_EXE).size,
    blockmap: 'unused',
  };

  const diffFile = path.join(TMP, 'diff.exe');
  await fs.promises.rm(diffFile, { force: true });
  const diff = await engine.differentialDownload(
    meta,
    [{ prefix: 'local', url: base + '/exe' }],
    OLD_EXE,
    diffFile,
    () => {},
    console,
    { directUrl: base + '/exe', blockmapUrl: base + '/bm', oldBlockMap: oldMap }
  );
  assert(diff.mode === 'differential', 'diff mode reported');
  assert(sha512(diffFile) === meta.sha512, 'differential output SHA-512 matches');
  assert(fs.statSync(diffFile).size === meta.size, 'differential output size matches');

  const fullFile = path.join(TMP, 'full.exe');
  await fs.promises.rm(fullFile, { force: true });
  const full = await engine.fullDownload(
    meta,
    [{ prefix: 'local', url: base + '/exe' }],
    fullFile,
    () => {},
    console
  );
  assert(full.mode === 'full', 'full mode reported');
  assert(sha512(fullFile) === meta.sha512, 'full output SHA-512 matches');

  server.close();
  console.log('ALL UPDATER ENGINE TESTS PASSED');
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
