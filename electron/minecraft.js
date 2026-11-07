'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { MinecraftFolder, Version } = require('@xmcl/core');
const {
  getVersionList,
  installVersion: installVersionFiles,
  installLibraries,
  getLoaderArtifactListFor,
  installFabric,
  getForgeVersionList,
  installForge,
  installNeoForged,
  getQuiltVersionsList,
  installQuiltVersion,
} = require('@xmcl/installer');
const { launch, LaunchPrecheck } = require('@xmcl/core');
const { readConfig, writeConfig } = require('./config');
const arcadia = require('./arcadia');

let versionCache = null;
let versionCacheAt = 0;
let activeInstall = null;
let activeProcess = null;
let activeSession = null;

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function instanceRoot(gameDir) {
  return path.join(gameDir, 'instances');
}

function instancesFile(gameDir) {
  return path.join(gameDir, 'instances.json');
}

function defaultInstance() {
  return {
    id: 'arcadia',
    name: 'ArcadiaSMP',
    version: '26.3',
    versionId: '26.3',
    loader: 'fabric',
    loaderVersion: null,
    icon: false,
    memoryMb: null,
    javaPath: null,
    width: 1280,
    height: 720,
    jvmArgs: '',
    playtimeMs: 0,
    provisioned: false,
    packVersion: null,
    createdAt: Date.now(),
    lastPlayed: 0,
  };
}

function ensureDefaultRecord(list) {
  let item = list.find((i) => i.id === 'arcadia');
  if (item) return item;
  item = defaultInstance();
  const cfg = readConfig();
  const dir = path.join(instanceRoot(cfg.gameDir), item.id);
  for (const sub of ['mods', 'resourcepacks', 'shaderpacks', 'datapacks', 'saves', 'screenshots', 'logs']) {
    ensureDir(path.join(dir, sub));
  }
  try {
    const icon = path.join(__dirname, '..', 'renderer', 'assets', 'img', 'icon.png');
    if (fs.existsSync(icon)) {
      fs.copyFileSync(icon, path.join(dir, 'icon.png'));
      item.icon = true;
    }
  } catch (_) {
    /* icon is optional */
  }
  list.push(item);
  return item;
}

function normalizeInstance(item) {
  const base = defaultInstance();
  const merged = Object.assign(base, item || {});
  if (!merged.versionId) merged.versionId = merged.version;
  merged.playtimeMs = Number(merged.playtimeMs) || 0;
  merged.width = Number(merged.width) || 1280;
  merged.height = Number(merged.height) || 720;
  return merged;
}

function listInstances() {
  const cfg = readConfig();
  const gameDir = cfg.gameDir;
  ensureDir(gameDir);
  let list = [];
  try {
    const parsed = JSON.parse(fs.readFileSync(instancesFile(gameDir), 'utf8'));
    if (Array.isArray(parsed)) list = parsed;
  } catch (_) {
    /* first run */
  }
  if (!list.length) {
    list = [];
    ensureDefaultRecord(list);
    fs.writeFileSync(instancesFile(gameDir), JSON.stringify(list, null, 2), 'utf8');
  }
  return list.map(normalizeInstance);
}

function saveInstances(list) {
  const cfg = readConfig();
  fs.writeFileSync(instancesFile(cfg.gameDir), JSON.stringify(list, null, 2), 'utf8');
  return list;
}

function addPlaytime(instanceId, startedAt) {
  if (!instanceId || !startedAt) return 0;
  const list = listInstances();
  const fresh = list.find((i) => i.id === instanceId);
  if (!fresh) return 0;
  fresh.playtimeMs = (Number(fresh.playtimeMs) || 0) + Math.max(0, Date.now() - startedAt);
  fresh.lastPlayed = startedAt;
  saveInstances(list);
  return fresh.playtimeMs;
}

function createInstance(input) {
  const cfg = readConfig();
  const data = input || {};
  const name = String(data.name || '').trim() || 'Yangi instans';
  const version = String(data.version || '26.3').trim();
  const loader = String(data.loader || 'vanilla').trim();
  const versionId = String(data.versionId || version).trim();
  const list = listInstances();
  const id = 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const item = {
    id,
    name: name.slice(0, 40),
    version,
    versionId,
    loader,
    loaderVersion: data.loaderVersion || null,
    icon: false,
    memoryMb: data.memoryMb ? Math.max(1024, Math.min(16384, Number(data.memoryMb))) : null,
    javaPath: data.javaPath || null,
    width: Number(data.width) || 1280,
    height: Number(data.height) || 720,
    jvmArgs: String(data.jvmArgs || '').slice(0, 1000),
    playtimeMs: 0,
    createdAt: Date.now(),
    lastPlayed: 0,
  };
  const dir = path.join(instanceRoot(cfg.gameDir), id);
  for (const sub of ['mods', 'resourcepacks', 'shaderpacks', 'datapacks', 'saves', 'screenshots', 'logs']) {
    ensureDir(path.join(dir, sub));
  }
  if (data.iconData && /^data:image\/png;base64,/.test(data.iconData)) {
    try {
      fs.writeFileSync(path.join(dir, 'icon.png'), Buffer.from(data.iconData.split(',')[1], 'base64'));
      item.icon = true;
    } catch (_) {
      /* icon is optional */
    }
  }
  list.push(item);
  saveInstances(list);
  return item;
}

