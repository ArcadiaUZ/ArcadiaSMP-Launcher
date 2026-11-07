'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell, session, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

const cfgmod = require('./config');
const arcadia = require('./arcadia');
const mc = require('./minecraft');
const modrinth = require('./modrinth');
const defaultPack = require('./default-pack');
const updater = require('./updater');

const PROTOCOL = 'arcadia';
const DEV = process.argv.includes('--dev');
const SHOT = process.env.ARCADIA_SHOT || '';

let win = null;
let pendingDeepLink = '';

if (!SHOT) {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
  } else {
    app.on('second-instance', (_event, argv) => {
      const link = (argv || []).find((a) => String(a).startsWith(PROTOCOL + '://'));
      if (link) handleDeepLink(link);
      if (win) {
        if (win.isMinimized()) win.restore();
        win.show();
        win.focus();
      }
    });
  }
}

function appRoot() {
  return path.join(__dirname, '..');
}

function handleDeepLink(link) {
  if (!win) {
    pendingDeepLink = link;
    return;
  }
  win.webContents.send('app:deeplink', link);
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createWindow() {
  win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1080,
    minHeight: 700,
    show: false,
    frame: false,
    backgroundColor: '#070b0a',
    title: 'ArcadiaSMP Launcher',
    icon: path.join(appRoot(), 'renderer', 'assets', 'img', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      devTools: DEV || !!SHOT,
    },
  });

  win.loadFile(path.join(appRoot(), 'renderer', 'index.html'));

  win.once('ready-to-show', () => {
    win.show();
    if (DEV) win.webContents.openDevTools({ mode: 'detach' });
  });

  if (DEV || SHOT) {
    win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      console.log('RENDERER', level, message, line, sourceId);
    });
    win.webContents.on('render-process-gone', (_event, details) => {
      console.error('RENDER_GONE', details);
    });
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    }
  });

  win.webContents.on('did-finish-load', () => {
    if (pendingDeepLink) {
      win.webContents.send('app:deeplink', pendingDeepLink);
      pendingDeepLink = '';
    }
    if (SHOT && process.env.ARCADIA_SHOT_PAGE) {
      const page = String(process.env.ARCADIA_SHOT_PAGE);
      if (/^(home|instances|content|skins|servers|settings|detail)$/.test(page)) {
        setTimeout(() => {
          win.webContents
            .executeJavaScript(`document.querySelector('[data-page="${page}"]')?.click()`)
            .catch(() => {});
        }, 1400);
      }
    }
    if (SHOT && process.env.ARCADIA_SHOT_JS) {
      setTimeout(() => {
        win.webContents.executeJavaScript(String(process.env.ARCADIA_SHOT_JS)).catch(() => {});
      }, 1600);
    }
    if (SHOT) {
      setTimeout(async () => {
        try {
          const img = await win.webContents.capturePage();
          fs.writeFileSync(SHOT, img.toPNG());
          console.log('SHOT_WRITTEN', SHOT);
        } catch (e) {
          console.error('SHOT_FAILED', e);
        }
        app.quit();
      }, Number(process.env.ARCADIA_SHOT_DELAY || 2600));
    }
  });

  win.on('closed', () => {
    win = null;
  });
}

function send(channel, data) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, data);
}

function allowExternal(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

function pickSkinFile() {
  return dialog.showOpenDialog(win, {
    title: 'Skin tanlash (64×64 PNG)',
    properties: ['openFile'],
    filters: [{ name: 'Minecraft skin', extensions: ['png'] }],
  });
}

/* ------------------------------------------------------------------ IPC */

ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  configPath: cfgmod.configPath(),
  userData: app.getPath('userData'),
  platform: process.platform,
  isPackaged: app.isPackaged,
  gameDir: cfgmod.readConfig().gameDir,
  autoLogin: process.env.ARCADIA_AUTO_LOGIN || '',
  forceLogin: !!process.env.ARCADIA_FORCE_LOGIN,
}));

ipcMain.handle('config:get', () => cfgmod.publicConfig());

ipcMain.handle('config:save', (_e, patch) => {
  const allowed = {};
  for (const key of [
    'baseUrl',
    'gameDir',
    'javaPath',
    'memoryMb',
    'serverHost',
    'serverPort',
    'autoJoin',
    'closeOnLaunch',
    'lastInstance',
  ]) {
    if (patch && Object.prototype.hasOwnProperty.call(patch, key)) allowed[key] = patch[key];
  }
  if (allowed.baseUrl) allowed.baseUrl = String(allowed.baseUrl).replace(/\/+$/, '');
  if (allowed.memoryMb) allowed.memoryMb = Number(allowed.memoryMb);
  if (allowed.serverPort) allowed.serverPort = Number(allowed.serverPort);
  if (allowed.gameDir) allowed.gameDir = path.resolve(String(allowed.gameDir));
  if (allowed.javaPath) allowed.javaPath = path.resolve(String(allowed.javaPath));
  cfgmod.writeConfig(allowed);
  return cfgmod.publicConfig();
});

