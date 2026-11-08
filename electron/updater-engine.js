'use strict';

/**
 * ArcadiaSMP updater engine.
 *
 * Trust model:
 *  - update metadata (version, file name, SHA-512, size) is read from the
 *    public GitHub repository over TLS (raw.githubusercontent.com first,
 *    GitHub Releases as a fallback);
 *  - the installer bytes may come from a fast third-party GitHub mirror, but
 *    only after the final file matches the SHA-512 from the metadata.
 *
 * Speed:
 *  - mirrors are probed with a small range request and ranked;
 *  - when the previous installer is cached, the new installer is rebuilt from
 *    the old one plus only the changed blocks (blockmap differential).
 */

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const zlib = require('zlib');
const yaml = require('js-yaml');

const {
  computeOperations,
  OperationKind,
} = require('electron-updater/out/differentialDownloader/downloadPlanBuilder');

const REPO = 'ArcadiaUZ/ArcadiaSMP-Launcher';
const BRANCH = 'main';
const UA = 'ArcadiaSMP-Launcher';
const META_LIMIT = 2 * 1024 * 1024;
const BLOCKMAP_LIMIT = 8 * 1024 * 1024;
const MIRRORS = [
  'https://gh-proxy.com/',
  'https://ghfast.top/',
  'https://github.moeyy.xyz/',
  'https://ghproxy.net/',
];
const DIRECT = 'https://github.com/';

let mirrorCache = { at: 0, version: '', list: null };