function updateInstance(id, patch) {
  const list = listInstances();
  const item = list.find((i) => i.id === id);
  if (!item) throw new Error('Instans topilmadi.');
  const data = patch || {};
  if (typeof data.name === 'string' && data.name.trim()) item.name = data.name.trim().slice(0, 40);
  if (data.memoryMb !== undefined) {
    const mem = Number(data.memoryMb);
    item.memoryMb = mem ? Math.max(1024, Math.min(16384, Math.round(mem))) : null;
  }
  if (data.javaPath !== undefined) item.javaPath = data.javaPath || null;
  if (data.width !== undefined) item.width = Math.max(640, Math.min(3840, Number(data.width) || 1280));
  if (data.height !== undefined) item.height = Math.max(360, Math.min(2160, Number(data.height) || 720));
  if (data.jvmArgs !== undefined) item.jvmArgs = String(data.jvmArgs || '').slice(0, 1000);
  if (data.version !== undefined && data.version) item.version = String(data.version);
  if (data.versionId !== undefined && data.versionId) item.versionId = String(data.versionId);
  if (data.loader !== undefined && data.loader) item.loader = String(data.loader);
  if (data.loaderVersion !== undefined) item.loaderVersion = data.loaderVersion || null;
  if (data.provisioned !== undefined) item.provisioned = !!data.provisioned;
  if (data.packVersion !== undefined) item.packVersion = data.packVersion || null;
  saveInstances(list);
  return item;
}

function instanceIcon(instanceId) {
  const cfg = readConfig();
  const file = path.join(instanceRoot(cfg.gameDir), instanceId, 'icon.png');
  try {
    const buf = fs.readFileSync(file);
    return 'data:image/png;base64,' + buf.toString('base64');
  } catch (_) {
    return null;
  }
}

function setInstanceIcon(instanceId, dataUrl) {
  if (!/^data:image\/png;base64,/.test(String(dataUrl || ''))) {
    throw new Error('Faqat PNG rasm qabul qilinadi.');
  }
  const cfg = readConfig();
  const dir = path.join(instanceRoot(cfg.gameDir), instanceId);
  ensureDir(dir);
  const raw = Buffer.from(dataUrl.split(',')[1], 'base64');
  if (raw.length > 4 * 1024 * 1024) throw new Error('Rasm juda katta (maks. 4 MB).');
  fs.writeFileSync(path.join(dir, 'icon.png'), raw);
  const list = listInstances();
  const item = list.find((i) => i.id === instanceId);
  if (item) {
    item.icon = true;
    saveInstances(list);
  }
  return true;
}

function deleteInstance(id) {
  const cfg = readConfig();
  let list = listInstances();
  if (list.length <= 1) throw new Error('Kamida bitta instance qolishi kerak.');
  const target = list.find((i) => i.id === id);
  if (!target) throw new Error('Instance topilmadi.');
  list = list.filter((i) => i.id !== id);
  saveInstances(list);
  if (cfg.lastInstance === id) writeConfig({ lastInstance: (list[0] && list[0].id) || 'arcadia' });
  try {
    fs.rmSync(path.join(instanceRoot(cfg.gameDir), id), { recursive: true, force: true });
  } catch (_) {
    /* files may be locked by a running game */
  }
  return list;
}

async function versions(force) {
  if (!force && versionCache && Date.now() - versionCacheAt < 10 * 60 * 1000) return versionCache;
  const list = await getVersionList();
  versionCache = list;
  versionCacheAt = Date.now();
  return list;
}

function installedVersions() {
  const cfg = readConfig();
  const dir = path.join(cfg.gameDir, 'versions');
  const out = [];
  let names = [];
  try {
    names = fs.readdirSync(dir);
  } catch (_) {
    return out;
  }
  for (const name of names) {
    const jsonPath = path.join(dir, name, name + '.json');
    const jarPath = path.join(dir, name, name + '.jar');
    try {
      const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      out.push({
        id: json.id || name,
        type: json.type || 'release',
        inheritsFrom: json.inheritsFrom || null,
        hasJar: fs.existsSync(jarPath),
      });
    } catch (_) {
      /* incomplete or non-standard version folder */
    }
  }
  out.sort((a, b) => String(b.id).localeCompare(String(a.id), undefined, { numeric: true }));
  return out;
}

function isInstalled(version, depth) {
  if (!version) return false;
  const found = installedVersions().find((v) => v.id === version);
  if (!found) return false;
  if (found.hasJar) return true;
  /* Modded profiles inherit the client jar from their base version. */
  if (found.inheritsFrom && (depth || 0) < 4) return isInstalled(found.inheritsFrom, (depth || 0) + 1);
  return false;
}

