'use strict';

const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const engine = require('./updater-engine');

let getWindow = () => null;
let initialized = false;
let manualCheck = false;
let timer = null;
let active = null;

let state = {
  status: 'idle',
  version: app.getVersion(),
  available: '',
  progress: 0,
  transferred: 0,
  total: 0,
  mode: '',
  saved: 0,
  mirror: '',
  detail: '',
  error: '',
  checkedAt: 0,
  manual: false,
};

function emit() {
  const win = getWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send('update:event', Object.assign({}, state, { installerPath: undefined }));
  }
}

function set(patch) {
  state = Object.assign({}, state, patch || {});
  console.log('[updater]', state.status, state.available || '', state.detail || '', state.error || '');
  emit();
}

function init(options) {
  const opts = options || {};
  getWindow = typeof opts.getWindow === 'function' ? opts.getWindow : () => null;
  state.version = app.getVersion();

  if (initialized) return;
  initialized = true;

  if (opts.dev || !opts.packaged) {
    set({ status: 'dev' });
    return;
  }

  setTimeout(() => check(false), 5000);
  timer = setInterval(() => check(false), 6 * 60 * 60 * 1000);
  if (timer && typeof timer.unref === 'function') timer.unref();
}

function cacheDir() {
  return path.join(app.getPath('userData'), 'updater');
}

function human(n) {
  return engine.bytesText(n);
}

function progressDetail(p) {
  if (!p) return state.detail;
  if (p.stage === 'mirrors') return 'Tez server tanlanmoqda…';
  if (p.stage === 'differential') return 'Tez yangilanish tayyorlanmoqda…';
  if (p.stage === 'full') return 'To‘liq yangilanish yuklanmoqda…';
  if (p.mode === 'differential' || state.mode === 'differential') {
    const total = Number(p.total) || state.total || 0;
    const saved = Number(p.saved) || state.saved || 0;
    return 'Tez yangilanish · ' + human(total) + ' yuklanadi' + (saved ? ' · ' + human(saved) + ' tejaldi' : '');
  }
  return 'To‘liq yuklanmoqda';
}

function onProgress(p) {
  if (!p) return;
  const patch = {
    status: 'downloading',
    detail: progressDetail(p),
    progress: Math.max(0, Math.min(100, Number(p.percent) || 0)),
    transferred: Number(p.transferred) || 0,
    total: Number(p.total) || 0,
  };
  if (p.mode) patch.mode = p.mode;
  if (p.saved) patch.saved = Number(p.saved) || 0;
  set(patch);
}

async function doCheck() {
  const result = await engine.downloadUpdate({
    currentVersion: app.getVersion(),
    cacheDir: cacheDir(),
    onProgress,
    log: console,
  });

  if (result.current) {
    set({
      status: 'current',
      available: '',
      progress: 0,
      transferred: 0,
      total: 0,
      mode: '',
      saved: 0,
      mirror: '',
      detail: result.meta && result.meta.version
        ? 'Serverdagi versiya: ' + result.meta.version
        : 'Eng so‘nggi versiya',
      error: '',
      manual: manualCheck,
      checkedAt: Date.now(),
    });
    manualCheck = false;
    return;
  }

  set({
    status: 'ready',
    available: result.version,
    progress: 100,
    transferred: result.download || 0,
    total: result.download || 0,
    mode: result.mode || 'full',
    saved: result.saved || 0,
    mirror: result.mirror || '',
    detail: result.mode === 'differential'
      ? 'Tez yangilanish tayyor · ' + human(result.saved || 0) + ' tejaldi'
      : result.cached
        ? 'Yuklangan yangilanish topildi'
        : 'To‘liq yangilanish yuklandi',
    installerPath: result.installerPath,
    error: '',
    manual: manualCheck,
    checkedAt: Date.now(),
  });
  manualCheck = false;
}

function check(isManual) {
  if (!app.isPackaged) {
    set({ status: 'dev' });
    return Promise.resolve(getState());
  }
  if (active) return Promise.resolve(getState());
  manualCheck = !!isManual;
  set({
    status: 'checking',
    available: '',
    progress: 0,
    transferred: 0,
    total: 0,
    mode: '',
    saved: 0,
    mirror: '',
    detail: 'GitHub va tez serverlar tekshirilmoqda…',
    error: '',
    manual: manualCheck,
    checkedAt: Date.now(),
  });
  active = doCheck()
    .catch((e) => {
      set({
        status: 'error',
        error: (e && e.message) || String(e || 'Yangilanish xatosi'),
        detail: 'Qo‘lda yuklash: github.com/' + engine.REPO + '/releases/latest',
        manual: manualCheck,
        checkedAt: Date.now(),
      });
      manualCheck = false;
    })
    .finally(() => {
      active = null;
    });
  return Promise.resolve(getState());
}

async function install() {
  if (state.status !== 'ready' || !state.installerPath) return false;
  const installer = state.installerPath;
  if (!fs.existsSync(installer)) {
    set({ status: 'error', error: 'Yuklangan installer topilmadi', manual: true });
    return false;
  }
  set({ status: 'installing', detail: 'O‘rnatilmoqda…' });
  try {
    const child = spawn(
      installer,
      ['--updated', '/S', '--force-run'],
      { detached: true, stdio: 'ignore', windowsHide: true }
    );
    child.on('error', (e) => {
      set({ status: 'error', error: (e && e.message) || String(e), manual: true });
    });
    child.unref();
    setTimeout(() => app.quit(), 700);
    return true;
  } catch (e) {
    set({ status: 'error', error: (e && e.message) || String(e), manual: true });
    return false;
  }
}

function getState() {
  const copy = Object.assign({}, state);
  delete copy.installerPath;
  return copy;
}

module.exports = {
  init,
  check,
  install,
  getState,
};
