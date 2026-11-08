'use strict';

const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const CONFIG_FILE = 'launcher.json';

function firstExisting(paths) {
  for (const p of paths) {
    try {
      if (p && fs.existsSync(p)) return p;
    } catch (_) {
      /* ignore */
    }
  }
  return '';
}

function detectJava() {
  const candidates = [];
  if (process.env.JAVA_HOME) {
    candidates.push(path.join(process.env.JAVA_HOME, 'bin', 'java.exe'));
    candidates.push(path.join(process.env.JAVA_HOME, 'bin', 'java'));
  }
  candidates.push('D:\\Project\\ArcadiaSMP\\java25\\bin\\java.exe');
  candidates.push('C:\\Program Files\\Java\\jdk-25\\bin\\java.exe');
  candidates.push('C:\\Program Files\\Eclipse Adoptium\\jdk-25\\bin\\java.exe');
  candidates.push('C:\\Program Files\\Microsoft\\jdk-25\\bin\\java.exe');
  const found = firstExisting(candidates);
  if (found) return found;
  return process.platform === 'win32' ? 'java.exe' : 'java';
}

function defaultConfig() {
  return {
    version: 1,
    baseUrl: 'http://127.0.0.1:8081',
    gameDir: path.join(app.getPath('userData'), 'game'),
    javaPath: detectJava(),
    memoryMb: 4096,
    serverHost: '127.0.0.1',
    serverPort: 25565,
    autoJoin: true,
    closeOnLaunch: false,
    account: null,
    lastInstance: 'arcadia',
  };
}

function configPath() {
  return path.join(app.getPath('userData'), CONFIG_FILE);
}

function readConfig() {
  const def = defaultConfig();
  try {
    const raw = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    return Object.assign(def, raw, {
      account: raw.account && typeof raw.account === 'object' ? raw.account : null,
    });
  } catch (_) {
    return def;
  }
}

function writeConfig(patch) {
  const current = readConfig();
  const next = Object.assign({}, current, patch || {});
  if (next.memoryMb) next.memoryMb = Math.max(1024, Math.min(16384, Number(next.memoryMb) || 4096));
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(next, null, 2), 'utf8');
  return next;
}

function saveAccount(account) {
  return writeConfig({ account: account || null });
}

function publicConfig(cfg) {
  const c = cfg || readConfig();
  return {
    baseUrl: c.baseUrl,
    gameDir: c.gameDir,
    javaPath: c.javaPath,
    memoryMb: c.memoryMb,
    serverHost: c.serverHost,
    serverPort: c.serverPort,
    autoJoin: c.autoJoin,
    closeOnLaunch: c.closeOnLaunch,
    lastInstance: c.lastInstance,
    account: c.account
      ? {
          username: c.account.username,
          uuid: c.account.uuid,
          skinVersion: c.account.skinVersion || 0,
          skinModel: c.account.skinModel === 'slim' ? 'slim' : 'classic',
          hasSkin: !!c.account.hasSkin,
          hasCape: !!c.account.hasCape,
          capeVersion: c.account.capeVersion || 0,
          sessionExpires: c.account.sessionExpires || 0,
        }
      : null,
  };
}

module.exports = {
  configPath,
  readConfig,
  writeConfig,
  saveAccount,
  publicConfig,
  defaultConfig,
  detectJava,
};