function findRemote(list, id) {
  return (list.versions || []).find((v) => v.id === id);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sha1(buf) {
  return crypto.createHash('sha1').update(buf).digest('hex');
}

async function sha1File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha1');
    const stream = fs.createReadStream(file);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function fetchBuffer(url, timeoutMs) {
  const res = await fetch(url, {
    cache: 'no-store',
    redirect: 'follow',
    headers: { 'User-Agent': 'ArcadiaSMP-Launcher/0.1' },
    signal: AbortSignal.timeout(timeoutMs || 45000),
  });
  if (!res.ok) {
    const err = new Error('HTTP ' + res.status);
    err.status = res.status;
    throw err;
  }
  return Buffer.from(await res.arrayBuffer());
}

async function ensureFile(url, destination, hash, size, retries) {
  const attempts = retries || 4;
  let lastError = null;
  try {
    const st = await fsp.stat(destination);
    if ((!size || st.size === size) && hash && (await sha1File(destination)) === hash) {
      return { skipped: true, path: destination };
    }
    await fsp.unlink(destination).catch(() => {});
  } catch (_) {
    /* file does not exist */
  }
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const buf = await fetchBuffer(url, 60000);
      if (size && buf.length !== size) throw new Error('size ' + buf.length + ' != ' + size);
      if (hash && sha1(buf) !== hash) throw new Error('sha1 mismatch');
      await fsp.mkdir(path.dirname(destination), { recursive: true });
      const tmp = destination + '.part';
      await fsp.writeFile(tmp, buf);
      await fsp.rename(tmp, destination).catch(async () => {
        await fsp.copyFile(tmp, destination);
        await fsp.unlink(tmp).catch(() => {});
      });
      return { skipped: false, path: destination };
    } catch (e) {
      lastError = e;
      await sleep(350 * Math.pow(2, attempt));
    }
  }
  throw new Error((url || destination) + ': ' + (lastError ? lastError.message : 'yuklanmadi'));
}

async function ensureIndex(gameDir, versionJson, onProgress) {
  const idx = versionJson.assetIndex;
  if (!idx || !idx.id) throw new Error('Versiyada asset index topilmadi.');
  const dest = path.join(gameDir, 'assets', 'indexes', idx.id + '.json');
  try {
    const raw = await fsp.readFile(dest, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed.objects) return parsed;
  } catch (_) {
    /* download below */
  }
  if (!idx.url) throw new Error('Asset index URL topilmadi.');
  const buf = await fetchBuffer(idx.url, 60000);
  if (idx.sha1 && sha1(buf) !== idx.sha1) throw new Error('Asset index sha1 mos emas.');
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  await fsp.writeFile(dest, buf);
  return JSON.parse(buf.toString('utf8'));
}

async function downloadAssets(gameDir, versionJson, onProgress, state) {
  const index = await ensureIndex(gameDir, versionJson, onProgress);
  const objects = Object.entries(index.objects || {});
  const total = objects.length;
  let done = 0;
  const failures = [];
  const queue = objects.slice();
  const workers = Math.max(4, Math.min(12, Number(process.env.ARCADIA_ASSET_WORKERS) || 10));

  async function worker() {
    while (queue.length) {
      if (state && state.cancelled) throw new Error('O\u2018rnatish bekor qilindi.');
      const [name, obj] = queue.shift();
      const dest = path.join(gameDir, 'assets', 'objects', obj.hash.slice(0, 2), obj.hash);
      const url = 'https://resources.download.minecraft.net/' + obj.hash.slice(0, 2) + '/' + obj.hash;
      try {
        await ensureFile(url, dest, obj.hash, obj.size);
      } catch (e) {
        failures.push({ name, hash: obj.hash, size: obj.size, error: e.message });
      }
      done++;
      if (onProgress) {
        onProgress({
          stage: 'assets',
          progress: done,
          total,
          percent: 15 + Math.round((done / Math.max(1, total)) * 85),
          path: name,
        });
      }
    }
  }

  await Promise.all(Array.from({ length: workers }, worker));

  /* Second pass: the CDN occasionally resets connections. */
  if (failures.length) {
    const retry = failures.splice(0, failures.length);
    const retryQueue = retry.slice();
    async function retryWorker() {
      while (retryQueue.length) {
        if (state && state.cancelled) throw new Error('O\u2018rnatish bekor qilindi.');
        const f = retryQueue.shift();
        const dest = path.join(gameDir, 'assets', 'objects', f.hash.slice(0, 2), f.hash);
        const url = 'https://resources.download.minecraft.net/' + f.hash.slice(0, 2) + '/' + f.hash;
        try {
          await ensureFile(url, dest, f.hash, f.size, 6);
        } catch (e) {
          failures.push(Object.assign({}, f, { error: e.message }));
        }
      }
    }
    await Promise.all([retryWorker(), retryWorker()]);
  }

  /* log4j config is optional but cheap to keep. */
  const logFile = versionJson.logging && versionJson.logging.client && versionJson.logging.client.file;
  if (logFile && logFile.url) {
    try {
      await ensureFile(
        logFile.url,
        path.join(gameDir, 'assets', 'log_configs', logFile.id),
        logFile.sha1,
        logFile.size,
        3
      );
    } catch (_) {
      /* the game can start without a dedicated log config */
    }
  }

  if (failures.length) {
    throw new Error(failures.length + ' ta asset yuklanmadi. Internetni tekshirib, qayta urinib ko\u2018ring.');
  }
  return total;
}