const noopLog = {
  info() {},
  warn() {},
  error() {},
  debug() {},
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeVersion(value) {
  return String(value || '')
    .trim()
    .replace(/^v/i, '')
    .split('-')[0];
}

function compareVersions(a, b) {
  const pa = normalizeVersion(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = normalizeVersion(b).split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const va = pa[i] || 0;
    const vb = pb[i] || 0;
    if (va !== vb) return va > vb ? 1 : -1;
  }
  return 0;
}

function isNewer(remote, local) {
  return compareVersions(remote, local) > 0;
}

function bytesText(n) {
  const value = Number(n) || 0;
  if (value >= 1024 * 1024) return (value / (1024 * 1024)).toFixed(1) + ' MB';
  if (value >= 1024) return Math.round(value / 1024) + ' KB';
  return value + ' B';
}

function httpRequest(url, options) {
  const opts = options || {};
  const target = url instanceof URL ? url : new URL(url);
  const lib = target.protocol === 'http:' ? http : https;
  return new Promise((resolve, reject) => {
    const req = lib.get(
      target,
      {
        headers: Object.assign(
          {
            'User-Agent': UA,
            Accept: '*/*',
          },
          opts.headers || {}
        ),
        timeout: opts.timeout || 30000,
      },
      (res) => resolve({ req, res, url: target })
    );
    req.on('error', reject);
    req.setTimeout(opts.timeout || 30000, () => {
      req.destroy(new Error('So‘rov vaqti tugadi (' + target.host + ')'));
    });
    if (opts.onRequest) opts.onRequest(req);
  });
}

async function readBody(res, limit) {
  const max = limit || META_LIMIT;
  let total = 0;
  const chunks = [];
  for await (const chunk of res) {
    total += chunk.length;
    if (total > max) throw new Error('Javob juda katta');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function getBuffer(url, options) {
  const opts = options || {};
  let current = String(url);
  for (let hop = 0; hop <= 6; hop++) {
    const { res } = await httpRequest(current, opts);
    if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
      const location = res.headers.location;
      res.resume();
      if (!location) throw new Error('HTTP ' + res.statusCode + ' — ' + current);
      current = new URL(location, current).toString();
      continue;
    }
    if (res.statusCode !== 200) {
      res.resume();
      throw new Error('HTTP ' + res.statusCode + ' — ' + current);
    }
    return { body: await readBody(res, opts.max), url: current, headers: res.headers };
  }
  throw new Error('Juda ko‘p qayta yo‘naltirish');
}

async function getText(url, options) {
  const result = await getBuffer(url, options);
  return result.body.toString('utf8');
}

function parseLatest(text) {
  const doc = yaml.load(text) || {};
  const files = Array.isArray(doc.files) ? doc.files : [];
  const first = files[0] || {};
  const fileName = String(first.url || doc.path || '').trim();
  const sha512 = String(first.sha512 || doc.sha512 || '').trim();
  const size = Number(first.size || doc.size || 0);
  if (!doc.version || !fileName || !sha512 || !size) {
    throw new Error('Yangilanish metadata’si to‘liq emas');
  }
  return {
    version: String(doc.version).trim(),
    tag: String(doc.tag || '').trim(),
    path: path.basename(fileName),
    sha512,
    size,
    blockMapSize: Number(first.blockMapSize || doc.blockMapSize || 0),
    blockmap: String(doc.blockmap || '').trim(),
    releaseDate: String(doc.releaseDate || ''),
  };
}

async function fetchMeta(log) {
  const sources = [
    'https://raw.githubusercontent.com/' + REPO + '/' + BRANCH + '/update/latest.yml',
    'https://github.com/' + REPO + '/releases/latest/download/latest.yml',
  ];
  const errors = [];
  for (const url of sources) {
    try {
      const text = await getText(url, { timeout: 20000, max: META_LIMIT });
      const meta = parseLatest(text);
      meta.source = url;
      return meta;
    } catch (e) {
      errors.push(url + ': ' + (e.message || e));
      if (log) log.warn('metadata: ' + errors[errors.length - 1]);
    }
  }
  throw new Error('Yangilanish ma’lumotini olib bo‘lmadi. ' + errors.join(' | '));
}

function releaseBase(meta) {
  const tag = meta.tag || 'v' + meta.version;
  return (
    'https://github.com/' +
    REPO +
    '/releases/download/' +
    encodeURIComponent(tag) +
    '/' +
    encodeURIComponent(meta.path)
  );
}

function mirrorUrl(prefix, directUrl) {
  if (prefix === DIRECT) return directUrl;
  return prefix.replace(/\/+$/, '') + '/' + directUrl;
}

function blockmapUrl(meta, directUrl) {
  if (meta.blockmap) {
    if (/^https?:\/\//i.test(meta.blockmap)) return meta.blockmap;
    return (
      'https://raw.githubusercontent.com/' +
      REPO +
      '/' +
      BRANCH +
      '/' +
      meta.blockmap.replace(/^\/+/, '')
    );
  }
  return directUrl + '.blockmap';
}

/**
 * Probe a mirror with a 256 KiB range. Returns null when the mirror does not
 * serve the installer at all; otherwise speed is bytes per millisecond.
 */
function probeMirror(prefix, directUrl, timeout) {
  return new Promise((resolve) => {
    let settled = false;
    let bytes = 0;
    const started = Date.now();
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    try {
      const url = mirrorUrl(prefix, directUrl);
      const { req, res } = { req: null, res: null };
      const target = new URL(url);
      const lib = target.protocol === 'http:' ? http : https;
      const r = lib.get(
        target,
        {
          headers: {
            'User-Agent': UA,
            Accept: '*/*',
            Range: 'bytes=0-262143',
          },
          timeout: timeout || 9000,
        },
        (response) => {
          if (response.statusCode >= 400) {
            response.resume();
            finish(null);
            return;
          }
          response.on('data', (chunk) => {
            bytes += chunk.length;
            if (bytes >= 262144) {
              response.destroy();
              finish({
                prefix,
                url,
                speed: bytes / Math.max(1, Date.now() - started),
                bytes,
                ms: Date.now() - started,
                range: response.statusCode === 206,
              });
            }
          });
          response.on('end', () => {
            if (bytes > 32768) {
              finish({
                prefix,
                url,
                speed: bytes / Math.max(1, Date.now() - started),
                bytes,
                ms: Date.now() - started,
                range: response.statusCode === 206,
              });
            } else {
              finish(null);
            }
          });
          response.on('error', () => finish(null));
        }
      );
      r.on('error', () => finish(null));
      r.setTimeout(timeout || 9000, () => {
        r.destroy();
        finish(null);
      });
    } catch (_) {
      finish(null);
    }
  });
}

async function chooseMirrors(directUrl, version, log) {
  const now = Date.now();
  if (mirrorCache.list && mirrorCache.version === version && now - mirrorCache.at < 10 * 60 * 1000) {
    return mirrorCache.list;
  }
  const probes = await Promise.all(MIRRORS.map((prefix) => probeMirror(prefix, directUrl)));
  const good = probes
    .filter((item) => item && item.speed > 15)
    .sort((a, b) => b.speed - a.speed);
  if (good.length) {
    if (log) {
      log.info(
        'mirror: ' +
          good
            .map((m) => m.prefix + ' ' + Math.round(m.speed) + ' KB/s')
            .join(', ')
      );
    }
    mirrorCache = { at: now, version, list: good };
    return good;
  }
  // Probes failed (GitHub outage or range blocked): still try every mirror,
  // then direct GitHub, when the actual download starts.
  const fallback = MIRRORS.map((prefix) => ({ prefix, url: mirrorUrl(prefix, directUrl), speed: 0, range: true }));
  fallback.push({ prefix: DIRECT, url: directUrl, speed: 0, range: false });
  mirrorCache = { at: now, version, list: fallback };
  return fallback;
}

function downloadToFile(url, destination, options) {
  const opts = options || {};
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : () => {};
  const timeout = opts.timeout || 45000;
  return new Promise((resolve, reject) => {
    let current = String(url);
    let hops = 0;
    let settled = false;
    const fail = (e) => {
      if (settled) return;
      settled = true;
      reject(e);
    };
    const run = () => {
      if (hops++ > 6) return fail(new Error('Juda ko‘p qayta yo‘naltirish'));
      let target;
      try {
        target = new URL(current);
      } catch (_) {
        return fail(new Error('Noto‘g‘ri URL: ' + current));
      }
      const lib = target.protocol === 'http:' ? http : https;
      const req = lib.get(
        target,
        {
          headers: Object.assign(
            { 'User-Agent': UA, Accept: '*/*' },
            opts.headers || {}
          ),
          timeout,
        },
        (res) => {
          if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
            const location = res.headers.location;
            res.resume();
            if (!location) return fail(new Error('HTTP ' + res.statusCode + ' — ' + current));
            current = new URL(location, current).toString();
            return run();
          }
          if (res.statusCode !== 200) {
            res.resume();
            return fail(new Error('HTTP ' + res.statusCode + ' — ' + current));
          }
          const total = Number(res.headers['content-length']) || opts.total || 0;
          let transferred = 0;
          const out = fs.createWriteStream(destination);
          let last = 0;
          res.on('data', (chunk) => {
            transferred += chunk.length;
            const now = Date.now();
            if (now - last > 180) {
              last = now;
              onProgress({
                transferred,
                total,
                percent: total ? Math.min(100, (transferred / total) * 100) : 0,
                speed: chunk.length / Math.max(1, now - last || 1),
              });
            }
          });
          res.on('error', (e) => {
            out.destroy();
            fail(e);
          });
          out.on('error', fail);
          out.on('finish', () => {
            out.close(() => {
              if (settled) return;
              settled = true;
              onProgress({ transferred, total, percent: 100 });
              resolve({ size: transferred, url: current });
            });
          });
          res.pipe(out);
        }
      );
      req.on('error', fail);
      req.setTimeout(timeout, () => req.destroy(new Error('Yuklash vaqti tugadi')));
    };
    run();
  });
}

function sha512Base64(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha512');
    const stream = fs.createReadStream(file);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('base64')));
  });
}

