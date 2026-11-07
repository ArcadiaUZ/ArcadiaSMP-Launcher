'use strict';

const fs = require('fs');
const path = require('path');
const { readConfig, saveAccount } = require('./config');

const DEFAULT_SKIN = path.join(__dirname, '..', 'renderer', 'assets', 'img', 'steve-skin.png');

function baseUrl() {
  return (readConfig().baseUrl || 'http://127.0.0.1:8081').replace(/\/+$/, '');
}

function joinUrl(p) {
  return baseUrl() + (p.startsWith('/') ? p : '/' + p);
}

function setCookieList(res) {
  if (typeof res.headers.getSetCookie === 'function') return res.headers.getSetCookie();
  const raw = res.headers.get('set-cookie') || '';
  if (!raw) return [];
  /* Best effort when getSetCookie is unavailable. Expires commas are protected. */
  return raw.split(/,(?=\s*[A-Za-z0-9_\-]+=)/g);
}

function fromResponse(res) {
  const list = setCookieList(res);
  if (!list.length) return '';
  return list.map((c) => c.split(';')[0].trim()).filter(Boolean).join('; ');
}

function errorText(data, fallback) {
  if (data && typeof data === 'object') {
    if (data.error) return String(data.error);
    if (data.message) return String(data.message);
  }
  return fallback;
}

async function readJson(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch (_) {
    return { error: text ? text.slice(0, 300) : 'Server javobi tushunarsiz.' };
  }
}

async function api(pathname, options) {
  const cfg = readConfig();
  const opts = options || {};
  const headers = Object.assign({ Accept: 'application/json' }, opts.headers || {});
  if (cfg.account && cfg.account.cookies) headers.Cookie = cfg.account.cookies;
  if (cfg.account && cfg.account.csrf && opts.method && opts.method !== 'GET') {
    headers['X-CSRF-Token'] = cfg.account.csrf;
  }
  let body = opts.body;
  if (body && !(body instanceof Uint8Array) && typeof body !== 'string') {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    body = JSON.stringify(body);
  }
  const res = await fetch(joinUrl(pathname), {
    method: opts.method || 'GET',
    headers,
    body,
    signal: AbortSignal.timeout(opts.timeout || 15000),
  });
  const data = await readJson(res);
  return { res, data };
}