async function installVersion(versionId, onProgress) {
  if (activeInstall) throw new Error('Boshqa o\u2018rnatish davom etmoqda.');
  const cfg = readConfig();
  const folder = MinecraftFolder.from(cfg.gameDir);
  ensureDir(cfg.gameDir);
  let list;
  try {
    list = await versions(true);
  } catch (e) {
    throw new Error('Mojang versiya ro\u2018yxatiga ulanib bo\u2018lmadi. Internetni tekshiring.');
  }
  const meta = findRemote(list, versionId);
  if (!meta) throw new Error(versionId + ' versiyasi Mojang ro\u2018yxatida topilmadi.');

  const state = { cancelled: false };
  activeInstall = state;
  const report = (p) => {
    if (onProgress) onProgress(p);
  };
  try {
    report({ stage: 'version', percent: 2, progress: 0, total: 0 });
    const resolved = await installVersionFiles(meta, folder);
    ensureDir(path.join(cfg.gameDir, 'assets'));

    report({ stage: 'libraries', percent: 8, progress: 0, total: 0 });
    let lastLibError = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      if (state.cancelled) throw new Error('O\u2018rnatish bekor qilindi.');
      try {
        await installLibraries(resolved, { maxConcurrency: 8 });
        lastLibError = null;
        break;
      } catch (e) {
        lastLibError = e;
        await sleep(700 * (attempt + 1));
      }
    }
    if (lastLibError) throw new Error('Kutubxonalar yuklanmadi: ' + (lastLibError.message || lastLibError));

    const versionJson = JSON.parse(
      await fsp.readFile(path.join(cfg.gameDir, 'versions', versionId, versionId + '.json'), 'utf8')
    );
    await downloadAssets(cfg.gameDir, versionJson, (p) => report(p), state);
    report({ stage: 'done', percent: 100, progress: 1, total: 1 });
  } finally {
    activeInstall = null;
  }
  if (!isInstalled(versionId)) {
    throw new Error('O\u2018rnatish tugadi, lekin versiya fayllari topilmadi.');
  }
  return versionId;
}
function cancelInstall() {
  if (activeInstall) {
    activeInstall.cancelled = true;
    return true;
  }
  return false;
}

/**
 * Install a mod loader on top of an already installed vanilla version.
 * Fabric is fully supported (Modrinth target). Forge/NeoForge/Quilt stay
 * visible in the UI but fail with a human message until their installers are
 * verified for 26.3.
 */
