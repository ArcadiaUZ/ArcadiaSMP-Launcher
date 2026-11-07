'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { Readable } = require('stream');
const { spawn } = require('child_process');
const { URL } = require('url');
const { readConfig } = require('./config');
const mc = require('./minecraft');

const API = 'https://api.modrinth.com/v2';
const UA = 'ArcadiaSMP-Launcher/0.2.2 (arcadiasmp.local; contact@arcadiasmp.local)';
const ALLOWED_HOSTS = new Set(['cdn.modrinth.com', 'cdn-raw.modrinth.com']);

const TYPES = {
  mod: { projectType: 'mod', dir: 'mods', loader: true },
  resourcepack: { projectType: 'resourcepack', dir: 'resourcepacks', loader: false },
  shader: { projectType: 'shader', dir: 'shaderpacks', loader: false },
  datapack: { projectType: 'datapack', dir: 'datapacks', loader: false },
  modpack: { projectType: 'modpack', dir: 'modpacks', loader: false },
};

function apiError(status) {
  if (status === 429) return 'Modrinth so\u2018rovlari cheklandi. Bir oz kutib qayta urinib ko\u2018ring.';
  if (status === 404) return 'Modrinth\u2019da bunday loyiha topilmadi.';
  return 'Modrinth xatosi (HTTP ' + status + ').';
}

async function api(pathname, params) {
  const url = new URL(API + pathname);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
    }
  }
  let response;
  try {
    response = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
    });
  } catch (_) {
    throw new Error('Modrinth\u2019ga ulanib bo\u2018lmadi. Internetni tekshiring.');
  }
  if (!response.ok) throw new Error(apiError(response.status));
  return response.json();
}

function facets(type, loader, gameVersion) {
  const def = TYPES[type] || TYPES.mod;
  const groups = [['project_type:' + def.projectType]];
  if (def.loader && loader && loader !== 'vanilla') groups.push(['categories:' + loader]);
  if (gameVersion) groups.push(['versions:' + gameVersion]);
  return JSON.stringify(groups);
}

function cleanHit(hit, type) {
  return {
    id: hit.project_id,
    slug: hit.slug,
    title: hit.title,
    description: hit.description,
    icon: hit.icon_url || null,
    downloads: hit.downloads || 0,
    follows: hit.follows || 0,
    categories: hit.categories || [],
    versions: hit.versions || [],
    author: hit.author || '',
    type: type || 'mod',
    url: 'https://modrinth.com/' + ((TYPES[type] || TYPES.mod).projectType) + '/' + hit.slug,
  };
}

async function search(input) {
  const data = input || {};
  const type = TYPES[data.type] ? data.type : 'mod';
  const params = {
    query: String(data.query || '').trim(),
    limit: Math.max(1, Math.min(30, Number(data.limit) || 20)),
    offset: Math.max(0, Number(data.offset) || 0),
    index: ['relevance', 'downloads', 'follows', 'newest', 'updated'].includes(data.sort)
      ? data.sort
      : 'relevance',
    facets: facets(type, data.loader, data.gameVersion),
  };
  const result = await api('/search', params);
  return {
    hits: (result.hits || []).map((h) => cleanHit(h, type)),
    total: result.total_hits || 0,
    offset: result.offset || 0,
    type: type,
  };
}

async function versions(projectId, options) {
  const opts = options || {};
  const id = String(projectId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!id) throw new Error('Loyiha ID noto\u2018g\u2018ri.');
  const params = {};
  if (opts.gameVersion) params.game_versions = JSON.stringify([opts.gameVersion]);
  if (opts.loader && opts.loader !== 'vanilla') params.loaders = JSON.stringify([opts.loader]);
  const list = await api('/project/' + encodeURIComponent(id) + '/version', params);
  return Array.isArray(list) ? list : [];
}

async function project(projectId) {
  const id = String(projectId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!id) throw new Error('Loyiha ID noto\u2018g\u2018ri.');
  return api('/project/' + encodeURIComponent(id));
}

async function versionById(versionId) {
  const id = String(versionId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!id) throw new Error('Versiya ID noto\u2018g\u2018ri.');
  return api('/version/' + encodeURIComponent(id));
}

function safeName(name) {
  return path
    .basename(String(name || 'download.bin'))
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .slice(0, 180);
}