ipcMain.handle('java:detect', (_e, javaPath) => {
  const info = mc.javaInfo(javaPath || cfgmod.readConfig().javaPath);
  return info;
});

ipcMain.handle('dialog:java', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'java.exe ni tanlang',
    properties: ['openFile'],
    filters: process.platform === 'win32' ? [{ name: 'Java', extensions: ['exe'] }] : [],
  });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('dialog:dir', async (_e, current) => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Papkani tanlang',
    defaultPath: current || undefined,
    properties: ['openDirectory', 'createDirectory'],
  });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('dialog:skin', async () => {
  const r = await pickSkinFile();
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('dialog:image', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Instans rasmini tanlash',
    properties: ['openFile'],
    filters: [{ name: 'Rasm', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  const file = r.filePaths[0];
  const image = nativeImage.createFromPath(file);
  if (image.isEmpty()) throw new Error('Rasmni o\u2018qib bo\u2018lmadi.');
  const size = image.getSize();
  if (size.width < 64 || size.height < 64) throw new Error('Rasm kamida 64×64 bo\u2018lishi kerak.');
  const png = image.toPNG();
  if (png.length > 4 * 1024 * 1024) throw new Error('Rasm juda katta (maks. 4 MB).');
  return { path: file, dataUrl: 'data:image/png;base64,' + png.toString('base64') };
});

ipcMain.handle('folder:open', async (_e, kind, instanceId) => {
  const cfg = cfgmod.readConfig();
  let target = cfg.gameDir;
  if (kind === 'instance') target = mc.instanceDir(instanceId);
  else if (kind === 'mods') target = mc.modsDir(instanceId);
  else if (kind === 'resourcepacks') target = path.join(mc.instanceDir(instanceId), 'resourcepacks');
  else if (kind === 'shaderpacks') target = path.join(mc.instanceDir(instanceId), 'shaderpacks');
  else if (kind === 'datapacks') target = path.join(mc.instanceDir(instanceId), 'datapacks');
  else if (kind === 'saves') target = path.join(mc.instanceDir(instanceId), 'saves');
  else if (kind === 'screenshots') target = path.join(mc.instanceDir(instanceId), 'screenshots');
  else if (kind === 'logs') target = path.join(mc.instanceDir(instanceId), 'logs');
  fs.mkdirSync(target, { recursive: true });
  const err = await shell.openPath(target);
  return { ok: !err, path: target, error: err || '' };
});

ipcMain.handle('auth:login', async (_e, username, password) => {
  const account = await arcadia.auth.login(username, password);
  return {
    account: cfgmod.publicConfig().account,
    avatar: await arcadia.avatar(account.uuid, account.skinVersion),
    skin: await arcadia.fullSkin(),
  };
});

ipcMain.handle('auth:logout', async () => {
  await arcadia.auth.logout();
  return true;
});

ipcMain.handle('auth:me', async () => {
  const user = await arcadia.auth.me();
  if (!user) return null;
  await arcadia.auth.refreshAccount();
  return user;
});

ipcMain.handle('status:get', () => arcadia.status());

ipcMain.handle('update:state', () => updater.getState());
ipcMain.handle('update:check', () => updater.check(true));
ipcMain.handle('update:install', () => updater.install());

ipcMain.handle('avatar:get', (_e, uuid, version) => arcadia.avatar(uuid, version));
ipcMain.handle('skin:get', () => arcadia.fullSkin());

ipcMain.handle('skin:upload', async (_e, filePath) => {
  const image = nativeImage.createFromPath(filePath);
  if (image.isEmpty()) throw new Error('PNG faylni o\u2018qib bo\u2018lmadi.');
  const size = image.getSize();
  if (size.width !== 64 || size.height !== 64) {
    throw new Error('Skin 64×64 PNG bo\u2018lishi kerak (hozir ' + size.width + '×' + size.height + ').');
  }
  const result = await arcadia.uploadSkin(filePath);
  return {
    account: cfgmod.publicConfig().account,
    avatar: await arcadia.avatar(result.account.uuid, result.account.skinVersion),
    skin: await arcadia.fullSkin(),
  };
});

ipcMain.handle('skin:reset', async () => {
  const result = await arcadia.resetSkin();
  return {
    account: cfgmod.publicConfig().account,
    avatar: await arcadia.avatar(result.account.uuid, Date.now()),
    skin: await arcadia.fullSkin(),
  };
});

ipcMain.handle('default:needs', () => defaultPack.needs());
ipcMain.handle('default:ensure', async () => {
  try {
    const result = await defaultPack.ensure((p) => send('default:progress', p));
    send('default:done', result);
    return result;
  } catch (e) {
    send('default:error', { error: e.message || String(e) });
    throw e;
  }
});

ipcMain.handle('instances:list', () => mc.listInstances());
ipcMain.handle('instances:create', (_e, data) => mc.createInstance(data));
ipcMain.handle('instances:update', (_e, id, patch) => mc.updateInstance(id, patch));
ipcMain.handle('instances:delete', (_e, id) => mc.deleteInstance(id));
ipcMain.handle('instances:icon', (_e, id) => mc.instanceIcon(id));
ipcMain.handle('instances:setIcon', (_e, id, dataUrl) => mc.setInstanceIcon(id, dataUrl));

ipcMain.handle('loader:install', async (_e, loader, minecraftVersion) => {
  try {
    const result = await mc.installLoader(loader, minecraftVersion, (p) => send('install:progress', p));
    send('install:done', { version: result.versionId, loader: result.loader });
    return result;
  } catch (e) {
    send('install:error', { error: e.message || String(e) });
    throw e;
  }
});

ipcMain.handle('instance:content', (_e, id, kind) => mc.listContent(id, kind));
ipcMain.handle('instance:toggleMod', (_e, id, name) => mc.toggleMod(id, name));
ipcMain.handle('instance:image', (_e, id, rel) => mc.readInstanceImage(id, rel));
ipcMain.handle('instance:files', (_e, id) => mc.listFiles(id));

ipcMain.handle('modrinth:search', (_e, input) => modrinth.search(input));
ipcMain.handle('modrinth:featured', (_e, input) => modrinth.featured(input));
ipcMain.handle('modrinth:project', (_e, id) => modrinth.project(id));
ipcMain.handle('modrinth:install', (_e, input) =>
  modrinth.install(Object.assign({}, input, { onProgress: (p) => send('modrinth:progress', p) }))
);

ipcMain.handle('versions:remote', async (_e, force) => {
  const list = await mc.versions(!!force);
  return {
    latest: list.latest,
    versions: (list.versions || []).map((v) => ({
      id: v.id,
      type: v.type,
      releaseTime: v.releaseTime,
    })),
  };
});

ipcMain.handle('versions:installed', () => mc.installedVersions());
ipcMain.handle('versions:isInstalled', (_e, id) => mc.isInstalled(id));

ipcMain.handle('install:start', async (_e, version) => {
  try {
    const id = await mc.installVersion(version, (p) => send('install:progress', p));
    send('install:done', { version: id });
    return { ok: true, version: id };
  } catch (e) {
    send('install:error', { error: e.message || String(e) });
    throw e;
  }
});

ipcMain.handle('install:cancel', () => mc.cancelInstall());

ipcMain.handle('game:launch', async (_e, instanceId) => {
  const result = await mc.launchInstance(instanceId, (ev) => send('game:event', ev));
  return result;
});

ipcMain.handle('game:stop', () => mc.stopGame());
ipcMain.handle('game:running', () => mc.isRunning());

ipcMain.handle('mods:list', (_e, instanceId) => mc.listMods(instanceId));

ipcMain.handle('external:open', async (_e, url) => {
  if (!allowExternal(url)) return false;
  await shell.openExternal(url);
  return true;
});

ipcMain.on('win:minimize', () => win && win.minimize());
ipcMain.on('win:maximize', () => {
  if (!win) return;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
});
ipcMain.on('win:close', () => win && win.close());

/* ------------------------------------------------------------------ boot */

app.whenReady().then(() => {
  if (app.isPackaged) {
    try {
      app.setAsDefaultProtocolClient(PROTOCOL);
    } catch (_) {
      /* protocol registration is best effort */
    }
  }

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: Object.assign({}, details.responseHeaders, {
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://cdn.modrinth.com https://cdn-raw.modrinth.com; font-src 'self' data:; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'",
        ],
      }),
    });
  });

  createWindow();
  updater.init({
    getWindow: () => win,
    dev: DEV,
    packaged: app.isPackaged,
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  mc.stopGame();
});

app.on('open-url', (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});