async function installLoader(loader, minecraftVersion, onProgress) {
  const kind = String(loader || 'vanilla').toLowerCase();
  const mc = String(minecraftVersion || '26.3');
  const report = (p) => {
    if (onProgress) onProgress(p);
  };
  if (kind === 'vanilla') {
    return { loader: 'vanilla', loaderVersion: null, versionId: mc };
  }
  if (!['fabric', 'forge', 'neoforge', 'quilt'].includes(kind)) {
    throw new Error('Noma\u2019lum mod loader: ' + kind);
  }
  if (!isInstalled(mc)) {
    throw new Error(mc + ' avval o\u2018rnatilishi kerak.');
  }
  if (kind === 'neoforge') {
    report({ stage: 'loader', percent: 25, progress: 0, total: 0 });
    let versions = [];
    try {
      const response = await fetch(
        'https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml',
        { headers: { 'User-Agent': 'ArcadiaSMP-Launcher/0.2.0' }, signal: AbortSignal.timeout(20000) }
      );
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const xml = await response.text();
      versions = Array.from(xml.matchAll(/<version>(26\.3\.[^<]+)<\/version>/g), (m) => m[1]);
      versions.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    } catch (_) {
      throw new Error('NeoForge ro\u2018yxatiga ulanib bo\u2018lmadi. Internetni tekshiring.');
    }
    const version = versions[versions.length - 1];
    if (!version) throw new Error('NeoForge 26.3 uchun mos versiya topilmadi.');
    report({ stage: 'loader', percent: 45, progress: 0, total: 0 });
    const folder = MinecraftFolder.from(readConfig().gameDir);
    const versionId = await installNeoForged('neoforge', version, folder, {
      java: readConfig().javaPath,
    });
    report({ stage: 'done', percent: 100, progress: 1, total: 1 });
    if (!isInstalled(versionId)) throw new Error('NeoForge o\u2018rnatildi, lekin versiya fayli topilmadi.');
    return { loader: 'neoforge', loaderVersion: version, versionId };
  }
  if (kind === 'quilt') {
    report({ stage: 'loader', percent: 25, progress: 0, total: 0 });
    let list;
    try {
      list = await getQuiltVersionsList();
    } catch (_) {
      throw new Error('Quilt ro\u2018yxatiga ulanib bo\u2018lmadi. Internetni tekshiring.');
    }
    const quilt = (list || []).find((v) => !String(v.version).includes('beta')) || (list || [])[0];
    if (!quilt) throw new Error('Quilt 26.3 uchun mos loader topilmadi.');
    report({ stage: 'loader', percent: 55, progress: 0, total: 0 });
    const folder = MinecraftFolder.from(readConfig().gameDir);
    const versionId = await installQuiltVersion({
      minecraftVersion: mc,
      version: quilt.version,
      minecraft: folder,
    });
    report({ stage: 'loader', percent: 75, progress: 0, total: 0 });
    const resolved = await Version.parse(folder, versionId);
    await installLibraries(resolved, { maxConcurrency: 6 });
    report({ stage: 'done', percent: 100, progress: 1, total: 1 });
    if (!isInstalled(versionId)) throw new Error('Quilt o\u2018rnatildi, lekin versiya fayli topilmadi.');
    return { loader: 'quilt', loaderVersion: quilt.version, versionId };
  }
  if (kind === 'forge') {
    report({ stage: 'loader', percent: 25, progress: 0, total: 0 });
    let list;
    try {
      list = await getForgeVersionList({ minecraft: mc });
    } catch (_) {
      throw new Error('Forge ro\u2018yxatiga ulanib bo\u2018lmadi. Internetni tekshiring.');
    }
    const forge = (list.versions || []).find((v) => v.type === 'recommended') || (list.versions || [])[0];
    if (!forge) throw new Error('Forge 26.3 uchun mos versiya topilmadi.');
    report({ stage: 'loader', percent: 45, progress: 0, total: 0 });
    const folder = MinecraftFolder.from(readConfig().gameDir);
    const versionId = await installForge(
      { mcversion: mc, version: forge.version, installer: forge.installer },
      folder,
      { java: readConfig().javaPath }
    );
    report({ stage: 'done', percent: 100, progress: 1, total: 1 });
    if (!isInstalled(versionId)) throw new Error('Forge o\u2018rnatildi, lekin versiya fayli topilmadi.');
    return { loader: 'forge', loaderVersion: forge.version, versionId };
  }
  report({ stage: 'loader', percent: 30, progress: 0, total: 0 });
  let artifacts;
  try {
    artifacts = await getLoaderArtifactListFor(mc);
  } catch (e) {
    throw new Error('Fabric ro\u2018yxatiga ulanib bo\u2018lmadi. Internetni tekshiring.');
  }
  if (!artifacts || !artifacts.length) {
    throw new Error('Fabric 26.3 uchun mos loader topilmadi.');
  }
  const selected = artifacts.find((a) => a.loader && a.loader.stable) || artifacts[0];
  /* Fabric meta returns intermediary 0.0.0 for versions it does not know yet.
     Our 26.3 game version has intermediary artifacts, so point the loader at
     the real game version and a stable version id instead of 0.0.0. */
  const artifact = {
    loader: selected.loader,
    launcherMeta: selected.launcherMeta,
    intermediary: Object.assign({}, selected.intermediary, {
      version: mc,
      maven: 'net.fabricmc:intermediary:' + mc,
    }),
  };
  report({ stage: 'loader', percent: 45, progress: 0, total: 0 });
  const folder = MinecraftFolder.from(readConfig().gameDir);
  const versionId = 'fabric-loader-' + artifact.loader.version + '-' + mc;
  await installFabric(artifact, folder, { inheritsFrom: mc, versionId });
  report({ stage: 'loader', percent: 70, progress: 0, total: 0 });
  const resolved = await Version.parse(folder, versionId);
  await installLibraries(resolved, { maxConcurrency: 6 });
  report({ stage: 'done', percent: 100, progress: 1, total: 1 });
  if (!isInstalled(versionId)) throw new Error('Fabric o\u2018rnatildi, lekin versiya fayli topilmadi.');
  return { loader: 'fabric', loaderVersion: artifact.loader.version, versionId };
}

function walkFiles(dir, out) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, out);
    else out.push(full);
  }
  return out;
}

/**
 * 26.3 natives are extracted under windows/x64/org/lwjgl/... while the JVM
 * java.library.path points at the natives root. Flatten x64 DLLs so LWJGL,
 * SDL, OpenAL and JNA can find them by name.
 */
function flattenNatives(gameDir, version) {
  const root = path.join(gameDir, 'versions', version, version + '-natives');
  const flat = path.join(gameDir, 'versions', version, version + '-natives-flat');
  try {
    fs.rmSync(flat, { recursive: true, force: true });
  } catch (_) {
    /* ignore */
  }
  ensureDir(flat);
  const files = [];
  try {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (entry.isFile()) files.push(path.join(root, entry.name));
    }
  } catch (_) {
    /* no natives */
  }
  const nativeArch = process.arch === 'arm64' ? 'arm64' : 'x64';
  files.push(...walkFiles(path.join(root, 'windows', nativeArch), []));
  files.push(...walkFiles(path.join(root, 'jna'), []));
  const seen = new Set();
  for (const file of files) {
    if (!/\.(dll|so|dylib)$/i.test(file)) continue;
    const base = path.basename(file);
    if (seen.has(base.toLowerCase())) continue;
    seen.add(base.toLowerCase());
    const dest = path.join(flat, base);
    try {
      fs.copyFileSync(file, dest);
    } catch (_) {
      /* a locked DLL from a previous run can be ignored */
    }
  }
  return flat;
}