async function verifyFile(file, sha512, size) {
  try {
    const stat = await fsp.stat(file);
    if (size && stat.size !== size) {
      throw new Error('hajm mos emas: ' + stat.size + ' != ' + size);
    }
    const actual = await sha512Base64(file);
    if (actual !== sha512) {
      throw new Error('SHA-512 mos emas');
    }
    return true;
  } catch (e) {
    throw new Error('Yuklangan fayl tekshiruvdan o‘tmadi: ' + (e.message || e));
  }
}

function readEmbeddedBlockMap(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    if (size < 16) throw new Error('fayl juda kichik');
    const footer = Buffer.alloc(4);
    fs.readSync(fd, footer, 0, 4, size - 4);
    const compressedSize = footer.readUInt32BE(0);
    if (compressedSize <= 0 || compressedSize > BLOCKMAP_LIMIT || compressedSize > size - 8) {
      throw new Error('embedded blockmap topilmadi');
    }
    const data = Buffer.alloc(compressedSize);
    fs.readSync(fd, data, 0, compressedSize, size - 4 - compressedSize);
    return JSON.parse(zlib.inflateRawSync(data).toString('utf8'));
  } finally {
    fs.closeSync(fd);
  }
}

function readBlockMapFile(file) {
  const data = fs.readFileSync(file);
  if (data.length > BLOCKMAP_LIMIT) throw new Error('blockmap juda katta');
  const json = data[0] === 0x1f && data[1] === 0x8b
    ? zlib.gunzipSync(data)
    : zlib.inflateRawSync(data);
  return JSON.parse(json.toString('utf8'));
}

