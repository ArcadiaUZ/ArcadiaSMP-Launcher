'use strict';

/**
 * ArcadiaSMP default client pack.
 *
 * The launcher ships no third-party mod jars. On first run it creates the
 * ArcadiaSMP Fabric instance and downloads the pinned Modrinth versions below.
 * Pinning matters: Voxy 0.2.20-beta supports Sodium 0.9.2 / 0.9.3-beta and
 * breaks with Iris >= 1.12. Newer Sodium betas are therefore not used.
 */

const fs = require('fs');
const path = require('path');
const mc = require('./minecraft');
const modrinth = require('./modrinth');
const PACK = require('./default-pack.json');

const TEMPLATE_OPTIONS = path.join(__dirname, 'default-options.txt');
const IRIS_CONFIG = [
  '# ArcadiaSMP default Iris configuration',
  'enableShaders=true',
  'shaderPack=photon_v1.4.zip',
  'allowUnknownShaders=false',
  'colorSpace=SRGB',
  'disableUpdateMessage=true',
  'enableDebugOptions=false',
  'maxShadowRenderDistance=32',
  '',
].join('\n');

const VOXY_CONFIG = {
  enabled: true,
  enable_rendering: true,
  ingest_enabled: true,
  section_render_distance: 8.0,
  service_threads: 10,
  sub_division_size: 105.63484,
  dont_use_sodium_builder_threads: false,
};

let active = null;

function dataDir(instanceId) {
  return mc.instanceDir(instanceId);
}

function targetPath(instanceId, kind, filename) {
  const dir = {
    mod: 'mods',
    resourcepack: 'resourcepacks',
    shader: 'shaderpacks',
    datapack: 'datapacks',
  }[kind] || 'mods';
  return path.join(dataDir(instanceId), dir, filename);
}

function fileReady(file, size) {
  try {
    const st = fs.statSync(file);
    return st.isFile() && (!size || st.size === size);
  } catch (_) {
    return false;
  }
}

function findInstance() {
  return mc.listInstances().find((i) => i.id === 'arcadia') || null;
}

function needs() {
  const inst = findInstance();
  return !!inst && (!inst.provisioned || inst.packVersion !== PACK.version);
}

function writeDefaults(instanceId) {
  const root = dataDir(instanceId);
  const config = path.join(root, 'config');
  fs.mkdirSync(config, { recursive: true });
  try {
    fs.copyFileSync(TEMPLATE_OPTIONS, path.join(root, 'options.txt'));
  } catch (_) {
    /* options are optional */
  }
  try {
    fs.writeFileSync(path.join(config, 'iris.properties'), IRIS_CONFIG, 'utf8');
  } catch (_) {
    /* Iris recreates this file if missing */
  }
  try {
    fs.writeFileSync(path.join(config, 'voxy-config.json'), JSON.stringify(VOXY_CONFIG, null, 2), 'utf8');
  } catch (_) {
    /* Voxy recreates this file if missing */
  }
}

function emit(onProgress, payload) {
  if (typeof onProgress === 'function') onProgress(payload);
}