function javaInfo(javaPath) {
  const bin = javaPath || readConfig().javaPath;
  const res = spawnSync(bin, ['-version'], { encoding: 'utf8', windowsHide: true, timeout: 8000 });
  const text = String(res.stderr || res.stdout || '').trim();
  if (res.error) return { ok: false, path: bin, error: res.error.message, version: '' };
  return { ok: res.status === 0, path: bin, version: text.split(/\r?\n/)[0] || '', error: '' };
}

function readLogTail(gameDir, instanceId) {
  try {
    const file = path.join(instanceRoot(gameDir), instanceId, 'logs', 'latest.log');
    const text = fs.readFileSync(file, 'utf8');
    return text.split(/\r?\n/).slice(-120).join('\n');
  } catch (_) {
    return '';
  }
}

async function launchInstance(instanceId, onEvent) {
  if (activeProcess) throw new Error('O\u2018yin allaqachon ishga tushgan.');
  const cfg = readConfig();
  const list = listInstances();
  const instance = list.find((i) => i.id === (instanceId || cfg.lastInstance)) || list[0];
  if (!instance) throw new Error('Instance topilmadi.');
  if (!cfg.account || !cfg.account.username || !cfg.account.uuid) {
    throw new Error('Avval ArcadiaSMP hisobingizga kiring.');
  }
  const launchVersion = instance.versionId || instance.version;
  if (!isInstalled(launchVersion)) {
    throw new Error(launchVersion + ' hali o\u2018rnatilmagan. Avval "O\u2018rnatish" tugmasini bosing.');
  }
  const javaPath = instance.javaPath || cfg.javaPath;
  const java = javaInfo(javaPath);
  if (!java.ok) {
    throw new Error('Java topilmadi yoki ishga tushmadi: ' + (java.error || javaPath));
  }

  const instanceDir = path.join(instanceRoot(cfg.gameDir), instance.id);
  ensureDir(instanceDir);
  ensureDir(path.join(instanceDir, 'mods'));
  try {
    syncDatapacks(instance.id);
  } catch (_) {
    /* data packs are optional; never block the game launch */
  }

  /* Natives are extracted for the *launch version* (the Fabric loader id),
     not for the base game version. Using instance.version here points at an
     empty/nonexistent 26.3-natives folder and leaves LWJGL without lwjgl.dll. */
  const nativesFlat = flattenNatives(cfg.gameDir, launchVersion);

  const server = await arcadia.status();
  const autoJoin = cfg.autoJoin && server.ok;
  const host = String(cfg.serverHost || '127.0.0.1').trim();
  const port = Number(cfg.serverPort) || 25565;
  const customJvm = String(instance.jvmArgs || '')
    .match(/(?:[^\s"]+|"[^"]*")+/g)
    ?.map((s) => s.replace(/^"|"$/g, '')) || [];
  const winWidth = Math.max(640, Number(instance.width) || 1280);
  const winHeight = Math.max(360, Number(instance.height) || 720);
  const mcArgs = ['--width', String(winWidth), '--height', String(winHeight)];
  if (autoJoin) mcArgs.unshift('--quickPlayMultiplayer', port === 25565 ? host : host + ':' + port);
  const options = {
    gamePath: instanceDir,
    resourcePath: cfg.gameDir,
    version: launchVersion,
    versionType: 'ArcadiaSMP',
    gameProfile: { name: cfg.account.username, id: cfg.account.uuid },
    accessToken: '0',
    userType: 'legacy',
    launcherName: 'ArcadiaSMP Launcher',
    launcherBrand: '0.2.2',
    javaPath: javaPath,
    minMemory: 1024,
    maxMemory: Number(instance.memoryMb || cfg.memoryMb) || 4096,
    extraJVMArgs: [
      '-Dfile.encoding=UTF-8',
      '-Djava.net.preferIPv4Stack=true',
      '-Djava.library.path=' + nativesFlat,
      '-Dorg.lwjgl.librarypath=' + nativesFlat,
      /* Offline privacy: point the authlib service discovery at a dead local
         endpoint. Minecraft never contacts Mojang/Microsoft for auth or skins;
         the server already supplies the offline profile and texture URL. */
      '-Dminecraft.api.discovery.host=http://127.0.0.1:1',
      ...customJvm,
    ],
    extraExecOption: { windowsHide: false },
    /* 26.3 uses quick-play instead of the removed --server argument. */
    extraMCArgs: mcArgs,
    /* Default prechecks extract natives; then flatten x64 DLLs for LWJGL 3.4.
       They must run sequentially: native extraction and flattening race otherwise. */
    prechecks: [
      async (folder, version, option) => {
        await Promise.all(LaunchPrecheck.DEFAULT_PRECHECKS.map((fn) => fn(folder, version, option)));
        flattenNatives(cfg.gameDir, launchVersion);
      },
    ],
  };

  const child = await launch(options);
  activeProcess = child;
  const started = Date.now();
  activeSession = { instanceId: instance.id, started };

  instance.lastPlayed = started;
  saveInstances(list.map((i) => (i.id === instance.id ? instance : i)));
  writeConfig({ lastInstance: instance.id });

  const emit = (type, payload) => {
    if (onEvent) onEvent(Object.assign({ type, at: Date.now() }, payload || {}));
  };
  emit('started', {
    pid: child.pid,
    instance: instance.name,
    version: instance.version,
    versionId: launchVersion,
    java: javaPath,
    autoJoin,
  });

  const onData = (buf) => {
    const text = String(buf);
    for (const line of text.split(/\r?\n/)) {
      if (line.trim()) emit('log', { line: line.slice(0, 1200) });
    }
  };
  if (child.stdout) child.stdout.on('data', onData);
  if (child.stderr) child.stderr.on('data', onData);
  child.on('error', (e) => {
    activeProcess = null;
    emit('error', { error: e.message || String(e) });
  });
  child.on('exit', (code, signal) => {
    activeProcess = null;
    const durationMs = Date.now() - started;
    let playtimeMs = 0;
    const session = activeSession;
    activeSession = null;
    if (session && session.instanceId === instance.id) {
      playtimeMs = addPlaytime(instance.id, session.started);
    } else {
      const fresh = listInstances().find((i) => i.id === instance.id);
      playtimeMs = fresh ? Number(fresh.playtimeMs) || 0 : 0;
    }
    const crash = readLogTail(cfg.gameDir, instance.id);
    emit('exited', { code, signal, crash, durationMs, playtimeMs });
  });

  return { pid: child.pid, instance, autoJoin, server: server.ok ? server.status : null };
}

function stopGame() {
  if (!activeProcess) return false;
  if (activeSession) {
    addPlaytime(activeSession.instanceId, activeSession.started);
    activeSession = null;
  }
  try {
    activeProcess.kill();
  } catch (_) {
    /* ignore */
  }
  return true;
}

function isRunning() {
  return !!activeProcess;
}

function contentDir(instanceId, kind) {
  const cfg = readConfig();
  const map = {
    mods: 'mods',
    resourcepacks: 'resourcepacks',
    shaderpacks: 'shaderpacks',
    datapacks: 'datapacks',
    saves: 'saves',
    screenshots: 'screenshots',
  };
  return path.join(instanceRoot(cfg.gameDir), instanceId || cfg.lastInstance, map[kind] || kind);
}

function contentMetaPath(instanceId) {
  return path.join(
    instanceRoot(readConfig().gameDir),
    instanceId || readConfig().lastInstance,
    '.arcadia-content.json'
  );
}

function readContentMeta(instanceId) {
  try {
    const parsed = JSON.parse(fs.readFileSync(contentMetaPath(instanceId), 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function contentMetaKey(kind, filename) {
  const singular = {
    mods: 'mod',
    resourcepacks: 'resourcepack',
    shaderpacks: 'shader',
    datapacks: 'datapack',
  }[kind] || kind;
  return singular + '/' + String(filename || '').replace(/\.disabled$/i, '');
}

function recordContentMeta(instanceId, kind, filename, meta) {
  const data = readContentMeta(instanceId);
  const key = contentMetaKey(kind, filename);
  data[key] = Object.assign({}, data[key] || {}, meta || {}, { updatedAt: Date.now() });
  try {
    fs.mkdirSync(path.dirname(contentMetaPath(instanceId)), { recursive: true });
    fs.writeFileSync(contentMetaPath(instanceId), JSON.stringify(data, null, 2), 'utf8');
  } catch (_) {
    /* metadata is a nice-to-have; the downloaded file still works */
  }
  return data[key];
}

function listContent(instanceId, kind) {
  const dir = contentDir(instanceId, kind);
  if (kind === 'saves') {
    try {
      return fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && fs.existsSync(path.join(dir, e.name, 'level.dat')))
        .map((e) => {
          const st = fs.statSync(path.join(dir, e.name, 'level.dat'));
          const icon = path.join(dir, e.name, 'icon.png');
          return {
            name: e.name,
            size: st.size,
            modified: st.mtimeMs,
            icon: fs.existsSync(icon),
          };
        })
        .sort((a, b) => b.modified - a.modified);
    } catch (_) {
      return [];
    }
  }
  const meta = readContentMeta(instanceId);
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile())
      .filter((e) => {
        const low = e.name.toLowerCase();
        if (kind === 'screenshots') return /\.(png|jpe?g)$/.test(low);
        if (kind === 'mods') return low.endsWith('.jar') || low.endsWith('.jar.disabled');
        if (kind === 'resourcepacks' || kind === 'shaderpacks' || kind === 'datapacks') {
          return low.endsWith('.zip');
        }
        return true;
      })
      .map((e) => {
        const st = fs.statSync(path.join(dir, e.name));
        const info = meta[contentMetaKey(kind, e.name)] || null;
        return {
          name: e.name,
          size: st.size,
          modified: st.mtimeMs,
          enabled: kind !== 'mods' || !e.name.toLowerCase().endsWith('.disabled'),
          meta: info,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (_) {
    return [];
  }
}

/**
 * Data packs are world-scoped in Minecraft. The launcher keeps one copy in
 * instances/<id>/datapacks and mirrors it into every existing world before the
 * game starts, so a new world also receives the packs after its first launch.
 */
function syncDatapacks(instanceId) {
  const dir = contentDir(instanceId, 'datapacks');
  let packs = [];
  try {
    packs = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.zip'));
  } catch (_) {
    return 0;
  }
  if (!packs.length) return 0;
  const saves = contentDir(instanceId, 'saves');
  let worlds = [];
  try {
    worlds = fs
      .readdirSync(saves, { withFileTypes: true })
      .filter((e) => e.isDirectory() && fs.existsSync(path.join(saves, e.name, 'level.dat')))
      .map((e) => e.name);
  } catch (_) {
    return 0;
  }
  let copied = 0;
  for (const world of worlds) {
    const target = path.join(saves, world, 'datapacks');
    ensureDir(target);
    for (const pack of packs) {
      const src = path.join(dir, pack);
      const dst = path.join(target, pack);
      try {
        const a = fs.statSync(src);
        let same = false;
        try {
          const b = fs.statSync(dst);
          same = b.size === a.size && b.mtimeMs >= a.mtimeMs;
        } catch (_) {
          /* missing */
        }
        if (!same) {
          fs.copyFileSync(src, dst);
          copied++;
        }
      } catch (_) {
        /* a single locked pack must not block the launch */
      }
    }
  }
  return copied;
}

function toggleMod(instanceId, name) {
  const dir = contentDir(instanceId, 'mods');
  const safe = path.basename(String(name || ''));
  const full = path.join(dir, safe);
  if (!fs.existsSync(full)) throw new Error('Mod topilmadi.');
  const low = safe.toLowerCase();
  let next;
  if (low.endsWith('.jar.disabled')) next = safe.slice(0, -'.disabled'.length);
  else if (low.endsWith('.jar')) next = safe + '.disabled';
  else throw new Error('Faqat .jar modlarni yoqish/o\u2018chirish mumkin.');
  fs.renameSync(full, path.join(dir, next));
  return listContent(instanceId, 'mods');
}

function readInstanceImage(instanceId, relPath) {
  const cfg = readConfig();
  const root = path.resolve(instanceRoot(cfg.gameDir), instanceId);
  const full = path.resolve(root, String(relPath || ''));
  if (!full.startsWith(root + path.sep)) throw new Error('Ruxsatsiz yo\u2018l.');
  if (!/\.(png|jpe?g|webp)$/i.test(full)) throw new Error('Rasm formati qo\u2018llab-quvvatlanmaydi.');
  const st = fs.statSync(full);
  if (st.size > 12 * 1024 * 1024) throw new Error('Rasm juda katta.');
  const ext = path.extname(full).slice(1).toLowerCase();
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png';
  return 'data:' + mime + ';base64,' + fs.readFileSync(full).toString('base64');
}

function listFiles(instanceId) {
  const cfg = readConfig();
  const root = path.join(instanceRoot(cfg.gameDir), instanceId || cfg.lastInstance);
  try {
    return fs
      .readdirSync(root, { withFileTypes: true })
      .map((e) => {
        let size = 0;
        try {
          if (e.isFile()) size = fs.statSync(path.join(root, e.name)).size;
        } catch (_) {
          /* ignore */
        }
        return { name: e.name, dir: e.isDirectory(), size };
      })
      .sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1));
  } catch (_) {
    return [];
  }
}

module.exports = {
  listInstances,
  createInstance,
  updateInstance,
  instanceIcon,
  setInstanceIcon,
  installLoader,
  listContent,
  toggleMod,
  readContentMeta,
  recordContentMeta,
  syncDatapacks,
  readInstanceImage,
  listFiles,
  instanceDir(instanceId) {
    const cfg = readConfig();
    return path.join(instanceRoot(cfg.gameDir), instanceId || cfg.lastInstance);
  },
  deleteInstance,
  versions,
  installedVersions,
  isInstalled,
  installVersion,
  cancelInstall,
  javaInfo,
  launchInstance,
  stopGame,
  isRunning,
  instanceRoot,
  listMods(instanceId) {
    const cfg = readConfig();
    const dir = path.join(instanceRoot(cfg.gameDir), instanceId || cfg.lastInstance, 'mods');
    try {
      return fs
        .readdirSync(dir)
        .filter((f) => f.toLowerCase().endsWith('.jar'))
        .map((f) => {
          const st = fs.statSync(path.join(dir, f));
          return { name: f, size: st.size, modified: st.mtimeMs };
        });
    } catch (_) {
      return [];
    }
  },
  modsDir(instanceId) {
    const cfg = readConfig();
    return path.join(instanceRoot(cfg.gameDir), instanceId || cfg.lastInstance, 'mods');
  },
  instanceDir(instanceId) {
    const cfg = readConfig();
    return path.join(instanceRoot(cfg.gameDir), instanceId || cfg.lastInstance);
  },
};