function normalizeBlockMapNames(blockMap, name) {
  const copy = JSON.parse(JSON.stringify(blockMap));
  if (Array.isArray(copy.files)) {
    copy.files.forEach((item) => {
      item.name = name;
    });
  }
  return copy;
}

function planDownload(oldBlockMap, newBlockMap) {
  const logger = { info() {}, warn() {}, error() {}, debug() {} };
  const plan = computeOperations(oldBlockMap, newBlockMap, logger);
  let download = 0;
  let copy = 0;
  for (const op of plan) {
    const length = op.end - op.start;
    if (op.kind === OperationKind.DOWNLOAD) download += length;
    else copy += length;
  }
  return { plan, download, copy };
}

function copyRange(fd, out, start, end) {
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream('', {
      fd,
      autoClose: false,
      start,
      end: end - 1,
    });
    stream.on('error', reject);
    stream.on('end', resolve);
    stream.pipe(out, { end: false });
  });
}

function downloadRangeToFile(url, destination, start, end, timeout) {
  return new Promise((resolve, reject) => {
    let current = String(url);
    let hops = 0;
    let settled = false;
    const fail = (e) => {
      if (settled) return;
      settled = true;
      reject(e);
    };
    const run = () => {
      if (hops++ > 6) return fail(new Error('Juda ko‘p qayta yo‘naltirish'));
      const target = new URL(current);
      const lib = target.protocol === 'http:' ? http : https;
      const req = lib.get(
        target,
        {
          headers: {
            'User-Agent': UA,
            Accept: '*/*',
            Range: 'bytes=' + start + '-' + (end - 1),
          },
          timeout: timeout || 45000,
        },
        (res) => {
          if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
            const location = res.headers.location;
            res.resume();
            if (!location) return fail(new Error('HTTP ' + res.statusCode));
            current = new URL(location, current).toString();
            return run();
          }
          if (res.statusCode !== 206) {
            res.resume();
            return fail(new Error('Range qo‘llanmaydi (HTTP ' + res.statusCode + ')'));
          }
          const expected = end - start;
          const length = Number(res.headers['content-length']) || expected;
          if (length !== expected) {
            res.resume();
            return fail(new Error('Range hajmi mos emas: ' + length + ' != ' + expected));
          }
          const out = fs.createWriteStream(destination);
          res.on('error', (e) => {
            out.destroy();
            fail(e);
          });
          out.on('error', fail);
          out.on('finish', () => {
            out.close(() => {
              if (settled) return;
              settled = true;
              resolve();
            });
          });
          res.pipe(out);
        }
      );
      req.on('error', fail);
      req.setTimeout(timeout || 45000, () => req.destroy(new Error('Range vaqti tugadi')));
    };
    run();
  });
}