async function downloadOnce(url, destination, onProgress) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !ALLOWED_HOSTS.has(parsed.hostname)) {
    throw new Error('Fayl manbasi xavfsiz emas: ' + parsed.hostname);
  }
  const part = destination + '.part';
  let resumeAt = 0;
  try {
    resumeAt = fs.statSync(part).size || 0;
  } catch (_) {
    resumeAt = 0;
  }
  const headers = { 'User-Agent': UA, 'Accept-Encoding': 'identity' };
  if (resumeAt > 0) headers.Range = 'bytes=' + resumeAt + '-';
  const controller = new AbortController();
  let watchdog = null;
  const arm = () => {
    clearTimeout(watchdog);
    watchdog = setTimeout(() => controller.abort(), 30000);
  };
  arm();
  let response;
  try {
    response = await fetch(parsed, {
      headers,
      redirect: 'follow',
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(watchdog);
    throw new Error('Yuklab olish uzildi: ' + (e.message || 'tarmoq xatosi'));
  }
  const finalUrl = new URL(response.url || parsed.toString());
  if (!ALLOWED_HOSTS.has(finalUrl.hostname)) {
    throw new Error('Fayl manbasi xavfsiz emas: ' + finalUrl.hostname);
  }
  if (response.status === 416) {
    clearTimeout(watchdog);
    try { fs.rmSync(part, { force: true }); } catch (_) { /* ignore */ }
    throw new Error('Qism fayl noto\u2018g\u2018ri, qayta yuklanadi.');
  }
  if (response.status !== 200 && response.status !== 206) {
    clearTimeout(watchdog);
    throw new Error('Yuklab olish xatosi (HTTP ' + response.status + ').');
  }
  const append = response.status === 206 && resumeAt > 0;
  const length = Number(response.headers.get('content-length')) || 0;
  const total = append ? resumeAt + length : length;
  let received = append ? resumeAt : 0;
  let lastReport = 0;
  const out = fs.createWriteStream(part, { flags: append ? 'a' : 'w' });
  const body = Readable.fromWeb(response.body);
  await new Promise((resolve, reject) => {
    let settled = false;
    const fail = (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      body.destroy();
      out.destroy();
      reject(e);
    };
    out.on('error', fail);
    body.on('error', fail);
    body.on('data', (chunk) => {
      arm();
      received += chunk.length;
      const now = Date.now();
      if (onProgress && now - lastReport > 120) {
        lastReport = now;
        onProgress({ received, total, percent: total ? Math.round((received / total) * 100) : 0 });
      }
    });
    body.pipe(out);
    out.on('finish', () => {
      out.close(() => {
        if (settled) return;
        settled = true;
        clearTimeout(watchdog);
        try {
          fs.rmSync(destination, { force: true });
          fs.renameSync(part, destination);
          resolve({ size: received });
        } catch (e) {
          reject(e);
        }
      });
    });
  });
}

function curlPath() {
  if (process.platform !== 'win32') return null;
  const candidates = [
    path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'curl.exe'),
    'curl.exe',
  ];
  for (const candidate of candidates) {
    try {
      if (candidate === 'curl.exe' || fs.existsSync(candidate)) return candidate;
    } catch (_) {
      /* try next */
    }
  }
  return null;
}

