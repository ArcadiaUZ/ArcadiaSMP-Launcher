'use strict';

/**
 * End-to-end updater-flow test with a local mirror.
 * Run: node scripts/test-updater-flow.js
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const engine = require('../electron/updater-engine');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const OLD = path.join(process.env.TEMP || __dirname, 'ArcadiaSMP-Launcher-0.2.6-setup.exe');
const OLD_BM = path.join(process.env.TEMP || __dirname, 'release-026.blockmap');
const NEW = path.join(DIST, 'ArcadiaSMP-Launcher-0.2.7-setup.exe');
const NEW_BM = path.join(DIST, 'ArcadiaSMP-Launcher-0.2.7-setup.exe.blockmap');
const CACHE = path.join(process.env.TEMP || __dirname, 'arcadia-updater-flow');

function sha512(file) {
  return crypto.createHash('sha512').update(fs.readFileSync(file)).digest('base64');
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
    if (req.url === '/exe') return serve(NEW, req.headers.range, res);
    if (req.url === '/bm') return serve(NEW_BM, req.headers.range, res);
    res.writeHead(404);
    res.end();
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function main() {
  if (!fs.existsSync(OLD)) throw new Error('0.2.6 release installer topilmadi: ' + OLD);
  fs.rmSync(CACHE, { recursive: true, force: true });
  fs.mkdirSync(CACHE, { recursive: true });
  fs.copyFileSync(OLD, path.join(CACHE, 'installer-0.2.6.exe'));

  const server = await startServer();
  const base = 'http://127.0.0.1:' + server.address().port;

  const meta = {
    version: '0.2.7',
    tag: 'v0.2.7-test',
    path: path.basename(NEW),
    sha512: sha512(NEW),
    size: fs.statSync(NEW).size,
    blockmap: base + '/bm',
    source: 'local',
  };

  try {
    const progress = [];
    const result = await engine.downloadUpdate({
      currentVersion: '0.2.6',
      cacheDir: CACHE,
      meta,
      mirrors: [{ prefix: 'local', url: base + '/exe', speed: 0 }],
      oldBlockmap: engine.readBlockMapFile(OLD_BM),
      onProgress: (p) => progress.push(p),
      log: console,
    });

    if (result.current) throw new Error('update not detected');
    if (!result.installerPath || !fs.existsSync(result.installerPath)) {
      throw new Error('installer yuklanmadi');
    }
    if (sha512(result.installerPath) !== sha512(NEW)) {
      throw new Error('installer SHA-512 mos emas');
    }
    const diffStages = progress.filter((p) => p.mode === 'differential');
    if (!diffStages.length) throw new Error('differential progress yo‘q');
    console.log('mode:', result.mode, 'downloaded:', engine.bytesText(result.download), 'saved:', engine.bytesText(result.saved));
    console.log('installer:', result.installerPath);
    console.log('UPDATER FLOW TEST PASSED');
  } finally {
    server.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