function pipeFileToStream(source, out) {
  return new Promise((resolve, reject) => {
    const input = fs.createReadStream(source);
    input.on('error', reject);
    input.on('end', resolve);
    input.pipe(out, { end: false });
  });
}

async function differentialDownload(meta, mirrors, oldInstaller, newFile, onProgress, log, overrides) {
  const opts = overrides || {};
  const directUrl = opts.directUrl || releaseBase(meta);
  const bmUrl = opts.blockmapUrl || blockmapUrl(meta, directUrl);
  const bm = await getBuffer(bmUrl, { timeout: 25000, max: BLOCKMAP_LIMIT });
  const newBlockMap = JSON.parse(
    bm.body[0] === 0x1f && bm.body[1] === 0x8b
      ? zlib.gunzipSync(bm.body).toString('utf8')
      : zlib.inflateRawSync(bm.body).toString('utf8')
  );
  const name = newBlockMap.files && newBlockMap.files[0] && newBlockMap.files[0].name;
  if (!name) throw new Error('Yangi blockmap fayl nomisiz');
  const oldSource = opts.oldBlockMap || readEmbeddedBlockMap(oldInstaller);
  const oldBlockMap = normalizeBlockMapNames(oldSource, name);
  const newNormalized = normalizeBlockMapNames(newBlockMap, name);
  const { plan, download, copy } = planDownload(oldBlockMap, newNormalized);
  const fullSize = Number(meta.size) || download + copy;
  if (!download || download >= fullSize * 0.9) {
    throw new Error('Differential foyda bermaydi (' + bytesText(download) + ' / ' + bytesText(fullSize) + ')');
  }
  log.info(
    'differential: ' + bytesText(download) + ' / ' + bytesText(fullSize) + ' (' +
      Math.round((download / fullSize) * 100) + '%)'
  );

  await fsp.mkdir(path.dirname(newFile), { recursive: true });
  const oldFd = fs.openSync(oldInstaller, 'r');
  const out = fs.createWriteStream(newFile);
  const rangeFile = newFile + '.range';
  let done = 0;
  let last = 0;
  try {
    for (const op of plan) {
      if (op.kind === OperationKind.COPY) {
        await copyRange(oldFd, out, op.start, op.end);
      } else {
        let ok = false;
        let lastError = null;
        for (const mirror of mirrors) {
          try {
            await downloadRangeToFile(mirror.url, rangeFile, op.start, op.end, 45000);
            await pipeFileToStream(rangeFile, out);
            ok = true;
            break;
          } catch (e) {
            lastError = e;
            log.warn('range ' + mirror.prefix + ': ' + (e.message || e));
          }
        }
        if (!ok) throw lastError || new Error('Range yuklanmadi');
        done += op.end - op.start;
        const now = Date.now();
        if (now - last > 180) {
          last = now;
          onProgress({
            transferred: done,
            total: download,
            percent: Math.min(100, (done / download) * 100),
            mode: 'differential',
            saved: fullSize - download,
          });
        }
      }
    }
    await new Promise((resolve, reject) => {
      out.end(resolve);
      out.on('error', reject);
    });
  } catch (e) {
    out.destroy();
    await fsp.rm(newFile, { force: true }).catch(() => {});
    throw e;
  } finally {
    fs.closeSync(oldFd);
    await fsp.rm(rangeFile, { force: true }).catch(() => {});
  }
  onProgress({ transferred: download, total: download, percent: 100, mode: 'differential', saved: fullSize - download });
  await verifyFile(newFile, meta.sha512, meta.size);
  return { mode: 'differential', download, saved: fullSize - download };
}

