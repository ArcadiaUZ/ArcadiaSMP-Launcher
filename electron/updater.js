'use strict';

const { app } = require('electron');
const { autoUpdater } = require('electron-updater');

let getWindow = () => null;
let initialized = false;
let manualCheck = false;
let timer = null;

let state = {
  status: 'idle',
  version: app.getVersion(),
  available: '',
  progress: 0,
  transferred: 0,
  total: 0,
  error: '',
  checkedAt: 0,
  manual: false,
};

function emit() {
  const win = getWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send('update:event', Object.assign({}, state));
  }
}

function set(patch) {
  state = Object.assign({}, state, patch || {});
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

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;
  autoUpdater.allowPrerelease = false;

  autoUpdater.on('checking-for-update', () => {
    set({ status: 'checking', error: '', manual: manualCheck, checkedAt: Date.now() });
  });

  autoUpdater.on('update-available', (info) => {
    set({
      status: 'downloading',
      available: (info && info.version) || '',
      progress: 0,
      transferred: 0,
      total: 0,
      error: '',
      manual: manualCheck,
      checkedAt: Date.now(),
    });
  });

  autoUpdater.on('update-not-available', () => {
    set({
      status: 'current',
      available: '',
      progress: 0,
      transferred: 0,
      total: 0,
      error: '',
      manual: manualCheck,
      checkedAt: Date.now(),
    });
    manualCheck = false;
  });

  autoUpdater.on('download-progress', (p) => {
    set({
      status: 'downloading',
      progress: Math.max(0, Math.min(100, Number(p && p.percent) || 0)),
      transferred: Number(p && p.transferred) || 0,
      total: Number(p && p.total) || 0,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    set({
      status: 'ready',
      available: (info && info.version) || state.available,
      progress: 100,
      error: '',
      manual: manualCheck,
      checkedAt: Date.now(),
    });
    manualCheck = false;
  });

  autoUpdater.on('error', (err) => {
    set({
      status: 'error',
      error: (err && err.message) || String(err || 'Yangilanish xatosi'),
      manual: manualCheck,
      checkedAt: Date.now(),
    });
    manualCheck = false;
  });

  setTimeout(() => check(false), 5000);
  timer = setInterval(() => check(false), 6 * 60 * 60 * 1000);
  if (timer && typeof timer.unref === 'function') timer.unref();
}

async function check(isManual) {
  if (!app.isPackaged) {
    set({ status: 'dev' });
    return getState();
  }

  manualCheck = !!isManual;
  try {
    set({ status: 'checking', error: '', manual: manualCheck, checkedAt: Date.now() });
    await autoUpdater.checkForUpdates();
  } catch (e) {
    set({
      status: 'error',
      error: (e && e.message) || String(e),
      manual: manualCheck,
      checkedAt: Date.now(),
    });
    manualCheck = false;
  }
  return getState();
}

function install() {
  if (state.status !== 'ready') return false;
  set({ status: 'installing' });
  setTimeout(() => {
    try {
      autoUpdater.quitAndInstall(true, true);
    } catch (e) {
      set({ status: 'error', error: (e && e.message) || String(e) });
    }
  }, 250);
  return true;
}

function getState() {
  return Object.assign({}, state);
}

module.exports = {
  init,
  check,
  install,
  getState,
};
