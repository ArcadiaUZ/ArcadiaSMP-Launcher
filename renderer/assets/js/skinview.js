/* ArcadiaSMP — 3D skin viewer (pure CSS 3D, no three.js).
 * Minecraft 64×64 skin atlas → CSS cubes. T-Pose, drag bilan aylantirish,
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

  /* model units: 1 texture pixel = 1 unit */
  const SIZE = {
    head: [8, 8, 8], body: [8, 12, 4],
    rightArm: [4, 12, 4], leftArm: [4, 12, 4],
    rightLeg: [4, 12, 4], leftLeg: [4, 12, 4],
  };

  /* origin — model markazi (y pastga musbat) */
  const OFFSET = {
    head: [0, -12], body: [0, -2],
    rightArm: [-6, -2], leftArm: [6, -2],
    rightLeg: [-2, 10], leftLeg: [2, 10],
  };

  const FALLBACK = {
    head: '#c98f70', body: '#2f9c9c', rightArm: '#c98f70',
    leftArm: '#c98f70', rightLeg: '#3b4f9c', leftLeg: '#3b4f9c',
  };

  const FACE_DIM = (key, [w, h, d]) => {
    if (key === 'front' || key === 'back') return [w, h];
    if (key === 'left' || key === 'right') return [d, h];
    return [w, d];
  };

  const FACE_TX = (key, u, [w, h, d]) => {
    const hw = (w * u) / 2, hh = (h * u) / 2, hd = (d * u) / 2;
    switch (key) {
      case 'front': return 'translateZ(' + hd + 'px)';
      case 'back': return 'rotateY(180deg) translateZ(' + hd + 'px)';
      case 'right': return 'rotateY(90deg) translateZ(' + hw + 'px)';
      case 'left': return 'rotateY(-90deg) translateZ(' + hw + 'px)';
      case 'top': return 'rotateX(90deg) translateZ(' + hh + 'px)';
      default: return 'rotateX(-90deg) translateZ(' + hh + 'px)';
    }
  };

  function build(model, skinUrl, unit) {
    const u = unit;
    Object.entries(SIZE).forEach(([part, size]) => {
      const el = document.createElement('div');
      el.className = 'skin-part';
      el.style.transform = 'translate3d(' + (OFFSET[part][0] * u) + 'px,' + (OFFSET[part][1] * u) + 'px,0)';

      Object.keys(ATLAS[part]).forEach((key) => {
        const [tx, ty, tw, th] = ATLAS[part][key];
        const [fw, fh] = FACE_DIM(key, size);
        const face = document.createElement('div');
        face.className = 'skin-face';
        face.style.width = (fw * u) + 'px';
        face.style.height = (fh * u) + 'px';
        face.style.left = (-(fw * u) / 2) + 'px';
        face.style.top = (-(fh * u) / 2) + 'px';
        face.style.transform = FACE_TX(key, u, size);
        face.style.backgroundImage = skinUrl;
        face.style.backgroundSize = (64 * u) + 'px ' + (64 * u) + 'px';
        face.style.backgroundPosition = (-tx * u) + 'px ' + (-ty * u) + 'px';
        face.dataset.part = part;
        el.appendChild(face);
      });

      model.appendChild(el);
    });
  }

  function flat(model) {
    model.querySelectorAll('.skin-face').forEach((f) => {
      f.style.backgroundImage = 'none';
      f.style.background = FALLBACK[f.dataset.part] || '#3a5a4c';
    });
  }

  function mount(stage, options) {
    const opts = Object.assign({ skin: 'assets/img/steve-skin.png', unit: 7.2, autoRotate: true }, options || {});
    stage.innerHTML = '';
    stage.style.setProperty('--u', opts.unit + 'px');

    const shadow = document.createElement('div');
    shadow.className = 'skin-shadow';

    const model = document.createElement('div');
    model.className = 'skin-model';

    build(model, 'url("' + opts.skin + '")', opts.unit);
    stage.appendChild(shadow);
    stage.appendChild(model);

    let rx = -6, ry = 26, scale = 1;
    let dragging = false, lastX = 0, lastY = 0, lastAction = Date.now();

    const render = () => {
      model.style.transform = 'rotateX(' + rx + 'deg) rotateY(' + ry + 'deg) scale(' + scale + ')';
    };
    render();

    /* skin yuklanmasa — rangli fallback */
    const img = new Image();
    img.onerror = () => flat(model);
    img.src = opts.skin;

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

    return {
      reset() { rx = -6; ry = 26; scale = 1; render(); },
      setSkin(url) {
        model.querySelectorAll('.skin-face').forEach((f) => {
          f.style.backgroundImage = 'url("' + url + '")';
        });
        const probe = new Image();
        probe.onerror = () => flat(model);
        probe.src = url;
      },
    };
  }

  return { mount };
})();