function candidateOldInstallers(currentVersion) {
  const list = [];
  const local = process.env.LOCALAPPDATA || '';
  const temp = process.env.TEMP || process.env.TMP || '';
  if (local) {
    const pending = path.join(local, 'arcadia-launcher-updater', 'pending', 'installer.exe');
    list.push(pending);
    const root = path.join(local, 'arcadia-launcher-updater');
    try {
      const entries = fs.readdirSync(root, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.toLowerCase().endsWith('.exe')) {
          list.push(path.join(root, entry.name));
        }
      }
    } catch (_) {
      /* no cache */
    }
  }
  if (temp) {
    try {
      const entries = fs.readdirSync(temp, { withFileTypes: true });
      for (const entry of entries) {
        if (
          entry.isFile() &&
          /^ArcadiaSMP-Launcher-.*-setup\.exe$/i.test(entry.name) &&
          entry.name.toLowerCase().includes(String(currentVersion).toLowerCase())
        ) {
          list.push(path.join(temp, entry.name));
        }
      }
      for (const entry of entries) {
        if (entry.isFile() && /^ArcadiaSMP-Launcher-.*-setup\.exe$/i.test(entry.name)) {
          list.push(path.join(temp, entry.name));
        }
      }
    } catch (_) {
      /* no temp access */
    }
  }
  const seen = new Set();
  const result = [];
  for (const file of list) {
    if (!file || seen.has(file)) continue;
    seen.add(file);
    try {
      const stat = fs.statSync(file);
      if (!stat.isFile() || stat.size < 20 * 1024 * 1024) continue;
      const head = Buffer.alloc(2);
      const fd = fs.openSync(file, 'r');
      fs.readSync(fd, head, 0, 2, 0);
      fs.closeSync(fd);
      if (head[0] !== 0x4d || head[1] !== 0x5a) continue;
      result.push({ file, size: stat.size, mtime: stat.mtimeMs });
    } catch (_) {
      /* not an installer */
    }
  }
  result.sort((a, b) => {
    const av = String(a.file).toLowerCase().includes(String(currentVersion).toLowerCase()) ? 1 : 0;
    const bv = String(b.file).toLowerCase().includes(String(currentVersion).toLowerCase()) ? 1 : 0;
    if (av !== bv) return bv - av;
    return b.mtime - a.mtime;
  });
  return result;
}

async function findOldInstaller(cacheDir, currentVersion) {
  const cached = path.join(cacheDir, 'installer-' + normalizeVersion(currentVersion) + '.exe');
  try {
    const stat = await fsp.stat(cached);
    if (stat.size > 20 * 1024 * 1024) return cached;
  } catch (_) {
    /* seed below */
  }
  const candidates = candidateOldInstallers(currentVersion);
  if (!candidates.length) return null;
  const source = candidates[0].file;
  try {
    await fsp.mkdir(cacheDir, { recursive: true });
    await fsp.copyFile(source, cached);
    return cached;
  } catch (_) {
    return null;
  }
}

async function fetchOldBlockmap(currentVersion, cacheDir, log) {
  const version = normalizeVersion(currentVersion);
  if (!version) return null;
  const cached = path.join(cacheDir, 'old-' + version + '.blockmap');
  try {
    const data = await fsp.readFile(cached);
    return JSON.parse(
      data[0] === 0x1f && data[1] === 0x8b
        ? zlib.gunzipSync(data).toString('utf8')
        : zlib.inflateRawSync(data).toString('utf8')
    );
  } catch (_) {
    /* fetch below */
  }
  const url =
    'https://raw.githubusercontent.com/' +
    REPO +
    '/' +
    BRANCH +
    '/update/old/' +
    encodeURIComponent(version) +
    '.blockmap';
  try {
    const data = await getBuffer(url, { timeout: 20000, max: BLOCKMAP_LIMIT });
    await fsp.mkdir(cacheDir, { recursive: true });
    await fsp.writeFile(cached, data.body);
    return JSON.parse(
      data.body[0] === 0x1f && data.body[1] === 0x8b
        ? zlib.gunzipSync(data.body).toString('utf8')
        : zlib.inflateRawSync(data.body).toString('utf8')
    );
  } catch (e) {
    if (log) log.warn('old blockmap: ' + (e.message || e));
    return null;
  }
}

