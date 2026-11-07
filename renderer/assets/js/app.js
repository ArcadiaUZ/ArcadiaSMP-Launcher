/* ArcadiaSMP Launcher — renderer
   Icon rail + full-bleed home + SKLauncher-inspired instance workspace. */
(function () {
  'use strict';

  const A = window.arcadia;
  const Icons = window.Icons || window.ArcadiaIcons;
  const $ = (id) => document.getElementById(id);
  const qs = (sel, root) => (root || document).querySelector(sel);
  const qsa = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const S = {
    info: null,
    config: null,
    account: null,
    avatar: null,
    skin: null,
    instances: [],
    instance: null,
    icons: {},
    installed: {},
    page: 'home',
    detailTab: 'content',
    contentKind: 'mods',
    status: null,
    statusTimer: null,
    playing: false,
    starting: false,
    installing: false,
    launchInstanceId: null,
    viewer: null,
    browse: null,
    remote: null,
    newInst: null,
    update: null,
  };

  const TITLES = {
    home: ['Bosh sahifa', 'Launcher, server va yangiliklar'],
    instances: ['Kutubxona', 'Instanslar va o\u2018yin profillari'],
    content: ['Kontent', 'Modlar, resource pack va shaderlar'],
    detail: ['Instans', 'Kontent va sozlamalar'],
    servers: ['Serverlar', 'ArcadiaSMP bilan bog\u2018lanish'],
    skins: ['Ko\u2018rinish', 'Skin va 3D ko\u2018rinish'],
    settings: ['Sozlamalar', 'Launcher va Java'],
  };

  const LOADERS = {
    vanilla: { label: 'Vanilla', block: 'grass', color: '#3ddc84' },
    fabric: { label: 'Fabric', block: 'emerald', color: '#3ddc84' },
    forge: { label: 'Forge', block: 'copper', color: '#e08a4a' },
    neoforge: { label: 'NeoForge', block: 'redstone', color: '#ef6464' },
    quilt: { label: 'Quilt', block: 'amethyst', color: '#c084fc' },
  };

  const NEWS = [
    { id: 'modrinth', icon: 'puzzle', title: 'Modrinth integratsiyasi', sub: 'Bir bosishda mod o\u2018rnatish', date: 'Yangi', action: 'content' },
    { id: 'advancements', icon: 'target', title: '126 topshiriq', sub: '26.3 to\u2018liq ro\u2018yxati', date: 'Yangilandi', url: '/advancements.html' },
    { id: 'elections', icon: 'landmark', title: 'Saylov va claim', sub: 'Adolatli boshqaruv', date: 'Server', url: '/vote.html' },
    { id: 'claim', icon: 'shield', title: 'Claim qo\u2018llanmasi', sub: 'Yeringizni himoyalang', date: 'Qo\u2018llanma', url: '/feature-claim.html' },
  ];

  const BLOCK_COLORS = {
    grass: { top: '#5fcf6a', left: '#7a4b2b', right: '#5d3820', strip: '#4fb95a' },
    emerald: { top: '#46e28b', left: '#0f8a55', right: '#0b6b43' },
    copper: { top: '#e08a4a', left: '#9a4f2a', right: '#7a3d20' },
    redstone: { top: '#ef6464', left: '#a52a2a', right: '#7f1d1d' },
    amethyst: { top: '#c084fc', left: '#7e22ce', right: '#581c87' },
    dirt: { top: '#9a6a3a', left: '#6f4a28', right: '#563a20' },
    stone: { top: '#a8b0aa', left: '#6b746e', right: '#4b544f' },
  };

  /* ============================================================ helpers */

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function errText(e) {
    return String((e && (e.message || e.error)) || e || 'Xatolik yuz berdi.');
  }

  function toast(message, kind, title) {
    const root = $('toastRoot');
    if (!root) return;
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || 'info');
    const icon = kind === 'err' ? 'alert' : kind === 'ok' ? 'check-circle' : 'info';
    el.innerHTML =
      Icons.html(icon) +
      '<div>' + (title ? '<b>' + esc(title) + '</b>' : '') + '<span>' + esc(message) + '</span></div>';
    root.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(6px)';
      el.style.transition = 'opacity .2s, transform .2s';
      setTimeout(() => el.remove(), 220);
    }, 4200);
  }

  function bytes(n) {
    const v = Number(n) || 0;
    if (v >= 1024 * 1024) return (v / 1024 / 1024).toFixed(1) + ' MB';
    if (v >= 1024) return Math.round(v / 1024) + ' KB';
    return v + ' B';
  }

  function downloads(n) {
    const v = Number(n) || 0;
    if (v >= 1000000) return (v / 1000000).toFixed(1) + 'M';
    if (v >= 1000) return (v / 1000).toFixed(1) + 'K';
    return String(v);
  }

  function timeAgo(ts) {
    const n = Number(ts) || 0;
    if (!n) return 'Hech qachon';
    const diff = Math.max(0, Date.now() - n);
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'Hozir';
    if (min < 60) return min + ' daq oldin';
    const hours = Math.floor(min / 60);
    if (hours < 24) return hours + ' soat oldin';
    const days = Math.floor(hours / 24);
    if (days < 7) return days + ' kun oldin';
    return new Date(n).toLocaleDateString('uz-UZ');
  }

  function duration(ms) {
    const total = Math.max(0, Math.round((Number(ms) || 0) / 60000));
    if (total < 1) return '0 daq';
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (!h) return m + ' daq';
    return h + ' soat' + (m ? ' ' + m + ' daq' : '');
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (__) { /* ignore */ }
      ta.remove();
      return true;
    }
  }

  function serverAddress() {
    const host = (S.config && S.config.serverHost) || '127.0.0.1';
    const port = (S.config && Number(S.config.serverPort)) || 25565;
    return host + ':' + port;
  }

  function base() {
    return ((S.config && S.config.baseUrl) || 'http://127.0.0.1:8081').replace(/\/+$/, '');
  }

  function loaderOf(inst) {
    return LOADERS[(inst && inst.loader) || 'vanilla'] || LOADERS.vanilla;
  }

  function supportsMods(inst) {
    return !!inst && ['fabric', 'forge', 'neoforge', 'quilt'].includes(inst.loader);
  }

  function blockSvg(kind) {
    const c = BLOCK_COLORS[kind] || BLOCK_COLORS.grass;
    const strip = c.strip
      ? '<polygon points="2,18 32,34 32,41 2,25" fill="' + c.strip + '" opacity=".9"/>'
      : '';
    return (
      '<svg viewBox="0 0 64 72" aria-hidden="true">' +
      '<polygon points="32,2 62,18 32,34 2,18" fill="' + c.top + '"/>' +
      strip +
      '<polygon points="2,18 32,34 32,70 2,54" fill="' + c.left + '"/>' +
      '<polygon points="62,18 32,34 32,70 62,54" fill="' + c.right + '"/>' +
      '<path d="M2 18 32 34l30-16M32 34v36" fill="none" stroke="rgba(255,255,255,.16)" stroke-width="1.2"/>' +
      '<path d="M9 23l8 4v9l-8-4zM17 45l7 3.5v8L17 53zM45 47l8-4v8l-8 4z" fill="rgba(0,0,0,.13)"/>' +
      '<path d="M48 21l5-2.5v4L48 25z" fill="rgba(255,255,255,.24)"/>' +
      '</svg>'
    );
  }

  function instanceVisual(inst, cls) {
    const url = S.icons[inst.id];
    if (url) return '<img src="' + url + '" alt="">';
    return '<span class="block ' + (cls || '') + '">' + blockSvg(loaderOf(inst).block) + '</span>';
  }

  function instanceMeta(inst) {
    return loaderOf(inst).label + ' · ' + inst.version;
  }

  function isInstalled(inst) {
    if (!inst) return false;
    const id = inst.versionId || inst.version;
    return !!S.installed[id];
  }

  function currentInstance() {
    if (!S.instance && S.instances.length) S.instance = S.instances[0];
    return S.instance;
  }

  async function getAvatar(uuid, version) {
    try { return await A.avatar(uuid, version); } catch (_) { return null; }
  }

  function setAvatar(node, url) {
    if (!node) return;
    node.innerHTML = '<img src="' + (url || 'assets/img/steve-head.png') + '" alt="">';
  }

  async function fillHead(node, uuid, version) {
    if (!node) return;
    const url = await getAvatar(uuid, version);
    if (url) node.innerHTML = '<img src="' + url + '" alt="">';
  }

  function openExternal(url) {
    if (!url) return;
    A.external(url).catch(() => toast('Havolani ochib bo\u2018lmadi', 'err'));
  }

  /* ============================================================ modal */

  function openModal(html, opts) {
    const root = $('modalRoot');
    const box = $('modalBox');
    box.className = 'modal-box' + (opts && opts.wide ? ' wide' : '');
    box.innerHTML = html;
    root.classList.remove('hidden');
    Icons.mount(box);
    qsa('[data-close]', box).forEach((b) =>
      b.addEventListener('click', (e) => {
        e.preventDefault();
        closeModal();
      })
    );
  }

  function closeModal() {
    $('modalRoot').classList.add('hidden');
    $('modalBox').innerHTML = '';
  }

  function modalHead(title, sub, closeText) {
    return (
      '<div class="modal-head"><div><h2>' + esc(title) + '</h2>' +
      (sub ? '<p>' + esc(sub) + '</p>' : '') +
      '</div><button class="modal-close" data-close="1" title="' + esc(closeText || 'Yopish') + '">' +
      Icons.html('x') + '</button></div>'
    );
  }

  /* ============================================================ account */

  function renderAccount() {
    const acct = S.account || {};
    setAvatar($('railAccount'), S.avatar);
    if ($('railAccount')) $('railAccount').title = acct.username || 'Hisob';
    setAvatar($('skinAvatar'), S.avatar);
    if ($('skinAccount')) $('skinAccount').textContent = acct.username || '—';
    if ($('skinName')) $('skinName').textContent = acct.username || '—';
    if ($('skinUuid')) $('skinUuid').textContent = acct.uuid || '';
  }

  function accountModal() {
    const acct = S.account || {};
    openModal(
      modalHead(acct.username || 'Hisob', 'ArcadiaSMP hisobi') +
        '<div class="modal-body">' +
        '<div class="skin-owner"><span class="avatar lg" id="amAvatar"></span><div><b>' +
        esc(acct.username || '—') + '</b><small>' + esc(acct.uuid || '') + '</small></div></div>' +
        '<div class="about-row" style="margin-top:14px"><span>Holat</span><b>' + esc(acct.rank || 'O\u2018yinchi') + '</b></div>' +
        '<div class="about-row"><span>Emerald</span><b>' + esc(acct.balance || 0) + '</b></div>' +
        '<div class="about-row"><span>Claim</span><b>' + esc(acct.claims || 0) + '</b></div>' +
        '<div class="about-row"><span>O\u2018yin vaqti</span><b>' + esc(duration((Number(acct.playtimeMinutes) || 0) * 60000)) + '</b></div>' +
        '</div>' +
        '<div class="modal-foot"><button class="btn ghost" id="amSite"><span data-icon="globe"></span> Sayt</button>' +
        '<span class="spacer"></span><button class="btn danger" id="amLogout"><span data-icon="logout"></span> Chiqish</button></div>'
    );
    setAvatar($('amAvatar'), S.avatar);
    $('amSite').addEventListener('click', () => openExternal(base() + '/dashboard.html'));
    $('amLogout').addEventListener('click', async () => {
      closeModal();
      try { await A.auth.logout(); } catch (_) { /* ignore */ }
      S.account = null;
      S.avatar = null;
      S.skin = null;
      S.viewer = null;
      S.instances = [];
      S.instance = null;
      S.icons = {};
      S.status = null;
      if (S.statusTimer) clearInterval(S.statusTimer);
      showLogin();
      toast('Hisobdan chiqdingiz', 'ok');
    });
  }

  /* ============================================================ status */

  function renderStatus(result) {
    const ok = !!(result && result.ok);
    const st = (result && result.status) || { online: 0, max: 20, players: [], version: '26.3' };
    S.status = ok ? st : null;

    if ($('loginDot')) {
      $('loginDot').className = 'dot ' + (ok ? '' : 'off');
      $('loginServerState').textContent = ok
        ? 'Server onlayn · ' + (st.online || 0) + '/' + (st.max || 20)
        : 'Server oflayn — panelni ishga tushiring';
    }

    if ($('serversPillDot')) {
      $('serversPillDot').className = 'dot ' + (ok ? '' : 'off');
      $('serversPillText').textContent = ok ? 'Onlayn · ' + (st.online || 0) + '/' + (st.max || 20) : 'Oflayn';
      $('serversOnline').textContent = ok ? st.online || 0 : 0;
      $('serversMax').textContent = ok ? st.max || 20 : 20;
      $('serversVersion').textContent = ok ? st.version || '26.3' : '—';
      $('playersCount').textContent = ok ? (st.players || []).length : 0;

      const grid = $('playersGrid');
      grid.innerHTML = '';
      if (!ok) {
        grid.innerHTML = '<p class="small muted">Server oflayn yoki panel ishlamayapti.</p>';
      } else if (!(st.players || []).length) {
        grid.innerHTML = '<p class="small muted">Hozircha hech kim onlayn emas. Birinchi bo\u2018ling!</p>';
      } else {
        (st.players || []).forEach((p) => {
          const card = document.createElement('div');
          card.className = 'player-card';
          card.innerHTML = '<div class="phead"></div><b>' + esc(p.name) + '</b>';
          grid.appendChild(card);
          fillHead(qs('.phead', card), p.uuid, p.skinVersion);
        });
      }
    }
  }

  async function refreshStatus() {
    try { renderStatus(await A.status()); }
    catch (_) { renderStatus({ ok: false }); }
  }

  function startStatusLoop() {
    if (S.statusTimer) clearInterval(S.statusTimer);
    S.statusTimer = setInterval(() => {
      if (S.page === 'servers' || !$('loginView').classList.contains('hidden')) refreshStatus();
    }, 30000);
  }

  /* ============================================================ login */

  function showLogin() {
    $('loginView').classList.remove('hidden');
    $('appView').classList.add('hidden');
    $('loginVersion').textContent = (S.info && S.info.version) || '0.2.4';
    if (S.config && S.config.account && S.config.account.username) {
      $('loginUser').value = S.config.account.username;
    }
    $('loginBase').value = (S.config && S.config.baseUrl) || 'http://127.0.0.1:8081';
    $('loginServerState').textContent = 'Server tekshirilmoqda…';
    $('loginDot').className = 'dot wait';
    refreshStatus();
    setTimeout(() => $('loginUser').focus(), 120);
  }

  async function doLogin(username, password) {
    const btn = $('loginBtn');
    const old = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = Icons.html('refresh') + '<span>Kirilmoqda…</span>';
    $('loginError').classList.add('hidden');
    try {
      const result = await A.auth.login(username, password);
      S.account = result.account;
      S.avatar = result.avatar;
      S.skin = result.skin;
      S.config = await A.config.get();
      await enterApp();
      toast('Xush kelibsiz, ' + (S.account ? S.account.username : username) + '!', 'ok');
    } catch (e) {
      $('loginError').textContent = errText(e);
      $('loginError').classList.remove('hidden');
    } finally {
      btn.disabled = false;
      btn.innerHTML = old;
      Icons.mount(btn);
    }
  }

  function bindLogin() {
    $('loginForm').addEventListener('submit', (e) => {
      e.preventDefault();
      doLogin($('loginUser').value.trim(), $('loginPass').value);
    });
    $('togglePass').addEventListener('click', () => {
      const input = $('loginPass');
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      $('togglePass').innerHTML = Icons.html(show ? 'eye-off' : 'eye');
    });
    $('loginSettingsBtn').addEventListener('click', () => $('loginSettings').classList.toggle('hidden'));
    $('loginBaseSave').addEventListener('click', async () => {
      const value = $('loginBase').value.trim() || 'http://127.0.0.1:8081';
      try {
        S.config = await A.config.save({ baseUrl: value });
        toast('Manzil saqlandi', 'ok');
        fillHome();
        refreshStatus();
      } catch (e) { toast(errText(e), 'err'); }
    });
  }

  /* ============================================================ app data */

  async function loadIcons() {
    S.icons = {};
    await Promise.all(
      S.instances.map(async (inst) => {
        if (!inst.icon) return;
        try {
          const url = await A.instances.icon(inst.id);
          if (url) S.icons[inst.id] = url;
        } catch (_) { /* optional */ }
      })
    );
  }

  async function reloadInstances() {
    S.instances = await A.instances.list();
    await loadIcons();
    S.instance = S.instances.find((i) => i.id === (S.config && S.config.lastInstance)) || S.instances[0] || null;
    if (S.instance && (!S.config || S.config.lastInstance !== S.instance.id)) {
      S.config = await A.config.save({ lastInstance: S.instance.id });
    }
    await refreshInstalled();
  }

  async function refreshInstalled() {
    const checks = S.instances.map(async (inst) => {
      const id = inst.versionId || inst.version;
      try { S.installed[id] = await A.versions.isInstalled(id); }
      catch (_) { S.installed[id] = false; }
    });
    await Promise.all(checks);
  }

  async function enterApp() {
    $('loginView').classList.add('hidden');
    $('appView').classList.remove('hidden');
    if (!S.account && S.config && S.config.account) S.account = S.config.account;
    await reloadInstances();
    if (!S.avatar && S.account) S.avatar = await getAvatar(S.account.uuid, S.account.skinVersion);
    if (!S.skin) S.skin = await A.skin.get().catch(() => null);

    renderAccount();
    renderRailInstances();
    renderHome();
    startStatusLoop();
    route('home');
    setTimeout(maybeProvisionDefault, 500);
  }

  /* ============================================================ default client pack */

  async function maybeProvisionDefault() {
    if (!A.defaultPack || S.defaultSetup) return;
    let needed = false;
    try {
      needed = await A.defaultPack.needs();
    } catch (_) {
      return;
    }
    if (!needed) return;
    openDefaultSetup();
  }

  function openDefaultSetup() {
    S.defaultSetup = true;
    openModal(
      modalHead('Arcadia to‘plami', 'Voxy, Photon va client modlar tayyorlanmoqda', 'Fon rejimida') +
        '<div class="modal-body"><p class="muted" style="margin:0 0 12px;font-size:12px;line-height:1.6">' +
        'Birinchi ishga tushirishda ArcadiaSMP uchun tayyorlangan Fabric to‘plami yuklanadi. ' +
        'Voxy uchun Sodium 0.9.2 va Iris 1.11.7 pinlangan; Photon shader avtomatik yoqiladi. ' +
        'Flashback (192 MB) ixtiyoriy — keyin Kontent bo‘limidan qo‘shish mumkin.</p>' +
        '<div class="progress-box show"><div class="progress-top"><span id="dpProgressText">Tayyorlanmoqda…</span><b id="dpProgressPct">0%</b></div>' +
        '<div class="progress-bar"><i id="dpProgressBar"></i></div></div>' +
        '<div class="settings-note" style="margin-top:12px"><span data-icon="info"></span><span id="dpNote">' +
        'Yuklash fon rejimida davom etadi. Launcherdan foydalanish mumkin.</span></div></div>' +
        '<div class="modal-foot"><button class="btn ghost" id="dpRetry" style="display:none">' + Icons.html('refresh') + ' Qayta urinish</button>' +
        '<span class="spacer"></span><button class="btn ghost" data-close="1">Fon rejimida</button></div>'
    );
    Icons.mount($('modalBox'));
    const retry = $('dpRetry');
    if (retry) retry.addEventListener('click', () => {
      retry.style.display = 'none';
      runDefaultProvision();
    });
    runDefaultProvision();
  }

  async function runDefaultProvision() {
    if (!A.defaultPack || S.defaultProvisioning) return;
    S.defaultProvisioning = true;
    const un = A.defaultPack.onProgress((p) => {
      if (!$('dpProgressBar')) return;
      const percent = Number(p && p.percent) || 0;
      setProgress('dp', (p && p.text) || 'Tayyorlanmoqda…', percent);
      const note = $('dpNote');
      if (note && p && p.total) note.textContent = (p.index || 0) + ' / ' + p.total + ' · ' + (p.title || 'Arcadia to‘plami');
      else if (note && p && p.text) note.textContent = p.text;
    });
    try {
      const res = await A.defaultPack.ensure();
      await reloadInstances();
      renderRailInstances();
      renderHome();
      if (S.page === 'detail' || S.page === 'content') renderDetail();
      if (res && res.failed && res.failed.length) {
        const note = $('dpNote');
        if (note) note.textContent = res.failed.length + ' ta fayl yuklanmadi: ' + res.failed.map((f) => f.title).join(', ');
        const retry = $('dpRetry');
        if (retry) retry.style.display = '';
        toast(res.failed.length + ' ta fayl yuklanmadi. Qayta urinib ko‘ring.', 'err');
      } else {
        if ($('dpProgressBar')) setProgress('dp', 'Tayyor', 100);
        setTimeout(() => {
          if ($('dpProgressBar')) closeModal();
        }, 700);
        toast('Arcadia to‘plami tayyor · ' + (res ? res.installed : 0) + ' ta fayl', 'ok');
      }
    } catch (e) {
      const note = $('dpNote');
      if (note) note.textContent = errText(e);
      const retry = $('dpRetry');
      if (retry) retry.style.display = '';
      toast(errText(e), 'err', 'To‘plam yuklanmadi');
    } finally {
      un();
      S.defaultProvisioning = false;
      S.defaultSetup = false;
    }
  }

  /* ============================================================ blocks / rail */

  function renderRailInstances() {
    const box = $('railInstances');
    if (!box) return;
    box.innerHTML = S.instances
      .slice(0, 10)
      .map(
        (inst) =>
          '<button class="rail-inst' + (S.instance && inst.id === S.instance.id ? ' active' : '') +
          '" data-inst="' + esc(inst.id) + '" data-tip="' + esc(inst.name) + '" title="' + esc(inst.name) + '">' +
          instanceVisual(inst) + '</button>'
      )
      .join('');
    Icons.mount(box);
  }

  function renderHome() {
    fillHome();
    renderHomeInstance();
    renderHomePlay();
  }

  function fillHome() {
    if ($('homeIpText')) $('homeIpText').textContent = serverAddress();
    if ($('homeVersion')) $('homeVersion').textContent = 'v' + ((S.info && S.info.version) || '0.2.4');
    if ($('serversIp')) $('serversIp').textContent = serverAddress();
    if ($('aboutVersion')) $('aboutVersion').textContent = (S.info && S.info.version) || '0.2.4';
  }

  function renderHomeInstance() {
    const inst = currentInstance();
    if (!inst) return;
    if ($('homeInstIcon')) $('homeInstIcon').innerHTML = instanceVisual(inst);
    if ($('homeInstName')) $('homeInstName').textContent = inst.name;
    if ($('homeInstMeta')) $('homeInstMeta').textContent = instanceMeta(inst);
    Icons.mount($('homeInstIcon'));
  }

  function renderHomePlay() {
    const btn = $('homePlay');
    if (!btn) return;
    btn.innerHTML = S.playing
      ? Icons.html('power') + '<span>To\u2018xtatish</span>'
      : Icons.html('play') + '<span>O\u2018ynash</span>';
    btn.classList.toggle('primary', !S.playing);
    btn.classList.toggle('danger', S.playing);
  }

  function renderGameUI() {
    const chip = $('gameChip');
    if (chip) {
      chip.classList.toggle('hidden', !S.playing);
      const inst = S.instances.find((i) => i.id === S.launchInstanceId);
      $('gameChipText').textContent = inst ? inst.name : 'O\u2018yin ishlamoqda';
    }
    renderHomePlay();
    if (S.page === 'detail' || S.page === 'content') renderDetail();
  }

  /* ============================================================ navigation */

  function route(page) {
    if (!TITLES[page]) page = 'home';
    S.page = page;
    const visualPage = page === 'content' || page === 'detail' ? 'page-detail' : 'page-' + page;
    qsa('.rail-btn[data-page]').forEach((b) => b.classList.toggle('active', b.dataset.page === page));
    qsa('.page').forEach((p) => p.classList.toggle('active', p.id === visualPage));
    $('content').classList.toggle('lock', page === 'home');
    $('content').scrollTop = 0;
    $('pageTitle').textContent = TITLES[page][0];
    $('pageSub').textContent = TITLES[page][1];
    $('backBtn').classList.toggle('hidden', !(page === 'content' || page === 'detail'));

    if (page === 'home') renderHome();
    if (page === 'instances') renderInstances();
    if (page === 'detail' || page === 'content') renderDetail();
    if (page === 'servers') {
      renderStatus({ ok: !!S.status, status: S.status || {} });
      refreshStatus();
    }
    if (page === 'skins') {
      renderAccount();
      mountSkinViewer();
    }
    if (page === 'settings') fillSettings();
  }

  function setInstance(id, save) {
    const inst = S.instances.find((i) => i.id === id);
    if (!inst) return;
    S.instance = inst;
    if (save !== false) {
      A.config.save({ lastInstance: inst.id }).then((cfg) => { S.config = cfg; }).catch(() => {});
    }
    renderRailInstances();
    renderHomeInstance();
    if (S.page === 'detail' || S.page === 'content') renderDetails();
    if (S.page === 'instances') renderInstances();
  }

  function renderDetails() { renderDetail(); }

  /* ============================================================ library */

  function renderInstances() {
    const grid = $('instanceGrid');
    if (!grid) return;
    if (!S.instances.length) {
      grid.innerHTML =
        '<div class="empty-state" style="grid-column:1/-1"><span class="empty-ico">' + Icons.html('boxes') +
        '</span><h4>Instans yo\u2018q</h4><p>Birinchi instansni yarating va Minecraft 26.3 ni yuklang.</p>' +
        '<button class="btn primary" id="emptyNew">' + Icons.html('plus') + ' Yangi instans</button></div>';
      $('emptyNew').addEventListener('click', openNewInstance);
      return;
    }
    grid.innerHTML = S.instances
      .map((inst) => {
        const active = S.instance && inst.id === S.instance.id;
        const ready = isInstalled(inst);
        return (
          '<article class="inst-card' + (active ? ' active' : '') + '" data-open="' + esc(inst.id) + '">' +
          '<div class="inst-cover">' + instanceVisual(inst) +
          '<div class="inst-badges"><span class="inst-badge loader">' + esc(loaderOf(inst).label) + '</span>' +
          '<span class="inst-badge">MC ' + esc(inst.version) + '</span></div>' +
          '<button class="inst-menu" data-menu="' + esc(inst.id) + '" title="Boshqarish">' + Icons.html('menu') + '</button></div>' +
          '<div class="inst-body"><h3>' + esc(inst.name) + '</h3>' +
          '<div class="inst-meta"><i>' + (ready ? 'Tayyor' : 'O\u2018rnatilmagan') + '</i><i>·</i><i>' +
          esc(inst.lastPlayed ? timeAgo(inst.lastPlayed) : 'Hali o\u2018ynalmagan') + '</i></div>' +
          '<div class="inst-foot"><button class="inst-play" data-play="' + esc(inst.id) + '">' +
          Icons.html('play') + ' O\u2018ynash</button>' +
          '<span class="inst-time">' + esc(duration(inst.playtimeMs)) + '</span></div></div></article>'
        );
      })
      .join('');
    Icons.mount(grid);
  }

  function instanceMenu(id) {
    const inst = S.instances.find((i) => i.id === id);
    if (!inst) return;
    openModal(
      modalHead(inst.name, instanceMeta(inst)) +
        '<div class="modal-body" style="display:grid;gap:7px">' +
        '<button class="btn ghost" style="justify-content:flex-start" id="imOpen">' + Icons.html('boxes') + ' Instansni ochish</button>' +
        '<button class="btn ghost" style="justify-content:flex-start" id="imPlay">' + Icons.html('play') + ' O\u2018ynash</button>' +
        '<button class="btn ghost" style="justify-content:flex-start" id="imSettings">' + Icons.html('settings') + ' Instans sozlamalari</button>' +
        '<button class="btn ghost" style="justify-content:flex-start" id="imFolder">' + Icons.html('folder') + ' Papkani ochish</button>' +
        '</div>' +
        '<div class="modal-foot"><span class="spacer"></span><button class="btn danger" id="imDelete">' +
        Icons.html('trash') + ' O\u2018chirish</button></div>'
    );
    $('imOpen').addEventListener('click', () => { closeModal(); openDetail(id, 'content'); });
    $('imPlay').addEventListener('click', () => { closeModal(); play(id); });
    $('imSettings').addEventListener('click', () => { closeModal(); openInstanceSettings(id); });
    $('imFolder').addEventListener('click', () => {
      A.folder.open('instance', id).then((r) => { if (!r.ok) toast(r.error || 'Papka ochilmadi', 'err'); });
    });
    $('imDelete').addEventListener('click', () => {
      closeModal();
      confirmModal(
        'Instansni o\u2018chirish',
        '“' + inst.name + '” va uning modlari, dunyolari o\u2018chiriladi. Bu amalni qaytarib bo\u2018lmaydi.',
        async () => {
          try {
            await A.instances.delete(id);
            await reloadInstances();
            renderRailInstances();
            renderInstances();
            toast('Instans o\u2018chirildi', 'ok');
          } catch (e) { toast(errText(e), 'err'); }
        }
      );
    });
  }

  function confirmModal(title, text, action) {
    openModal(
      modalHead(title, 'Tasdiqlang') + '<div class="modal-body"><p class="muted" style="margin:0;line-height:1.65">' +
        esc(text) + '</p></div><div class="modal-foot"><span class="spacer"></span>' +
        '<button class="btn ghost" data-close="1">Bekor qilish</button><button class="btn danger" id="confirmYes">' +
        Icons.html('check') + ' Tasdiqlash</button></div>'
    );
    $('confirmYes').addEventListener('click', async () => {
      closeModal();
      await action();
    });
  }

  /* ============================================================ detail */

  function detailNews() {
    return NEWS.slice(0, 3)
      .map(
        (n) =>
          '<button class="dnews-item" data-news="' + n.id + '"><span class="dnews-art">' + Icons.html(n.icon) +
          '</span><span><b>' + esc(n.title) + '</b><small>' + esc(n.sub) + '</small></span></button>'
      )
      .join('');
  }

  function renderDetail() {
    const root = $('detailRoot');
    if (!root) return;
    const inst = currentInstance();
    if (!inst) {
      root.innerHTML = '<div class="empty-state"><h4>Instans tanlanmagan</h4><p>Kutubxonadan instans yarating.</p></div>';
      return;
    }
    const ready = isInstalled(inst);
    const running = S.playing && S.launchInstanceId === inst.id;
    const tab = S.detailTab || 'content';
    const statusText = running ? 'O\u2018ynalmoqda' : S.installing ? 'O\u2018rnatilmoqda…' : ready ? 'Tayyor' : 'O\u2018rnatilmagan';
    const tabBtn = (id, label) =>
      '<button class="dtab' + (tab === id ? ' active' : '') + '" data-da="dtab" data-tab="' + id + '">' + label + '</button>';

    root.innerHTML =
      '<div class="detail">' +
      '<div class="detail-head"><span class="detail-icon">' + instanceVisual(inst) + '</span>' +
      '<div class="detail-title"><div class="detail-chips"><span class="chip em">' + esc(loaderOf(inst).label) +
      '</span><span class="chip">MC ' + esc(inst.version) + '</span></div><h1>' + esc(inst.name) + '</h1>' +
      '<p>' + esc(instanceMeta(inst)) + ' · ' + (ready ? 'ishga tayyor' : 'birinchi o\u2018yinda yuklanadi') + '</p></div>' +
      '<button class="btn primary detail-play" data-da="play" data-id="' + esc(inst.id) + '">' +
      Icons.html(running ? 'power' : 'play') + ' ' + (running ? 'To\u2018xtatish' : 'O\u2018ynash') + '</button></div>' +

      '<div class="detail-stats">' +
      '<div class="dstat"><small>HOLAT</small><b class="' + (ready && !S.installing ? 'ok' : '') + '">' + esc(statusText) + '</b></div>' +
      '<div class="dstat"><small>OXIRGI O\u2018YIN</small><b>' + esc(inst.lastPlayed ? timeAgo(inst.lastPlayed) : 'Hech qachon') + '</b></div>' +
      '<div class="dstat"><small>O\u2018YIN VAQTI</small><b>' + esc(duration(inst.playtimeMs)) + '</b></div>' +
      '<div class="dstat-actions"><button class="btn ghost sm" data-da="settings" data-id="' + esc(inst.id) + '">' +
      Icons.html('settings') + ' Sozlamalar</button><button class="btn ghost sm" data-da="more" data-id="' + esc(inst.id) +
      '" title="Boshqarish">' + Icons.html('menu') + '</button></div></div>' +

      '<div class="detail-tabs">' + tabBtn('content', 'Kontent') + tabBtn('worlds', 'Dunyolar') +
      tabBtn('gallery', 'Galereya') + tabBtn('files', 'Fayllar') + '</div>' +
      '<div class="detail-body"><div class="detail-main" id="detailMain"></div>' +
      '<aside class="detail-news"><div class="dnews"><div class="dnews-head">' + Icons.html('bell') +
      '<b>Yangiliklar</b></div><div class="dnews-list">' + detailNews() + '</div></div>' +
      '<div class="promo-card"><div class="logo-mark"><svg viewBox="0 0 48 48"><path d="M24 3 42 13.5v21L24 45 6 34.5v-21Z"/><path d="m24 13 10 6v10l-10 6-10-6V19Z"/><path d="m24 21 4 2.5v5L24 31l-4-2.5v-5Z"/></svg></div>' +
      '<b>Arcadia panel</b><p>Statistika, topshiriqlar, claim va saylov — brauzerda.</p>' +
      '<button class="btn subtle sm" data-da="site">Saytga o\u2018tish ' + Icons.html('arrow-right') + '</button></div></aside></div></div>';

    Icons.mount(root);
    if (tab === 'content') renderContentPanel();
    else if (tab === 'worlds') loadWorlds();
    else if (tab === 'gallery') loadGallery();
    else if (tab === 'files') loadFiles();
    if (!ready) refreshInstalledFor(inst);
  }

  async function refreshInstalledFor(inst) {
    try {
      const id = inst.versionId || inst.version;
      S.installed[id] = await A.versions.isInstalled(id);
      if (S.page === 'detail' || S.page === 'content') {
        const live = qs('[data-da="play"]');
        if (live && S.instance && inst.id === S.instance.id) {
          const label = qs('.dstat b');
          if (label) { label.textContent = S.playing ? 'O\u2018ynalmoqda' : S.installed[id] ? 'Tayyor' : 'O\u2018rnatilmagan'; label.classList.toggle('ok', !!S.installed[id]); }
        }
      }
    } catch (_) { /* ignore */ }
  }

  function contentTabs() {
    const kinds = [
      ['mods', 'Modlar'],
      ['resourcepacks', 'Resource Packs'],
      ['shaderpacks', 'Shaderlar'],
      ['datapacks', 'Data Packs'],
    ];
    return kinds
      .map(
        ([id, label]) =>
          '<button class="ctab' + (S.contentKind === id ? ' active' : '') + '" data-da="ctab" data-kind="' + id + '">' +
          label + '</button>'
      )
      .join('');
  }

  function contentKindLabel(kind) {
    return ({ mods: 'mod', resourcepacks: 'resource pack', shaderpacks: 'shader', datapacks: 'data pack' })[kind] || 'fayl';
  }

  function renderContentPanel() {
    const panel = $('detailMain');
    if (!panel) return;
    const inst = currentInstance();
    panel.innerHTML =
      '<div class="panel"><div class="content-tabs">' + contentTabs() + '</div>' +
      '<div class="content-toolbar"><label class="search-field">' + Icons.html('search') +
      '<input id="contentSearch" type="text" placeholder="O\u2018rnatilganlarni qidirish" spellcheck="false"></label>' +
      '<button class="btn subtle sm" data-da="browse">' + Icons.html('plus') + ' Qo\u2018shish</button></div>' +
      '<div class="content-list" id="contentList"><div class="browse-loading"><span class="spinner"></span></div></div></div>';
    Icons.mount(panel);
    const search = $('contentSearch');
    if (search) {
      search.addEventListener('input', () => filterContentRows(search.value));
    }
    loadContentPanel();
  }

  async function loadContentPanel() {
    const inst = currentInstance();
    const box = $('contentList');
    if (!inst || !box) return;
    const kind = S.contentKind;
    const token = (S.contentToken = (S.contentToken || 0) + 1);
    try {
      const list = await A.instances.content(inst.id, kind);
      if (token !== S.contentToken || !$('contentList')) return;
      if (!list.length) {
        const fabricHint =
          kind === 'mods' && !supportsMods(inst)
            ? 'Modlar uchun Fabric, Forge, NeoForge yoki Quilt instans kerak. Yangi instans yarating.'
            : 'Hozircha ' + contentKindLabel(kind) + ' yo\u2018q. Modrinth\u2019dan bir bosishda qo\u2018shishingiz mumkin.';
        box.innerHTML =
          '<div class="empty-state"><span class="empty-ico">' + Icons.html(kind === 'mods' ? 'puzzle' : kind === 'resourcepacks' ? 'image' : kind === 'shaderpacks' ? 'sparkle' : 'database') +
          '</span><h4>' + (kind === 'mods' ? 'Modlar yo\u2018q' : 'Kontent yo\u2018q') + '</h4><p>' + esc(fabricHint) + '</p>' +
          '<button class="btn subtle sm" data-da="browse">' + Icons.html('download') + ' Modrinth\u2019dan qo\u2018shish</button></div>';
        Icons.mount(box);
        return;
      }
      box.innerHTML = list
        .map((f) => {
          const enabled = f.enabled !== false;
          const display = f.name.replace(/\.disabled$/i, '');
          return (
            '<div class="content-row" data-name="' + esc(display.toLowerCase()) + '">' +
            '<span class="ci">' + (f.meta && f.meta.icon ? '<img src="' + esc(f.meta.icon) + '" alt="">' : Icons.html(kind === 'mods' ? 'puzzle' : kind === 'resourcepacks' ? 'image' : kind === 'shaderpacks' ? 'sparkle' : 'database')) + '</span>' +
            '<span class="cname"><b>' + esc(display) + '</b><small>' + esc(kind === 'mods' ? (enabled ? 'Yoqilgan' : 'O\u2018chirilgan') : contentKindLabel(kind)) + '</small></span>' +
            '<span class="csize">' + esc(bytes(f.size)) + '</span>' +
            (kind === 'mods'
              ? '<button class="toggle-mod' + (enabled ? ' on' : '') + '" data-da="togglemod" data-name="' + esc(f.name) + '" title="' + (enabled ? 'O\u2018chirish' : 'Yoqish') + '"></button>'
              : '<button class="btn ghost sm" data-da="openfolder" data-kind="' + kind + '">' + Icons.html('folder') + '</button>') +
            '</div>'
          );
        })
        .join('');
      Icons.mount(box);
    } catch (e) {
      if (token !== S.contentToken) return;
      box.innerHTML = '<div class="empty-state"><p>' + esc(errText(e)) + '</p></div>';
    }
  }

  function filterContentRows(query) {
    const q = String(query || '').trim().toLowerCase();
    qsa('#contentList .content-row').forEach((row) => {
      row.style.display = !q || (row.dataset.name || '').includes(q) ? '' : 'none';
    });
  }

  async function loadWorlds() {
    const box = $('detailMain');
    if (!box) return;
    const inst = currentInstance();
    box.innerHTML = '<div class="panel"><div class="panel-head"><h3>Dunyolar</h3><span class="spacer"></span>' +
      '<button class="btn ghost sm" data-da="openfolder" data-kind="saves">' + Icons.html('folder') + ' Papka</button></div>' +
      '<div class="world-grid" id="worldGrid"><div class="browse-loading"><span class="spinner"></span></div></div></div>';
    Icons.mount(box);
    try {
      const list = await A.instances.content(inst.id, 'saves');
      const grid = $('worldGrid');
      if (!grid) return;
      if (!list.length) {
        grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1">' + Icons.html('map') +
          '<h4>Dunyo yo\u2018q</h4><p>Yangi dunyo o\u2018yin ichida yaratiladi.</p></div>';
        return;
      }
      grid.innerHTML = list
        .map(
          (w) =>
            '<button class="world-card" data-da="openfolder" data-kind="saves"><span class="world-thumb" data-world-icon="' + esc(w.name) + '">' +
            Icons.html('map') + '</span><b>' + esc(w.name) + '</b><small>' + esc(timeAgo(w.modified)) + '</small></button>'
        )
        .join('');
      Icons.mount(grid);
      list.forEach(async (w) => {
        if (!w.icon) return;
        const node = qs('[data-world-icon="' + w.name.replace(/"/g, '\\"') + '"]', grid);
        if (!node) return;
        const url = await A.instances.image(inst.id, 'saves/' + w.name + '/icon.png').catch(() => null);
        if (url && node.isConnected) node.innerHTML = '<img src="' + url + '" alt="">';
      });
    } catch (e) {
      if ($('worldGrid')) $('worldGrid').innerHTML = '<p class="small muted">' + esc(errText(e)) + '</p>';
    }
  }

  async function loadGallery() {
    const box = $('detailMain');
    if (!box) return;
    const inst = currentInstance();
    box.innerHTML = '<div class="panel"><div class="panel-head"><h3>Galereya</h3><span class="spacer"></span>' +
      '<button class="btn ghost sm" data-da="openfolder" data-kind="screenshots">' + Icons.html('folder') + ' Papka</button></div>' +
      '<div class="gallery-grid" id="galleryGrid"><div class="browse-loading"><span class="spinner"></span></div></div></div>';
    Icons.mount(box);
    try {
      const list = await A.instances.content(inst.id, 'screenshots');
      const grid = $('galleryGrid');
      if (!grid) return;
      if (!list.length) {
        grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1">' + Icons.html('image') +
          '<h4>Skrinshot yo\u2018q</h4><p>O\u2018yin ichida F2 bilan rasm oling.</p></div>';
        return;
      }
      grid.innerHTML = '';
      for (const shot of list.slice(0, 30)) {
        const url = await A.instances.image(inst.id, 'screenshots/' + shot.name).catch(() => null);
        if (!url || !$('galleryGrid')) continue;
        const img = document.createElement('img');
        img.className = 'shot';
        img.src = url;
        img.alt = shot.name;
        img.title = shot.name;
        img.addEventListener('click', () => openLightbox(url));
        grid.appendChild(img);
      }
    } catch (e) {
      if ($('galleryGrid')) $('galleryGrid').innerHTML = '<p class="small muted">' + esc(errText(e)) + '</p>';
    }
  }

  async function loadFiles() {
    const box = $('detailMain');
    if (!box) return;
    const inst = currentInstance();
    box.innerHTML = '<div class="panel"><div class="panel-head"><h3>Fayllar</h3><span class="spacer"></span>' +
      '<button class="btn ghost sm" data-da="openfolder" data-kind="instance">' + Icons.html('folder') + ' Papka</button></div>' +
      '<div id="fileList"><div class="browse-loading"><span class="spinner"></span></div></div></div>';
    Icons.mount(box);
    try {
      const list = await A.instances.files(inst.id);
      const root = $('fileList');
      if (!root) return;
      if (!list.length) {
        root.innerHTML = '<div class="empty-state"><p>Fayllar topilmadi.</p></div>';
        return;
      }
      root.innerHTML = list
        .map(
          (f) =>
            '<div class="file-row">' + Icons.html(f.dir ? 'folder' : 'save') + '<b>' + esc(f.name) + '</b>' +
            (f.dir ? '<small>papka</small>' : '<small>' + esc(bytes(f.size)) + '</small>') + '</div>'
        )
        .join('');
      Icons.mount(root);
    } catch (e) {
      if ($('fileList')) $('fileList').innerHTML = '<p class="small muted">' + esc(errText(e)) + '</p>';
    }
  }

  function openLightbox(url) {
    const box = document.createElement('div');
    box.className = 'lightbox';
    box.innerHTML = '<img src="' + url + '" alt="">';
    box.addEventListener('click', () => box.remove());
    document.body.appendChild(box);
  }

  function openDetail(id, tab) {
    if (id) setInstance(id);
    S.detailTab = tab || 'content';
    if (S.detailTab === 'content') S.contentKind = S.contentKind || 'mods';
    route('content');
  }

  /* ============================================================ instance settings */

  function openInstanceSettings(id) {
    const inst = S.instances.find((i) => i.id === id);
    if (!inst) return;
    const mem = inst.memoryMb || (S.config && S.config.memoryMb) || 4096;
    openModal(
      modalHead('Instans sozlamalari', inst.name) +
        '<div class="modal-body"><div class="form-grid">' +
        '<label>Nomi<input type="text" id="isName" maxlength="40" value="' + esc(inst.name) + '"></label>' +
        '<div class="row"><label>Xotira (MB)<input type="number" id="isMem" min="1024" max="16384" step="512" value="' + esc(mem) + '"></label>' +
        '<label>Java (bo\u2018sh = umumiy)<div class="input-row"><input type="text" id="isJava" value="' + esc(inst.javaPath || '') + '"><button class="btn ghost sm" id="isJavaPick">' + Icons.html('folder') + '</button></div></label></div>' +
        '<div class="row"><label>Oyna kengligi<input type="number" id="isWidth" min="640" max="3840" value="' + esc(inst.width || 1280) + '"></label>' +
        '<label>Oyna balandligi<input type="number" id="isHeight" min="360" max="2160" value="' + esc(inst.height || 720) + '"></label></div>' +
        '<label>Qo\u2018shimcha JVM argumentlar<textarea id="isJvm" rows="2" style="height:auto;padding:8px 10px">' + esc(inst.jvmArgs || '') + '</textarea></label>' +
        '</div></div>' +
        '<div class="modal-foot"><span class="modal-note">' + esc(loaderOf(inst).label) + ' · MC ' + esc(inst.version) + '</span>' +
        '<span class="spacer"></span><button class="btn ghost" data-close="1">Bekor</button>' +
        '<button class="btn primary" id="isSave">' + Icons.html('save') + ' Saqlash</button></div>'
    );
    $('isJavaPick').addEventListener('click', async () => {
      const p = await A.java.pick();
      if (p) $('isJava').value = p;
    });
    $('isSave').addEventListener('click', async () => {
      try {
        const patch = {
          name: $('isName').value.trim() || inst.name,
          memoryMb: Number($('isMem').value) || null,
          javaPath: $('isJava').value.trim(),
          width: Number($('isWidth').value) || 1280,
          height: Number($('isHeight').value) || 720,
          jvmArgs: $('isJvm').value,
        };
        await A.instances.update(id, patch);
        await reloadInstances();
        renderRailInstances();
        renderHomeInstance();
        closeModal();
        renderDetail();
        toast('Instans sozlamalari saqlandi', 'ok');
      } catch (e) { toast(errText(e), 'err'); }
    });
  }

  /* ============================================================ new instance */

  async function remoteVersions(force) {
    if (S.remote && !force) return S.remote;
    try {
      const data = await A.versions.remote(false);
      const list = (data.versions || []).filter((v) => v.id);
      S.remote = {
        latest: (data.latest && data.latest.id) || (list[0] && list[0].id) || '26.3',
        versions: list,
      };
    } catch (_) {
      S.remote = { latest: '26.3', versions: [{ id: '26.3', type: 'release', releaseTime: 0 }] };
    }
    return S.remote;
  }

  async function openNewInstance(preferredLoader) {
    const remote = await remoteVersions();
    const N = {
      name: 'Yangi instans',
      version: remote.latest,
      snapshots: false,
      loader: preferredLoader || 'vanilla',
      iconData: null,
      memoryMb: (S.config && S.config.memoryMb) || 4096,
      javaPath: '',
      width: 1280,
      height: 720,
      jvmArgs: '',
      launch: true,
    };
    S.newInst = N;
    const loaderButtons = Object.keys(LOADERS)
      .map((id) => {
        const l = LOADERS[id];
        const disabled = false;
        return (
          '<button class="loader-btn' + (N.loader === id ? ' active' : '') + (disabled ? ' disabled' : '') +
          '" data-loader="' + id + '"' + (disabled ? ' title="26.3 uchun hozircha mavjud emas"' : '') + '>' +
          '<i style="color:' + l.color + '">' + (id === 'vanilla' ? 'V' : id === 'neoforge' ? 'N' : id.charAt(0).toUpperCase()) + '</i>' +
          l.label + '</button>'
        );
      })
      .join('');

    openModal(
      modalHead('Yangi instans', 'Minecraft 26.3 · alohida modlar va dunyolar', 'Bekor qilish') +
        '<div class="modal-body"><div class="new-instance">' +
        '<div class="ni-preview"><button class="ni-icon" id="niIcon">' + blockSvg('grass') + '</button>' +
        '<button class="btn ghost sm" id="niPick">' + Icons.html('image') + ' Rasm tanlash</button>' +
        '<small>PNG/JPG · kvadrat rasm yaxshi ko\u2018rinadi</small></div>' +
        '<div class="form-grid">' +
        '<label>Instans nomi<input type="text" id="niName" maxlength="40" value="' + esc(N.name) + '" placeholder="Masalan: Survival"></label>' +
        '<label>Minecraft versiyasi<select id="niVersion"></select></label>' +
        '<label class="check-row" style="margin-top:-4px"><input type="checkbox" id="niSnap"> Snapshot versiyalarini ko\u2018rsatish</label>' +
        '<div><span style="color:var(--muted);font-size:11px">Mod loader</span><div class="loader-row" id="niLoaders">' + loaderButtons + '</div></div>' +
        '<button class="adv-toggle" id="niAdvBtn">Kengaytirilgan sozlamalar ' + Icons.html('chevron-down') + '</button>' +
        '<div class="adv-body" id="niAdvBody">' +
        '<div class="row"><label>Xotira (MB)<input type="number" id="niMem" min="1024" max="16384" step="512" value="' + esc(N.memoryMb) + '"></label>' +
        '<label>Java (bo\u2018sh = umumiy)<div class="input-row"><input type="text" id="niJava" placeholder="Avtomatik"><button class="btn ghost sm" id="niJavaPick">' + Icons.html('folder') + '</button></div></label></div>' +
        '<div class="row"><label>Oyna kengligi<input type="number" id="niWidth" min="640" max="3840" value="1280"></label>' +
        '<label>Oyna balandligi<input type="number" id="niHeight" min="360" max="2160" value="720"></label></div>' +
        '<label>Qo\u2018shimcha JVM argumentlar<input type="text" id="niJvm" placeholder="masalan: -XX:+UseG1GC"></label>' +
        '</div>' +
        '<div id="niError" class="form-error hidden"></div>' +
        '<div class="progress-box" id="niProgress"><div class="progress-top"><span id="niProgressText">Tayyorlanmoqda…</span><b id="niProgressPct">0%</b></div><div class="progress-bar"><i id="niProgressBar"></i></div></div>' +
        '</div></div></div>' +
        '<div class="modal-foot"><label class="check-row"><input type="checkbox" id="niLaunch" checked> O\u2018rnatgach ishga tushirish</label>' +
        '<span class="spacer"></span><button class="btn ghost" data-close="1">Bekor</button>' +
        '<button class="btn primary" id="niCreate">' + Icons.html('plus') + ' Yaratish</button></div>'
    );

    const select = $('niVersion');
    const fillVersions = () => {
      const list = remote.versions.filter((v) => N.snapshots || v.type !== 'snapshot');
      const final = list.length ? list : remote.versions;
      select.innerHTML = final
        .map((v) => '<option value="' + esc(v.id) + '"' + (v.id === N.version ? ' selected' : '') + '>' + esc(v.id) + (v.type === 'snapshot' ? ' · snapshot' : '') + '</option>')
        .join('');
      if (!final.some((v) => v.id === N.version) && final[0]) N.version = final[0].id;
      select.value = N.version;
    };
    fillVersions();
    select.addEventListener('change', () => { N.version = select.value; });

    $('niSnap').addEventListener('change', (e) => {
      N.snapshots = e.target.checked;
      fillVersions();
    });

    $('niName').addEventListener('input', (e) => { N.name = e.target.value; });

    $('niLoaders').addEventListener('click', (e) => {
      const b = e.target.closest('[data-loader]');
      if (!b) return;
      if (b.classList.contains('disabled')) {
        toast(b.dataset.loader.charAt(0).toUpperCase() + b.dataset.loader.slice(1) + ' 26.3 uchun hozircha mavjud emas. Vanilla, Fabric yoki Forge tanlang.', 'info');
        return;
      }
      N.loader = b.dataset.loader;
      qsa('.loader-btn', $('niLoaders')).forEach((x) => x.classList.toggle('active', x === b));
    });

    $('niPick').addEventListener('click', async () => {
      try {
        const img = await A.dialog.image();
        if (!img) return;
        N.iconData = img.dataUrl;
        $('niIcon').innerHTML = '<img src="' + img.dataUrl + '" alt="">';
      } catch (e) { toast(errText(e), 'err'); }
    });
    $('niIcon').addEventListener('click', () => $('niPick').click());

    $('niAdvBtn').addEventListener('click', () => {
      $('niAdvBtn').classList.toggle('open');
      $('niAdvBody').classList.toggle('open');
    });
    $('niJavaPick').addEventListener('click', async () => {
      const p = await A.java.pick();
      if (p) $('niJava').value = p;
    });
    $('niLaunch').addEventListener('change', (e) => { N.launch = e.target.checked; });

    $('niCreate').addEventListener('click', async () => {
      const btn = $('niCreate');
      if (S.installing) return;
      N.name = $('niName').value.trim() || 'Yangi instans';
      N.version = $('niVersion').value || N.version;
      N.memoryMb = Math.max(1024, Math.min(16384, Number($('niMem').value) || 4096));
      N.javaPath = $('niJava').value.trim();
      N.width = Math.max(640, Math.min(3840, Number($('niWidth').value) || 1280));
      N.height = Math.max(360, Math.min(2160, Number($('niHeight').value) || 720));
      N.jvmArgs = $('niJvm').value.trim();
      N.launch = $('niLaunch').checked;

      S.installing = true;
      btn.disabled = true;
      btn.innerHTML = Icons.html('refresh') + ' Yaratilmoqda…';
      $('niError').classList.add('hidden');
      $('niProgress').classList.add('show');
      const onP = A.install.onProgress((p) => updateProgressBox(p, 'ni'));
      try {
        if (!(await A.versions.isInstalled(N.version))) {
          setProgress('ni', 'Versiya yuklanmoqda…', 4);
          await A.install.start(N.version);
        }
        let versionId = N.version;
        let loaderVersion = null;
        if (N.loader !== 'vanilla') {
          setProgress('ni', loaderOf(N).label + ' loader o\u2018rnatilmoqda…', 55);
          const res = await A.loader.install(N.loader, N.version);
          versionId = res.versionId;
          loaderVersion = res.loaderVersion;
        }
        setProgress('ni', 'Instans yaratilmoqda…', 96);
        const item = await A.instances.create({
          name: N.name,
          version: N.version,
          versionId,
          loader: N.loader,
          loaderVersion,
          memoryMb: N.memoryMb,
          javaPath: N.javaPath,
          width: N.width,
          height: N.height,
          jvmArgs: N.jvmArgs,
          iconData: N.iconData,
        });
        setProgress('ni', 'Tayyor', 100);
        await reloadInstances();
        S.installing = false;
        S.instance = S.instances.find((i) => i.id === item.id) || S.instance;
        closeModal();
        renderRailInstances();
        toast('“' + item.name + '” yaratildi', 'ok');
        if (N.launch) setTimeout(() => play(item.id), 80);
        else openDetail(item.id, 'content');
      } catch (e) {
        $('niError').textContent = errText(e);
        $('niError').classList.remove('hidden');
        $('niProgress').classList.remove('show');
        toast(errText(e), 'err');
      } finally {
        onP();
        S.installing = false;
        btn.disabled = false;
        btn.innerHTML = Icons.html('plus') + ' Yaratish';
      }
    });
  }

  function setProgress(prefix, text, percent) {
    const t = $(prefix + 'ProgressText');
    const pct = $(prefix + 'ProgressPct');
    const bar = $(prefix + 'ProgressBar');
    if (t) t.textContent = text;
    if (pct) pct.textContent = Math.round(percent || 0) + '%';
    if (bar) bar.style.width = Math.max(2, Math.min(100, percent || 0)) + '%';
  }

  const STAGE_TEXT = {
    version: 'Versiya fayllari yuklanmoqda…',
    libraries: 'Kutubxonalar yuklanmoqda…',
    assets: 'O\u2018yin assetlari yuklanmoqda…',
    loader: 'Fabric loader o\u2018rnatilmoqda…',
    done: 'Tayyor',
  };

  function updateProgressBox(p, prefix) {
    const stage = (p && p.stage) || 'version';
    const percent = Number(p && p.percent) || (stage === 'done' ? 100 : 5);
    let text = STAGE_TEXT[stage] || 'Yuklanmoqda…';
    if (stage === 'assets' && p && p.total) text += ' (' + (p.progress || 0) + '/' + p.total + ')';
    setProgress(prefix, text, percent);
  }

  function openInstallModal(inst) {
    openModal(
      modalHead('Instans tayyorlanmoqda', inst.name + ' · MC ' + inst.version) +
        '<div class="modal-body"><p class="muted" style="margin:0 0 12px;font-size:12px;line-height:1.6">Birinchi o\u2018yin uchun fayllar yuklanadi. Keyingi safar darhol boshlanadi.</p>' +
        '<div class="progress-box show"><div class="progress-top"><span id="imProgressText">Tayyorlanmoqda…</span><b id="imProgressPct">0%</b></div>' +
        '<div class="progress-bar"><i id="imProgressBar"></i></div></div></div>' +
        '<div class="modal-foot"><span class="modal-note">Internet uzilsa qayta urinib ko\u2018ring.</span><span class="spacer"></span>' +
        '<button class="btn ghost" id="imCancel">Bekor qilish</button></div>'
    );
    setProgress('im', 'Tayyorlanmoqda…', 3);
    const cancel = $('imCancel');
    if (cancel) cancel.addEventListener('click', () => { A.install.cancel(); closeModal(); });
    return {
      update: (p) => updateProgressBox(p, 'im'),
      done: () => setProgress('im', 'Tayyor', 100),
    };
  }

  async function ensureInstanceReady(inst, onProgress) {
    let current = inst;
    if (!(await A.versions.isInstalled(current.version))) {
      await A.install.start(current.version);
    }
    let versionId = current.versionId || current.version;
    let loaderVersion = current.loaderVersion || null;
    if (current.loader && current.loader !== 'vanilla') {
      const loaderReady = versionId && versionId !== current.version && (await A.versions.isInstalled(versionId));
      if (!loaderReady) {
        const res = await A.loader.install(current.loader, current.version);
        versionId = res.versionId;
        loaderVersion = res.loaderVersion;
        current = await A.instances.update(current.id, { versionId, loaderVersion });
        S.instances = S.instances.map((i) => (i.id === current.id ? Object.assign({}, i, current) : i));
        S.instance = S.instances.find((i) => i.id === current.id) || S.instance;
      }
    }
    await refreshInstalled();
    return current;
  }

  async function play(instanceId) {
    if (S.playing) {
      A.game.stop();
      toast('O\u2018yin to\u2018xtatilmoqda…', 'info');
      return;
    }
    if (S.starting || S.installing) return;
    if (S.defaultProvisioning) {
      toast('Arcadia to‘plami hali tayyorlanmoqda. Bir oz kuting.', 'info');
      return;
    }
    let inst = instanceId ? S.instances.find((i) => i.id === instanceId) : currentInstance();
    if (!inst) { toast('Avval instans yarating.', 'err'); return; }
    setInstance(inst.id);
    S.starting = true;
    const btn = instanceId ? qs('[data-da="play"][data-id="' + inst.id + '"]') : $('homePlay');
    if (btn) btn.disabled = true;
    let installUi = null;
    try {
      if (!isInstalled(inst) || (inst.loader !== 'vanilla' && (!inst.versionId || inst.versionId === inst.version))) {
        installUi = openInstallModal(inst);
        const un = A.install.onProgress((p) => installUi.update(p));
        try { inst = await ensureInstanceReady(inst); }
        finally { un(); }
        installUi.done();
        setTimeout(() => closeModal(), 550);
      }
      S.launchInstanceId = inst.id;
      await A.game.launch(inst.id);
      S.playing = true;
      renderGameUI();
      toast('O\u2018yin ishga tushdi' + (inst.loader !== 'vanilla' ? ' · ' + loaderOf(inst).label : ''), 'ok');
    } catch (e) {
      if (installUi) closeModal();
      toast(errText(e), 'err', 'O\u2018yin ishga tushmadi');
    } finally {
      S.starting = false;
      if (btn) btn.disabled = false;
      renderGameUI();
      renderHomePlay();
    }
  }

  /* ============================================================ content browser */

  function contentBrowserType(kind) {
    return kind === 'mods' ? 'mod' : kind === 'resourcepacks' ? 'resourcepack' : kind === 'shaderpacks' ? 'shader' : 'datapack';
  }

  function openContentBrowser(kind) {
    const inst = currentInstance();
    if (!inst) return;
    const type = contentBrowserType(kind || 'mods');
    S.browse = {
      kind: kind || 'mods',
      type,
      query: '',
      token: 0,
      results: [],
      offset: 0,
      total: 0,
      pageSize: 24,
    };
    const loaderBlocked = type === 'mod' && !supportsMods(inst);
    openModal(
      modalHead('Modrinth', 'Bir bosishda o\u2018rnatish · ' + inst.name, 'Yopish') +
        '<div class="browse-search"><label class="search-field">' + Icons.html('search') +
        '<input id="browseSearch" type="text" placeholder="Mod, resource pack, shader yoki datapack qidirish" spellcheck="false" autofocus></label>' +
        '<button class="btn subtle" id="browseGo">' + Icons.html('search') + ' Qidirish</button></div>' +
        '<div class="browse-chips" id="browseChips">' +
        [['mods', 'Modlar', 'mod'], ['resourcepacks', 'Resource Packs', 'resourcepack'], ['shaderpacks', 'Shaderlar', 'shader'], ['datapacks', 'Data Packs', 'datapack']]
          .map(([k, label]) => '<button class="browse-chip' + (k === S.browse.kind ? ' active' : '') + '" data-btype="' + k + '">' + label + '</button>')
          .join('') +
        '</div>' +
        (loaderBlocked
          ? '<div class="settings-note" style="margin:10px 18px 0"><span data-icon="info"></span><span>Modlar uchun mod loaderli instans kerak. <button class="link-sm" data-newfabric="1">Fabric instans yaratish ' + Icons.html('arrow-right') + '</button></span></div>'
          : '') +
        '<div class="browse-list" id="browseList"><div class="browse-loading"><span class="spinner"></span></div></div>' +
        '<div class="browse-pager" id="browsePager"></div>' +
        '<div class="modal-foot"><span class="modal-note">Manba: modrinth.com · 26.3 uchun mos versiyalar</span><span class="spacer"></span>' +
        '<button class="btn ghost" data-close="1">Yopish</button></div>',
      { wide: true }
    );

    const fabricBtn = qs('[data-newfabric]', $('modalBox'));
    if (fabricBtn) {
      fabricBtn.addEventListener('click', () => {
        closeModal();
        openNewInstance('fabric');
      });
    }
    const input = $('browseSearch');
    const run = () => {
      S.browse.query = input.value.trim();
      S.browse.offset = 0;
      searchBrowse();
    };
    $('browseGo').addEventListener('click', run);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
    let timer = null;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(run, 420);
    });
    $('browseChips').addEventListener('click', (e) => {
      const b = e.target.closest('[data-btype]');
      if (!b) return;
      S.browse.kind = b.dataset.btype;
      S.browse.type = contentBrowserType(b.dataset.btype);
      S.browse.offset = 0;
      qsa('[data-btype]', $('browseChips')).forEach((x) => x.classList.toggle('active', x === b));
      searchBrowse();
    });
    $('browsePager').addEventListener('click', (e) => {
      const b = e.target.closest('[data-bpage]');
      if (!b || !S.browse) return;
      const step = Number(b.dataset.bpage) || 0;
      const next = S.browse.offset + step * S.browse.pageSize;
      if (next < 0 || next >= S.browse.total) return;
      S.browse.offset = next;
      searchBrowse();
    });
    $('browseList').addEventListener('click', async (e) => {
      const fab = e.target.closest('[data-newfabric]');
      if (fab) { closeModal(); openNewInstance('fabric'); return; }
      const btn = e.target.closest('[data-install]');
      if (!btn) return;
      if (S.browse.type === 'mod' && !supportsMods(inst)) {
        toast('Modlar uchun mod loaderli instans kerak.', 'info');
        return;
      }
      btn.disabled = true;
      const old = btn.innerHTML;
      btn.innerHTML = Icons.html('refresh') + ' Yuklanmoqda…';
      try {
        const file = await A.modrinth.install({
          projectId: btn.dataset.install,
          title: btn.dataset.title,
          icon: btn.dataset.icon || null,
          type: S.browse.type,
          instanceId: inst.id,
        });
        btn.innerHTML = Icons.html('check') + ' O\u2018rnatildi';
        toast(file.title + ' o\u2018rnatildi', 'ok');
        if (S.detailTab === 'content') loadContentPanel();
      } catch (err) {
        btn.disabled = false;
        btn.innerHTML = old;
        toast(errText(err), 'err');
      }
    });
    searchBrowse();
  }

  function browseChipLabel(kind) {
    return ({ mods: 'Modlar', resourcepacks: 'Resource Packs', shaderpacks: 'Shaderlar', datapacks: 'Data Packs' })[kind] || 'Kontent';
  }

  async function searchBrowse() {
    const b = S.browse;
    if (!b) return;
    const list = $('browseList');
    if (!list) return;
    const token = ++b.token;
    const inst = currentInstance();
    list.innerHTML = '<div class="browse-loading"><span class="spinner"></span></div>';
    const pager = $('browsePager');
    if (pager) pager.innerHTML = '';
    try {
      const res = await A.modrinth.search({
        query: b.query,
        type: b.type,
        loader: inst ? inst.loader : 'vanilla',
        gameVersion: inst ? inst.version : '26.3',
        limit: b.pageSize,
        offset: b.offset,
        sort: b.query ? 'relevance' : 'downloads',
      });
      if (token !== b.token || !$('browseList')) return;
      b.results = res.hits;
      b.total = Number(res.total) || 0;
      if (!res.hits.length) {
        list.innerHTML = '<div class="browse-empty">Hech narsa topilmadi. Boshqa nom bilan qidirib ko\u2018ring.</div>';
        renderBrowsePager();
        return;
      }
      const blocked = b.type === 'mod' && !supportsMods(inst);
      list.innerHTML = res.hits
        .map(
          (p) =>
            '<div class="browse-row"><span class="browse-ico">' +
            (p.icon ? '<img src="' + esc(p.icon) + '" alt="">' : Icons.html('puzzle')) +
            '</span><div class="browse-info"><b>' + esc(p.title) + '</b><p>' + esc(p.description) + '</p>' +
            '<small>' + esc(downloads(p.downloads)) + ' yuklab olinish · ' + esc(p.author || 'Modrinth') + '</small></div>' +
            '<button class="btn subtle sm" data-install="' + esc(p.id) + '" data-title="' + esc(p.title) + '" data-icon="' + esc(p.icon || '') + '"' +
            (blocked ? ' disabled title="Modlar uchun mod loaderli instans kerak"' : '') + '>' +
            Icons.html(blocked ? 'info' : 'download') + ' ' + (blocked ? 'Loader kerak' : 'O\u2018rnatish') + '</button></div>'
        )
        .join('');
      Icons.mount(list);
      renderBrowsePager();
    } catch (e) {
      if (token !== b.token) return;
      list.innerHTML = '<div class="browse-empty">' + esc(errText(e)) + '</div>';
      renderBrowsePager();
    }
  }

  function renderBrowsePager() {
    const box = $('browsePager');
    const b = S.browse;
    if (!box || !b) return;
    const total = Number(b.total) || 0;
    if (!total) {
      box.innerHTML = '';
      return;
    }
    const start = b.offset + 1;
    const end = Math.min(b.offset + b.results.length, total);
    const page = Math.floor(b.offset / b.pageSize) + 1;
    const pages = Math.max(1, Math.ceil(total / b.pageSize));
    const prev = b.offset > 0;
    const next = b.offset + b.pageSize < total;
    box.innerHTML =
      '<span class="pager-info">' + start + '–' + end + ' / ' + total + ' ta natija</span>' +
      '<span class="pager-page">' + page + ' / ' + pages + '</span>' +
      '<span class="spacer"></span>' +
      '<button class="btn ghost sm" data-bpage="-1"' + (prev ? '' : ' disabled') + '>' +
      Icons.html('arrow-left') + ' Oldingisi</button>' +
      '<button class="btn subtle sm" data-bpage="1"' + (next ? '' : ' disabled') + '>' +
      'Keyingisi ' + Icons.html('arrow-right') + '</button>';
    Icons.mount(box);
  }

  /* ============================================================ skins */

  function mountSkinViewer() {
    if (!window.SkinViewer || !$('skinStage')) return;
    const url = S.skin || 'assets/img/steve-skin.png';
    S.viewer = window.SkinViewer.mount($('skinStage'), { skin: url, unit: 7.2, autoRotate: true });
  }

  async function uploadSkin() {
    try {
      const file = await A.dialog.skin();
      if (!file) return;
      const result = await A.skin.upload(file);
      S.account = result.account;
      S.avatar = result.avatar;
      S.skin = result.skin;
      renderAccount();
      if (S.viewer) S.viewer.setSkin(S.skin);
      else mountSkinViewer();
      toast('Skin yangilandi va serverga yuborildi', 'ok');
    } catch (e) { toast(errText(e), 'err'); }
  }

  async function resetSkin() {
    try {
      const result = await A.skin.reset();
      S.account = result.account;
      S.avatar = result.avatar;
      S.skin = result.skin;
      renderAccount();
      if (S.viewer) S.viewer.setSkin(S.skin);
      else mountSkinViewer();
      toast('Standart skin qaytarildi', 'ok');
    } catch (e) { toast(errText(e), 'err'); }
  }

  /* ============================================================ updates */

  let lastUpdateNotice = '';

  function updateText(st) {
    const status = (st && st.status) || 'idle';
    if (status === 'dev') return 'Manba rejimi (avto-yangilanish o\u2018chirilgan)';
    if (status === 'checking') return 'Tekshirilmoqda\u2026';
    if (status === 'downloading') return 'Yuklanmoqda ' + Math.round(Number(st.progress) || 0) + '%';
    if (status === 'ready') return 'v' + (st.available || '?') + ' tayyor';
    if (status === 'current') return 'Eng so\u2018nggi versiya';
    if (status === 'installing') return 'O\u2018rnatilmoqda\u2026';
    if (status === 'error') return 'Xato';
    return 'Tekshirilmagan';
  }

  function renderUpdate() {
    const st = S.update || {};
    const status = st.status || 'idle';
    if ($('updateStatus')) {
      $('updateStatus').textContent = updateText(st);
      $('updateStatus').title = st.error || '';
    }
    const bar = $('updateBar');
    const progress = $('updateProgress');
    if (bar && progress) {
      const show = status === 'downloading' || status === 'ready' || status === 'installing';
      progress.classList.toggle('hidden', !show);
      bar.style.width = Math.max(0, Math.min(100, Number(st.progress) || (status === 'ready' || status === 'installing' ? 100 : 0))) + '%';
    }
    if ($('checkUpdateBtn')) {
      $('checkUpdateBtn').disabled = status === 'checking' || status === 'downloading' || status === 'installing';
    }
    if ($('installUpdateBtn')) {
      $('installUpdateBtn').classList.toggle('hidden', status !== 'ready');
    }
  }

  function bindUpdates() {
    if (!A.updates) return;
    A.updates.onEvent((st) => {
      S.update = st;
      renderUpdate();
      if (st.status === 'ready' && st.available && lastUpdateNotice !== st.available) {
        lastUpdateNotice = st.available;
        toast('Yangi versiya tayyor: v' + st.available + '. Yangilash uchun bosing.', 'ok');
      }
      if (st.status === 'error' && st.manual && lastUpdateNotice !== st.error) {
        lastUpdateNotice = st.error;
        toast('Yangilanishni tekshirib bo\u2018lmadi: ' + st.error, 'err');
      }
    });
    A.updates.state().then((st) => {
      S.update = st;
      renderUpdate();
    }).catch(() => {});
    if ($('checkUpdateBtn')) {
      $('checkUpdateBtn').addEventListener('click', async () => {
        try {
          S.update = await A.updates.check();
          renderUpdate();
        } catch (e) {
          toast(errText(e), 'err');
        }
      });
    }
    if ($('installUpdateBtn')) {
      $('installUpdateBtn').addEventListener('click', async () => {
        if (S.update && S.update.status === 'ready') {
          try {
            await A.updates.install();
            toast('Launcher yangilanmoqda\u2026', 'info');
          } catch (e) {
            toast(errText(e), 'err');
          }
        }
      });
    }
    if ($('openSourceBtn')) {
      $('openSourceBtn').addEventListener('click', () => openExternal('https://github.com/ArcadiaUZ/ArcadiaSMP-Launcher'));
    }
  }

  /* ============================================================ settings */

  function fillSettings() {
    const c = S.config || {};
    if ($('memRange')) {
      $('memRange').value = c.memoryMb || 4096;
      $('memValue').textContent = ((c.memoryMb || 4096) / 1024).toFixed((c.memoryMb || 4096) % 1024 ? 1 : 0) + ' GB';
    }
    if ($('javaPath')) $('javaPath').value = c.javaPath || '';
    if ($('gameDir')) $('gameDir').value = c.gameDir || '';
    if ($('baseUrl')) $('baseUrl').value = c.baseUrl || '';
    if ($('serverHost')) $('serverHost').value = c.serverHost || '';
    if ($('serverPort')) $('serverPort').value = c.serverPort || 25565;
    if ($('autoJoin')) $('autoJoin').checked = c.autoJoin !== false;
    if ($('aboutVersion')) $('aboutVersion').textContent = (S.info && S.info.version) || '0.2.4';
    fillHome();
    checkJava();
  }

  async function checkJava() {
    if (!$('javaVersion')) return;
    const path = $('javaPath').value;
    try {
      const info = await A.java.detect(path);
      $('javaPillDot').className = 'dot ' + (info.ok ? '' : 'off');
      $('javaVersion').textContent = info.ok ? (info.version || 'Java tayyor') : (info.error || 'Java topilmadi');
    } catch (_) {
      $('javaPillDot').className = 'dot off';
      $('javaVersion').textContent = 'Java topilmadi';
    }
  }

  async function saveSettings() {
    try {
      S.config = await A.config.save({
        memoryMb: Number($('memRange').value),
        javaPath: $('javaPath').value.trim(),
        gameDir: $('gameDir').value.trim(),
        baseUrl: $('baseUrl').value.trim(),
        serverHost: $('serverHost').value.trim(),
        serverPort: Number($('serverPort').value),
        autoJoin: $('autoJoin').checked,
      });
      fillSettings();
      refreshStatus();
      toast('Sozlamalar saqlandi', 'ok');
    } catch (e) { toast(errText(e), 'err'); }
  }

  /* ============================================================ home actions */

  function instancePicker() {
    openModal(
      modalHead('Instans tanlash', 'Qaysi profil bilan o\u2018ynaysiz?') +
        '<div class="modal-body" style="display:grid;gap:7px">' +
        S.instances
          .map(
            (inst) =>
              '<button class="content-row" style="border:1px solid var(--line);border-radius:11px;text-align:left" data-pick="' + esc(inst.id) + '">' +
              '<span class="ci">' + instanceVisual(inst) + '</span><span class="cname"><b>' + esc(inst.name) + '</b><small>' +
              esc(instanceMeta(inst)) + '</small></span>' +
              (S.instance && inst.id === S.instance.id ? '<span class="chip em">Tanlangan</span>' : '<span class="chip">Tanlash</span>') +
              '</button>'
          )
          .join('') +
        '</div>'
    );
    qsa('[data-pick]', $('modalBox')).forEach((b) =>
      b.addEventListener('click', () => {
        setInstance(b.dataset.pick);
        closeModal();
        renderHome();
      })
    );
  }

  function handleNews(id) {
    if (id === 'modrinth') { openDetail(currentInstance() ? currentInstance().id : null, 'content'); return; }
    const item = NEWS.find((n) => n.id === id);
    if (item && item.url) openExternal(base() + item.url);
  }

  /* ============================================================ bind */

  function bindWindow() {
    qsa('[data-win]').forEach((b) =>
      b.addEventListener('click', () => {
        const act = b.dataset.win;
        if (act === 'minimize') A.win.minimize();
        else if (act === 'maximize') A.win.maximize();
        else A.win.close();
      })
    );
  }

  function bindCommon() {
    bindWindow();
    bindLogin();

    qsa('.rail [data-page]').forEach((b) =>
      b.addEventListener('click', () => {
        if (b.dataset.page === 'content') S.detailTab = 'content';
        route(b.dataset.page);
      })
    );
    $('railAdd').addEventListener('click', () => openNewInstance());
    $('railAccount').addEventListener('click', accountModal);
    $('railLogout').addEventListener('click', () => {
      closeModal();
      S.account = null;
      S.avatar = null;
      S.skin = null;
      A.auth.logout().catch(() => {});
      showLogin();
    });
    $('railInstances').addEventListener('click', (e) => {
      const b = e.target.closest('[data-inst]');
      if (b) openDetail(b.dataset.inst, 'content');
    });

    $('backBtn').addEventListener('click', () => route('instances'));
    $('gameChip').addEventListener('click', () => {
      A.game.stop();
      toast('O\u2018yin to\u2018xtatilmoqda…', 'info');
    });

    $('homePlay').addEventListener('click', () => play());
    $('homeJoin').addEventListener('click', () => play());
    $('homeSite').addEventListener('click', () => openExternal(base()));
    $('homeIp').addEventListener('click', async () => {
      await copyText(serverAddress());
      toast('Server IP nusxalandi', 'ok');
    });
    $('homeInstPick').addEventListener('click', instancePicker);
    $('homeRules').addEventListener('click', () => route('servers'));
    $('homeLibrary').addEventListener('click', () => route('instances'));
    $('homeSettings').addEventListener('click', () => route('settings'));

    $('newInstanceBtn').addEventListener('click', () => openNewInstance());
    $('instanceGrid').addEventListener('click', (e) => {
      const menu = e.target.closest('[data-menu]');
      if (menu) { e.stopPropagation(); instanceMenu(menu.dataset.menu); return; }
      const playBtn = e.target.closest('[data-play]');
      if (playBtn) { e.stopPropagation(); play(playBtn.dataset.play); return; }
      const card = e.target.closest('[data-open]');
      if (card) openDetail(card.dataset.open, 'content');
    });

    $('detailRoot').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-da]');
      if (!b) return;
      const act = b.dataset.da;
      const inst = currentInstance();
      if (!inst) return;
      if (act === 'dtab') {
        S.detailTab = b.dataset.tab;
        renderDetail();
      } else if (act === 'ctab') {
        S.contentKind = b.dataset.kind || 'mods';
        renderDetail();
      } else if (act === 'browse') {
        openContentBrowser(S.contentKind);
      } else if (act === 'play') {
        play(inst.id);
      } else if (act === 'settings') {
        openInstanceSettings(inst.id);
      } else if (act === 'more') {
        instanceMenu(inst.id);
      } else if (act === 'togglemod') {
        try {
          await A.instances.toggleMod(inst.id, b.dataset.name);
          loadContentPanel();
        } catch (err) { toast(errText(err), 'err'); }
      } else if (act === 'openfolder') {
        const r = await A.folder.open(b.dataset.kind || 'instance', inst.id);
        if (!r.ok) toast(r.error || 'Papka ochilmadi', 'err');
      } else if (act === 'site') {
        openExternal(base() + '/dashboard.html');
      }
    });

    document.addEventListener('click', (e) => {
      const n = e.target.closest('[data-news]');
      if (n) handleNews(n.dataset.news);
    });

    $('refreshStatusBtn').addEventListener('click', refreshStatus);
    $('copyIp2').addEventListener('click', async () => {
      await copyText(serverAddress());
      toast('Server IP nusxalandi', 'ok');
    });
    $('joinBtn').addEventListener('click', () => play());
    $('openSite').addEventListener('click', () => openExternal(base()));

    $('uploadSkinBtn').addEventListener('click', uploadSkin);
    $('resetSkinBtn').addEventListener('click', resetSkin);

    $('memRange').addEventListener('input', () => {
      const v = Number($('memRange').value);
      $('memValue').textContent = (v / 1024).toFixed(v % 1024 ? 1 : 0) + ' GB';
    });
    $('saveSettingsBtn').addEventListener('click', saveSettings);
    $('detectJava').addEventListener('click', checkJava);
    $('pickJava').addEventListener('click', async () => {
      const p = await A.java.pick();
      if (p) { $('javaPath').value = p; checkJava(); }
    });
    $('pickGameDir').addEventListener('click', async () => {
      const p = await A.dialog.dir($('gameDir').value);
      if (p) $('gameDir').value = p;
    });
    $('openGameDir').addEventListener('click', () => {
      A.folder.open('game').then((r) => { if (!r.ok) toast(r.error || 'Papka ochilmadi', 'err'); });
    });


    $('modalBack').addEventListener('click', closeModal);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeModal();
        qsa('.lightbox').forEach((x) => x.remove());
      }
    });

    A.onDeepLink((link) => {
      if (String(link).includes('play')) {
        route('home');
        play();
      }
    });
  }

  function bindGameEvents() {
    A.game.onEvent((ev) => {
      if (!ev || !ev.type) return;
      if (ev.type === 'started') {
        S.playing = true;
        renderGameUI();
        renderHomePlay();
      } else if (ev.type === 'exited') {
        const was = S.playing;
        S.playing = false;
        S.launchInstanceId = null;
        renderGameUI();
        renderHomePlay();
        if (was) toast('O\u2018yin yopildi · ' + duration(ev.durationMs), 'info');
        reloadInstances().then(() => {
          renderRailInstances();
          if (S.page === 'instances') renderInstances();
          if (S.page === 'detail' || S.page === 'content') renderDetail();
        }).catch(() => {});
      } else if (ev.type === 'error') {
        S.playing = false;
        renderGameUI();
        renderHomePlay();
        toast(ev.error || 'O\u2018yin xatosi', 'err');
      }
    });
  }

  /* ============================================================ boot */

  async function boot() {
    Icons.mount();
    if (!A) {
      document.body.innerHTML = '<div style="padding:40px;font:14px sans-serif;color:#fff">Launcher preload yuklanmadi.</div>';
      return;
    }
    try {
      S.info = await A.info();
      S.config = await A.config.get();
    } catch (e) {
      document.body.innerHTML = '<div style="padding:40px;font:14px sans-serif;color:#fff">' + esc(errText(e)) + '</div>';
      return;
    }
    bindCommon();
    bindGameEvents();
    bindUpdates();
    fillSettings();
    startStatusLoop();

    const acct = S.config.account;
    if (!S.info.forceLogin && acct && acct.sessionExpires && Number(acct.sessionExpires) > Date.now()) {
      try {
        const me = await A.auth.me();
        if (me) {
          S.account = Object.assign({}, acct, {
            username: me.username,
            uuid: me.uuid,
            hasSkin: me.hasSkin,
            skinVersion: me.skinVersion,
            balance: Number(me.balance) || 0,
            claimBlocks: Number(me.claimBlocks) || 0,
            claims: Number(me.claims) || 0,
            playtimeMinutes: Number(me.playtimeMinutes) || 0,
            status: me.status || "O\u2018yinchi",
            rank: me.rank || "O\u2018yinchi",
          });
          S.avatar = await getAvatar(S.account.uuid, S.account.skinVersion);
          S.skin = await A.skin.get().catch(() => null);
          try { S.playing = await A.game.running(); } catch (_) { S.playing = false; }
          await enterApp();
          return;
        }
      } catch (_) { /* fall through */ }
    }
    showLogin();
  }

  boot();
})();
