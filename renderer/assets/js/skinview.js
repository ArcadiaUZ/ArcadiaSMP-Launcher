/* ArcadiaSMP — 3D skin viewer (pure CSS 3D, no three.js).
 * Minecraft 64×64 skin atlas → CSS cubes. Base + overlay (hat/jacket/
 * sleeves/pants), classic/slim model va cape. T-Pose, drag bilan aylantirish,
 * g'ildirak bilan zoom, bo'sh turganda sekin avto-aylanish.
 */
window.SkinViewer = (function () {
  'use strict';

  /* [x, y, w, h] — 64×64 atlas */
  const ATLAS = {
    head:     { top: [8, 0, 8, 8], bottom: [16, 0, 8, 8], right: [0, 8, 8, 8], front: [8, 8, 8, 8], left: [16, 8, 8, 8], back: [24, 8, 8, 8] },
    body:     { top: [20, 16, 8, 4], bottom: [28, 16, 8, 4], right: [16, 20, 4, 12], front: [20, 20, 8, 12], left: [28, 20, 4, 12], back: [32, 20, 8, 12] },
    rightArm: { top: [44, 16, 4, 4], bottom: [48, 16, 4, 4], right: [40, 20, 4, 12], front: [44, 20, 4, 12], left: [48, 20, 4, 12], back: [52, 20, 4, 12] },
    leftArm:  { top: [36, 48, 4, 4], bottom: [40, 48, 4, 4], right: [32, 52, 4, 12], front: [36, 52, 4, 12], left: [40, 52, 4, 12], back: [44, 52, 4, 12] },
    rightLeg: { top: [4, 16, 4, 4], bottom: [8, 16, 4, 4], right: [0, 20, 4, 12], front: [4, 20, 4, 12], left: [8, 20, 4, 12], back: [12, 20, 4, 12] },
    leftLeg:  { top: [20, 48, 4, 4], bottom: [24, 48, 4, 4], right: [16, 52, 4, 12], front: [20, 52, 4, 12], left: [24, 52, 4, 12], back: [28, 52, 4, 12] },
  };

  /* Overlay qatlamlari — 64×64 atlas, 1.8+ layout */
  const OVERLAY = {
    head:     { top: [40, 0, 8, 8], bottom: [48, 0, 8, 8], right: [32, 8, 8, 8], front: [40, 8, 8, 8], left: [48, 8, 8, 8], back: [56, 8, 8, 8] },
    body:     { top: [20, 32, 8, 4], bottom: [28, 32, 8, 4], right: [16, 36, 4, 12], front: [20, 36, 8, 12], left: [28, 36, 4, 12], back: [32, 36, 8, 12] },
    rightArm: { top: [44, 32, 4, 4], bottom: [48, 32, 4, 4], right: [40, 36, 4, 12], front: [44, 36, 4, 12], left: [48, 36, 4, 12], back: [52, 36, 4, 12] },
    leftArm:  { top: [52, 48, 4, 4], bottom: [56, 48, 4, 4], right: [48, 52, 4, 12], front: [52, 52, 4, 12], left: [56, 52, 4, 12], back: [60, 52, 4, 12] },
    rightLeg: { top: [4, 32, 4, 4], bottom: [8, 32, 4, 4], right: [0, 36, 4, 12], front: [4, 36, 4, 12], left: [8, 36, 4, 12], back: [12, 36, 4, 12] },
    leftLeg:  { top: [4, 48, 4, 4], bottom: [8, 48, 4, 4], right: [0, 52, 4, 12], front: [4, 52, 4, 12], left: [8, 52, 4, 12], back: [12, 52, 4, 12] },
  };

  const FALLBACK = {
    head: '#c98f70', body: '#2f9c9c', rightArm: '#c98f70',
    leftArm: '#c98f70', rightLeg: '#3b4f9c', leftLeg: '#3b4f9c',
  };

  const PARTS = ['head', 'body', 'rightArm', 'leftArm', 'rightLeg', 'leftLeg'];

  function sizes(model) {
    const arm = model === 'slim' ? 3 : 4;
    return {
      head: [8, 8, 8], body: [8, 12, 4],
      rightArm: [arm, 12, 4], leftArm: [arm, 12, 4],
      rightLeg: [4, 12, 4], leftLeg: [4, 12, 4],
    };
  }

  function offsets(model) {
    const arm = model === 'slim' ? 5.5 : 6;
    return {
      head: [0, -12], body: [0, -2],
      rightArm: [-arm, -2], leftArm: [arm, -2],
      rightLeg: [-2, 10], leftLeg: [2, 10],
    };
  }

  const FACE_DIM = (key, [w, h, d]) => {
    if (key === 'front' || key === 'back') return [w, h];
    if (key === 'left' || key === 'right') return [d, h];
    return [w, d];
  };

  const FACE_TX = (key, u, [w, h, d], inflate) => {
    const hw = (w * u) / 2, hh = (h * u) / 2, hd = (d * u) / 2;
    const off = (inflate || 0) * u;
    switch (key) {
      case 'front': return 'translateZ(' + (hd + off) + 'px)';
      case 'back': return 'rotateY(180deg) translateZ(' + (hd + off) + 'px)';
      case 'right': return 'rotateY(-90deg) translateZ(' + (hw + off) + 'px)';
      case 'left': return 'rotateY(90deg) translateZ(' + (hw + off) + 'px)';
      case 'top': return 'rotateX(90deg) translateZ(' + (hh + off) + 'px)';
      default: return 'rotateX(-90deg) translateZ(' + (hh + off) + 'px)';
    }
  };

  function addPart(model, part, size, off, atlas, skinUrl, unit, inflate, overlay) {
    const el = document.createElement('div');
    el.className = 'skin-part' + (overlay ? ' skin-part-overlay' : '');
    el.style.transform = 'translate3d(' + (off[0] * unit) + 'px,' + (off[1] * unit) + 'px,0)';

    Object.keys(atlas[part]).forEach((key) => {
      const [tx, ty, tw, th] = atlas[part][key];
      const [fw, fh] = FACE_DIM(key, size);
      const face = document.createElement('div');
      face.className = 'skin-face';
      face.style.width = (fw * unit) + 'px';
      face.style.height = (fh * unit) + 'px';
      face.style.left = (-(fw * unit) / 2) + 'px';
      face.style.top = (-(fh * unit) / 2) + 'px';
      face.style.transform = FACE_TX(key, unit, size, inflate);
      face.style.backgroundImage = skinUrl;
      face.style.backgroundSize = (64 * unit) + 'px ' + (64 * unit) + 'px';
      face.style.backgroundPosition = (-tx * unit) + 'px ' + (-ty * unit) + 'px';
      face.dataset.part = part;
      if (overlay) face.dataset.overlay = '1';
      el.appendChild(face);
    });

    model.appendChild(el);
  }

  function addCape(model, capeUrl, unit) {
    if (!capeUrl) return;
    const cape = document.createElement('div');
    cape.className = 'skin-cape';
    cape.style.position = 'absolute';
    cape.style.left = (-5 * unit) + 'px';
    cape.style.top = (-8 * unit) + 'px';
    cape.style.width = (10 * unit) + 'px';
    cape.style.height = (16 * unit) + 'px';
    cape.style.backgroundImage = 'url("' + capeUrl + '")';
    cape.style.backgroundRepeat = 'no-repeat';
    cape.style.imageRendering = 'pixelated';
    cape.style.backgroundSize = (64 * unit) + 'px ' + (32 * unit) + 'px';
    cape.style.backgroundPosition = (-1 * unit) + 'px ' + (-1 * unit) + 'px';
    cape.style.transform = 'translateZ(' + (-3 * unit) + 'px) rotateY(180deg)';
    cape.style.backfaceVisibility = 'hidden';
    const probe = new Image();
    probe.onload = () => {
      if (probe.naturalHeight > 32) {
        cape.style.backgroundSize = (64 * unit) + 'px ' + (probe.naturalHeight * unit) + 'px';
      }
    };
    probe.src = capeUrl;
    model.insertBefore(cape, model.firstChild);
  }

  function build(modelEl, opts) {
    const unit = opts.unit;
    const size = sizes(opts.model);
    const off = offsets(opts.model);
    const skinUrl = 'url("' + (opts.skin || 'assets/img/steve-skin.png') + '")';

    modelEl.innerHTML = '';
    addCape(modelEl, opts.cape, unit);
    PARTS.forEach((part) => addPart(modelEl, part, size[part], off[part], ATLAS, skinUrl, unit, 0, false));
    if (opts.overlay !== false) {
      PARTS.forEach((part) => addPart(modelEl, part, size[part], off[part], OVERLAY, skinUrl, unit, 0.5, true));
    }
  }

  function flat(model) {
    model.querySelectorAll('.skin-face').forEach((f) => {
      f.style.backgroundImage = 'none';
      f.style.background = FALLBACK[f.dataset.part] || '#3a5a4c';
    });
    const cape = model.querySelector('.skin-cape');
    if (cape) cape.style.display = 'none';
  }

  function mount(stage, options) {
    const opts = Object.assign(
      { skin: 'assets/img/steve-skin.png', cape: '', model: 'classic', unit: 7.2, autoRotate: true, overlay: true },
      options || {}
    );
    stage.innerHTML = '';
    stage.style.setProperty('--u', opts.unit + 'px');

    const shadow = document.createElement('div');
    shadow.className = 'skin-shadow';

    const model = document.createElement('div');
    model.className = 'skin-model';

    build(model, opts);
    stage.appendChild(shadow);
    stage.appendChild(model);

    let rx = opts.rx === undefined ? -6 : Number(opts.rx);
    let ry = opts.ry === undefined ? 26 : Number(opts.ry);
    let scale = 1;
    let dragging = false, lastX = 0, lastY = 0, lastAction = Date.now();

    const render = () => {
      model.style.transform = 'rotateX(' + rx + 'deg) rotateY(' + ry + 'deg) scale(' + scale + ')';
    };
    render();

    /* skin yuklanmasa — rangli fallback */
    const probe = new Image();
    probe.onerror = () => flat(model);
    probe.src = opts.skin;

    const onDown = (e) => {
      dragging = true;
      lastX = e.clientX; lastY = e.clientY;
      lastAction = Date.now();
      stage.classList.add('dragging');
      stage.setPointerCapture && stage.setPointerCapture(e.pointerId);
    };
    const onMove = (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      ry += dx * 0.45;
      rx = Math.max(-48, Math.min(38, rx - dy * 0.35));
      lastAction = Date.now();
      render();
    };
    const onUp = () => {
      dragging = false;
      stage.classList.remove('dragging');
      lastAction = Date.now();
    };
    const onWheel = (e) => {
      e.preventDefault();
      scale = Math.max(0.62, Math.min(1.55, scale - e.deltaY * 0.0012));
      render();
      lastAction = Date.now();
    };

    stage.addEventListener('pointerdown', onDown);
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerup', onUp);
    stage.addEventListener('pointercancel', onUp);
    stage.addEventListener('pointerleave', onUp);
    stage.addEventListener('wheel', onWheel, { passive: false });

    if (opts.autoRotate) {
      const tick = () => {
        if (!dragging && Date.now() - lastAction > 6000) {
          ry += 0.16;
          render();
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }

    function rebuild() {
      build(model, opts);
      const img = new Image();
      img.onerror = () => flat(model);
      img.src = opts.skin;
    }

    return {
      reset() { rx = opts.rx === undefined ? -6 : Number(opts.rx); ry = opts.ry === undefined ? 26 : Number(opts.ry); scale = 1; render(); },
      setSkin(url, modelType) {
        opts.skin = url;
        if (modelType) opts.model = modelType;
        rebuild();
      },
      setModel(modelType) {
        opts.model = modelType === 'slim' ? 'slim' : 'classic';
        rebuild();
      },
      setCape(url) {
        opts.cape = url || '';
        rebuild();
      },
      setOverlay(enabled) {
        opts.overlay = enabled !== false;
        rebuild();
      },
    };
  }

  return { mount };
})();