async function fullDownload(meta, mirrors, destination, onProgress, log) {
  let lastError = null;
  for (const mirror of mirrors) {
    try {
      log.info('full: ' + mirror.prefix);
      const part = destination + '.part';
      await fsp.rm(part, { force: true });
      await downloadToFile(mirror.url, part, {
        total: meta.size,
        onProgress: (p) => onProgress(Object.assign({ mode: 'full' }, p)),
      });
      await verifyFile(part, meta.sha512, meta.size);
      await fsp.rm(destination, { force: true });
      await fsp.rename(part, destination);
      return { mode: 'full', mirror: mirror.prefix };
    } catch (e) {
      lastError = e;
      log.warn('full ' + mirror.prefix + ': ' + (e.message || e));
    }
  }
  throw lastError || new Error('Installerni yuklab bo‘lmadi');
}

/**
 * Check for an update and download it into cacheDir.
 *
 * @returns {Promise<{current:boolean, version?:string, installerPath?:string, mode?:string, mirror?:string, meta?:object}>}
 */
async function downloadUpdate(options) {
  const opts = options || {};
  const currentVersion = opts.currentVersion;
  const cacheDir = opts.cacheDir;
  const log = opts.log || noopLog;
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : () => {};

  const meta = opts.meta || (await fetchMeta(log));
  if (!isNewer(meta.version, currentVersion)) {
    return { current: true, meta };
  }
  if (!cacheDir) throw new Error('Updater cache papkasi berilmagan');

  const directUrl = releaseBase(meta);
  const destination = path.join(cacheDir, 'installer-' + normalizeVersion(meta.version) + '.exe');
  try {
    await fsp.access(destination);
    await verifyFile(destination, meta.sha512, meta.size);
    return { current: false, cached: true, version: meta.version, installerPath: destination, mode: 'cached', meta };
  } catch (_) {
    /* download it */
  }

  await fsp.mkdir(cacheDir, { recursive: true });

  onProgress({ stage: 'mirrors', percent: 0, text: 'Tez server tanlanmoqda…' });
  const mirrors = opts.mirrors || (await chooseMirrors(directUrl, meta.version, log));

  const oldInstaller = await findOldInstaller(cacheDir, currentVersion);
  if (oldInstaller) {
    const oldBlockMap = opts.oldBlockmap || (await fetchOldBlockmap(currentVersion, cacheDir, log));
    if (oldBlockMap) {
      try {
        onProgress({ stage: 'differential', percent: 0, text: 'Tez yangilanish tayyorlanmoqda…' });
        const diff = await differentialDownload(meta, mirrors, oldInstaller, destination, onProgress, log, {
          oldBlockMap,
        });
        return {
          current: false,
          version: meta.version,
          installerPath: destination,
          mode: diff.mode,
          saved: diff.saved,
          download: diff.download,
          meta,
        };
      } catch (e) {
        log.warn('differential ishlamadi: ' + (e.message || e));
        await fsp.rm(destination, { force: true }).catch(() => {});
      }
    }
  }

  onProgress({ stage: 'full', percent: 0, text: 'To‘liq yangilanish yuklanmoqda…' });
  const result = await fullDownload(meta, mirrors, destination, onProgress, log);
  return {
    current: false,
    version: meta.version,
    installerPath: destination,
    mode: result.mode,
    mirror: result.mirror,
    meta,
  };
}

module.exports = {
  REPO,
  MIRRORS,
  compareVersions,
  isNewer,
  normalizeVersion,
  bytesText,
  getText,
  getBuffer,
  parseLatest,
  fetchMeta,
  releaseBase,
  blockmapUrl,
  chooseMirrors,
  probeMirror,
  downloadToFile,
  verifyFile,
  readEmbeddedBlockMap,
  readBlockMapFile,
  normalizeBlockMapNames,
  planDownload,
  differentialDownload,
  findOldInstaller,
  candidateOldInstallers,
  fetchOldBlockmap,
  fullDownload,
  downloadUpdate,
};