async function login(username, password) {
  const name = String(username || '').trim();
  if (!name || name.length > 16) throw new Error('Nick 1–16 belgidan iborat bo\u2018lishi kerak.');
  if (!password) throw new Error('Parolni kiriting.');
  let res;
  try {
    res = await fetch(joinUrl('/api/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ username: name, password }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    throw new Error('Serverga ulanib bo\u2018lmadi. Panel ishlayaptimi? (' + (e.message || 'xato') + ')');
  }
  const data = await readJson(res);
  if (!res.ok || !data || !data.username) {
    throw new Error(errorText(data, 'Kirish rad etildi (' + res.status + ').'));
  }
  const account = {
    username: data.username,
    uuid: data.uuid,
    csrf: data.csrf || '',
    cookies: fromResponse(res),
    hasSkin: !!data.hasSkin,
    skinVersion: data.skinVersion || 0,
    balance: Number(data.balance) || 0,
    claimBlocks: Number(data.claimBlocks) || 0,
    claims: Number(data.claims) || 0,
    playtimeMinutes: Number(data.playtimeMinutes) || 0,
    status: data.status || "O'yinchi",
    rank: data.rank || "O'yinchi",
    sessionCreated: data.sessionCreated || Date.now(),
    sessionExpires: data.sessionExpires || 0,
    loginAt: Date.now(),
  };
  saveAccount(account);
  return account;
}

async function logout() {
  const cfg = readConfig();
  if (cfg.account && cfg.account.cookies) {
    try {
      await fetch(joinUrl('/api/auth/logout'), {
        method: 'POST',
        headers: {
          Cookie: cfg.account.cookies,
          'X-CSRF-Token': cfg.account.csrf || '',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(8000),
      });
    } catch (_) {
      /* local logout still wins */
    }
  }
  saveAccount(null);
  return true;
}

async function me() {
  const { res, data } = await api('/api/me');
  if (res.status === 401) return null;
  if (!res.ok || !data) throw new Error(errorText(data, 'Profil olinmadi.'));
  return data;
}

async function refreshAccount() {
  const cfg = readConfig();
  if (!cfg.account) return null;
  try {
    const user = await me();
    if (!user) {
      saveAccount(null);
      return null;
    }
    const account = Object.assign({}, cfg.account, {
      username: user.username,
      uuid: user.uuid,
      hasSkin: !!user.hasSkin,
      skinVersion: user.skinVersion || 0,
      balance: Number(user.balance) || 0,
      claimBlocks: Number(user.claimBlocks) || 0,
      claims: Number(user.claims) || 0,
      playtimeMinutes: Number(user.playtimeMinutes) || 0,
      status: user.status || "O'yinchi",
      rank: user.rank || "O'yinchi",
      sessionExpires: user.sessionExpires || cfg.account.sessionExpires,
    });
    saveAccount(account);
    return account;
  } catch (_) {
    return cfg.account;
  }
}

async function status() {
  try {
    const res = await fetch(joinUrl('/api/status'), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(6000),
    });
    const data = await readJson(res);
    if (!res.ok || !data) throw new Error('status ' + res.status);
    return { ok: true, status: data };
  } catch (e) {
    return { ok: false, error: e.message || 'Server javob bermadi.' };
  }
}

function mimeDataUrl(buf, mime) {
  return 'data:' + (mime || 'image/png') + ';base64,' + Buffer.from(buf).toString('base64');
}

async function avatar(uuid, version) {
  if (!uuid) return null;
  try {
    const res = await fetch(
      joinUrl('/avatars/' + encodeURIComponent(uuid) + '.png?v=' + (version || Date.now())),
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return mimeDataUrl(buf, res.headers.get('content-type') || 'image/png');
  } catch (_) {
    return null;
  }
}

async function fullSkin() {
  const cfg = readConfig();
  if (!cfg.account) return mimeDataUrl(fs.readFileSync(DEFAULT_SKIN), 'image/png');
  try {
    // Server endi shaxsiy skin bo'lmasa ham UUID bo'yicha to'g'ri
    // standart skinni (Stev/Alex/Zuri...) qaytaradi.
    const res = await fetch(
      joinUrl('/skins/' + encodeURIComponent(cfg.account.uuid) + '.png?v=' + (cfg.account.skinVersion || Date.now())),
      {
        headers: { Cookie: cfg.account.cookies || '' },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (res.ok) return mimeDataUrl(Buffer.from(await res.arrayBuffer()), 'image/png');
  } catch (_) {
    /* fall back to local default */
  }
  return mimeDataUrl(fs.readFileSync(DEFAULT_SKIN), 'image/png');
}

async function uploadSkin(filePath) {
  const cfg = readConfig();
  if (!cfg.account) throw new Error('Avval hisobingizga kiring.');
  const buf = fs.readFileSync(filePath);
  if (!buf.length) throw new Error('Fayl bo\u2018sh.');
  if (buf.length > 512 * 1024) throw new Error('PNG fayl juda katta (maks. 512 KB).');
  const { res, data } = await api('/api/skin', {
    method: 'POST',
    headers: { 'Content-Type': 'image/png' },
    body: buf,
  });
  if (!res.ok) throw new Error(errorText(data, 'Skin qabul qilinmadi.'));
  const account = Object.assign({}, cfg.account, {
    hasSkin: true,
    skinVersion: Date.now(),
  });
  saveAccount(account);
  return { ok: true, account };
}

async function resetSkin() {
  const cfg = readConfig();
  if (!cfg.account) throw new Error('Avval hisobingizga kiring.');
  const { res, data } = await api('/api/skin', { method: 'DELETE' });
  if (!res.ok) throw new Error(errorText(data, 'Skinni o\u2018chirib bo\u2018lmadi.'));
  const account = Object.assign({}, cfg.account, {
    hasSkin: false,
    skinVersion: Date.now(),
  });
  saveAccount(account);
  return { ok: true, account };
}

module.exports = {
  auth: { login, logout, me, refreshAccount },
  status,
  avatar,
  fullSkin,
  uploadSkin,
  resetSkin,
  baseUrl,
  joinUrl,
  api,
};