function downloadCurl(url, destination, onProgress, expectedSize) {
  return new Promise((resolve, reject) => {
    const part = destination + '.part';
    const total = Number(expectedSize) || 0;
    try {
      if (total && fs.statSync(part).size > total) fs.rmSync(part, { force: true });
    } catch (_) {
      /* no partial file yet */
    }
    const args = [
      '--location',
      '--max-redirs', '5',
      '--proto', '=https',
      '--proto-redir', '=https',
      '--fail',
      '--silent',
      '--show-error',
      '--retry', '5',
      '--retry-delay', '1',
      '--retry-all-errors',
      '--continue-at', '-',
      '--connect-timeout', '20',
      '--max-time', '900',
      '--speed-limit', '1024',
      '--speed-time', '45',
      '--user-agent', UA,
      '--output', part,
      url,
    ];
    const child = spawn(curlPath(), args, { windowsHide: true });
    let stderr = '';
    let lastReport = 0;
    const timer = setInterval(() => {
      try {
        const received = fs.statSync(part).size || 0;
        const now = Date.now();
        if (onProgress && now - lastReport > 200) {
          lastReport = now;
          onProgress({
            received,
            total,
            percent: total ? Math.min(99, Math.round((received / total) * 100)) : 0,
          });
        }
      } catch (_) {
        /* part file may not exist yet */
      }
    }, 300);
    child.stderr.on('data', (d) => {
      stderr = (stderr + String(d)).slice(-800);
    });
    child.on('error', (e) => {
      clearInterval(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearInterval(timer);
      if (code !== 0) {
        reject(new Error(stderr.trim() || 'curl xatosi (' + code + ').'));
        return;
      }
      try {
        const received = fs.statSync(part).size || 0;
        fs.rmSync(destination, { force: true });
        fs.renameSync(part, destination);
        if (onProgress && total) onProgress({ received, total, percent: 100 });
        resolve({ size: received });
      } catch (e) {
        reject(e);
      }
    });
  });
}

async function download(url, destination, onProgress, expectedSize) {
  let lastError = null;
  const curl = curlPath();
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (curl && attempt < 2) {
        return await downloadCurl(url, destination, onProgress, expectedSize);
      }
      return await downloadOnce(url, destination, onProgress);
    } catch (e) {
      lastError = e;
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  throw lastError || new Error('Yuklab olish xatosi.');
}

function targetDir(instanceId, type) {
  return path.join(mc.instanceDir(instanceId), (TYPES[type] || TYPES.mod).dir);
}

async function install(input) {
  const data = input || {};
  const instanceId = data.instanceId;
  if (!instanceId) throw new Error('Instans tanlanmagan.');
  const instances = mc.listInstances();
  const instance = instances.find((i) => i.id === instanceId);
  if (!instance) throw new Error('Instans topilmadi.');
  const type = TYPES[data.type] ? data.type : 'mod';
  if (type === 'mod' && !['fabric', 'forge', 'neoforge', 'quilt'].includes(instance.loader)) {
    throw new Error('Modlarni o\u2018rnatish uchun mod loaderli instans yarating.');
  }
  const loader = type === 'mod' ? instance.loader : null;
  let list = await versions(data.projectId, { gameVersion: instance.version, loader });
  let version = null;
  if (data.versionId) {
    version = list.find((v) => v.id === data.versionId) || null;
    if (!version) {
      try {
        const direct = await versionById(data.versionId);
        if (direct && direct.project_id === data.projectId) version = direct;
      } catch (_) {
        /* fall through to the compatibility error below */
      }
    }
  } else {
    /* Voxy breaks with Sodium newer than 0.9.3-beta and Iris >= 1.12.
       Keep one-click installs compatible when Voxy is already present. */
    const hasVoxy = mc.listContent(instanceId, 'mods').some((f) => /^voxy[-.]/i.test(f.name));
    const pins = { AANobbMI: 'bAZQdGpg', YL57xq9U: 'vTN4NRGW' };
    if (hasVoxy && pins[data.projectId]) {
      version = list.find((v) => v.id === pins[data.projectId]) || list[0] || null;
    } else {
      version = list[0] || null;
    }
  }
  if (!version) {
    throw new Error(
      (data.title || 'Bu loyiha') + ' ' + instance.version + ' uchun mos versiyaga ega emas.'
    );
  }
  const files = Array.isArray(version.files) ? version.files : [];
  const file = files.find((f) => f.primary) || files[0];
  if (!file || !file.url) throw new Error('Loyiha fayli topilmadi.');
  const dir = targetDir(instanceId, type);
  await fsp.mkdir(dir, { recursive: true });
  const filename = safeName(file.filename || data.slug + '.jar');
  const destination = path.join(dir, filename);
  const result = await download(file.url, destination, (p) => {
    if (data.onProgress) data.onProgress(Object.assign({ filename }, p));
  }, file.size);
  mc.recordContentMeta(instanceId, type, filename, {
    title: data.title || filename,
    icon: data.icon || null,
    projectId: data.projectId || version.project_id || null,
    version: version.version_number,
    filename,
    kind: type,
  });
  if (type === 'datapack') {
    try {
      mc.syncDatapacks(instanceId);
    } catch (_) {
      /* the next launch will retry */
    }
  }
  return {
    filename,
    size: result.size,
    version: version.version_number,
    versionId: version.id,
    type,
    projectId: data.projectId,
    title: data.title || filename,
    icon: data.icon || null,
  };
}

async function featured(input) {
  const data = input || {};
  const type = TYPES[data.type] ? data.type : 'mod';
  return search({
    query: '',
    type,
    loader: data.loader,
    gameVersion: data.gameVersion,
    sort: 'downloads',
    limit: data.limit || 6,
  });
}

module.exports = { search, versions, project, install, featured };