async function run(onProgress) {
  const inst = findInstance();
  if (!inst) throw new Error('ArcadiaSMP instansi topilmadi.');
  const root = dataDir(inst.id);
  for (const sub of ['mods', 'resourcepacks', 'shaderpacks', 'datapacks', 'config', 'saves']) {
    fs.mkdirSync(path.join(root, sub), { recursive: true });
  }

  let current = inst;

  if (!current.icon) {
    try {
      const iconPath = path.join(__dirname, '..', 'renderer', 'assets', 'img', 'icon.png');
      const dataUrl = 'data:image/png;base64,' + fs.readFileSync(iconPath).toString('base64');
      mc.setInstanceIcon(current.id, dataUrl);
      current = mc.listInstances().find((i) => i.id === current.id) || current;
    } catch (_) {
      /* the block icon is an acceptable fallback */
    }
  }

  if (!mc.isInstalled(PACK.minecraft)) {
    emit(onProgress, { stage: 'pack', percent: 2, text: 'Minecraft ' + PACK.minecraft + ' yuklanmoqda…' });
    await mc.installVersion(PACK.minecraft, (p) => {
      const percent = Number(p && p.percent) || 0;
      emit(onProgress, {
        stage: 'pack',
        percent: Math.max(2, Math.min(28, Math.round(percent * 0.28))),
        text: p && p.stage === 'assets' ? 'O‘yin assetlari yuklanmoqda…' : 'Minecraft fayllari yuklanmoqda…',
      });
    });
  }

  const loaderReady =
    current.loader === 'fabric' &&
    current.versionId &&
    current.versionId !== PACK.minecraft &&
    mc.isInstalled(current.versionId);
  if (!loaderReady) {
    emit(onProgress, { stage: 'pack', percent: 30, text: 'Fabric loader o‘rnatilmoqda…' });
    const res = await mc.installLoader('fabric', PACK.minecraft, (p) => {
      emit(onProgress, {
        stage: 'pack',
        percent: Math.max(30, Math.min(42, Number(p && p.percent) || 30)),
        text: 'Fabric loader o‘rnatilmoqda…',
      });
    });
    current = mc.updateInstance(current.id, {
      loader: 'fabric',
      loaderVersion: res.loaderVersion,
      versionId: res.versionId,
    });
  }

  const allItems = PACK.items || [];
  const items = allItems.filter((item) => !item.optional);
  const optionalSkipped = allItems.length - items.length;
  let done = 0;
  let skipped = 0;
  const failed = [];
  const queue = items.slice();
  const workerCount = Math.max(1, Math.min(4, Number(process.env.ARCADIA_PACK_WORKERS) || 3));

  async function worker() {
    while (queue.length) {
      const item = queue.shift();
      const idx = items.indexOf(item) + 1;
      const target = targetPath(current.id, item.kind, item.filename);
      const percent = 42 + Math.round((done / Math.max(1, items.length)) * 53);
      emit(onProgress, {
        stage: 'pack',
        percent,
        index: idx,
        total: items.length,
        title: item.title,
        text: item.title + ' yuklanmoqda…',
      });
      if (fileReady(target, item.size)) {
        mc.recordContentMeta(current.id, item.kind, item.filename, {
          title: item.title,
          icon: item.icon,
          projectId: item.projectId,
          version: item.version,
          filename: item.filename,
          kind: item.kind,
        });
        skipped++;
        done++;
        continue;
      }
      try {
        await modrinth.install({
          instanceId: current.id,
          projectId: item.projectId,
          versionId: item.versionId,
          type: item.kind,
          title: item.title,
          icon: item.icon,
          onProgress: (p) => {
            emit(onProgress, {
              stage: 'pack',
              percent: 42 + Math.round((done / Math.max(1, items.length)) * 53),
              index: idx,
              total: items.length,
              title: item.title,
              text: item.title + ' · ' + (p && p.percent ? p.percent + '%' : 'yuklanmoqda…'),
            });
          },
        });
        done++;
      } catch (e) {
        failed.push({ title: item.title, error: e.message || String(e) });
        done++;
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, worker));

  writeDefaults(current.id);

  const complete = failed.length === 0;
  current = mc.updateInstance(current.id, {
    provisioned: complete,
    packVersion: complete ? PACK.version : null,
  });

  emit(onProgress, {
    stage: 'pack',
    percent: 100,
    text: complete ? 'Arcadia to‘plami tayyor' : 'Ba’zi fayllar yuklanmadi',
    index: items.length,
    total: items.length,
  });

  return {
    ok: complete,
    instance: current,
    installed: done,
    skipped,
    optionalSkipped,
    failed,
    total: items.length,
  };
}

function ensure(onProgress) {
  if (active) return active;
  active = run(onProgress).finally(() => {
    active = null;
  });
  return active;
}

module.exports = { needs, ensure, pack: PACK };
