// GSW — Phase 3: hero 3D scene (progressive enhancement).
// A gold blueprint-style building assembles floor by floor, beside a small pool slab.
// The static SVG in #hero-stage stays visible unless WebGL starts successfully.
const stage = document.getElementById('hero-stage');

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const saveData = navigator.connection && navigator.connection.saveData;
const lowMemory = navigator.deviceMemory && navigator.deviceMemory < 2;

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch { return false; }
}

if (stage && !reduceMotion && !saveData && !lowMemory && webglAvailable()) {
  // Load three.js only after the page itself is interactive.
  const start = () => import('./vendor/three.module.min.js').then(init).catch(() => { /* keep SVG */ });
  if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 1500 });
  else setTimeout(start, 300);
}

function init(THREE) {
  const GOLD = 0xbe9a4f, GOLD_SOFT = 0xd6bb7f, NAVY = 0x182e45, WATER = 0x3f8fb0;

  const canvas = document.createElement('canvas');
  canvas.className = 'hero-canvas';
  canvas.setAttribute('aria-hidden', 'true');

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch { return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(9.5, 7.2, 12.5);
  camera.lookAt(0.8, 2.6, 0);

  const root = new THREE.Group();
  scene.add(root);

  const lineMat = (color, opacity = 1) => new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  const faceMat = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });

  // Ground grid
  const grid = new THREE.GridHelper(13, 26, GOLD, GOLD);
  grid.material.transparent = true; grid.material.opacity = 0.14;
  root.add(grid);

  // Building tiers (match the SVG fallback silhouette): [width, depth, height]
  const tiers = [[5.6, 4.2, 1.2], [4.8, 3.6, 1.3], [3.6, 2.8, 1.3], [2.0, 1.8, 1.3], [0.6, 0.6, 1.0]];
  const floors = [];
  let y = 0;
  tiers.forEach(([w, d, h], i) => {
    const g = new THREE.Group();
    const box = new THREE.BoxGeometry(w, h, d);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box), lineMat(GOLD));
    const face = new THREE.Mesh(box, faceMat(NAVY, 0.35));
    g.add(face, edges);

    // Windows on the two visible faces (front +z, right +x)
    const cols = Math.max(1, Math.floor(w / 1.1));
    const winW = Math.min(0.5, (w / cols) * 0.5), winH = h * 0.42;
    const winGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(winW, winH));
    const wm = lineMat(GOLD_SOFT, 0.6);
    for (let c = 0; c < cols && i < 4; c++) {
      const x = -w / 2 + (w / cols) * (c + 0.5);
      const f = new THREE.LineSegments(winGeo, wm); f.position.set(x, 0, d / 2 + 0.01); g.add(f);
    }
    const sideCols = Math.max(1, Math.floor(d / 1.1));
    for (let c = 0; c < sideCols && i < 4; c++) {
      const z = -d / 2 + (d / sideCols) * (c + 0.5);
      const s = new THREE.LineSegments(winGeo, wm); s.rotation.y = Math.PI / 2; s.position.set(w / 2 + 0.01, 0, z); g.add(s);
    }

    g.userData = { targetY: y + h / 2, h };
    g.position.y = g.userData.targetY;
    root.add(g);
    floors.push(g);
    y += h;
  });

  // Pool slab beside the building
  const pool = new THREE.Group();
  const deck = new THREE.BoxGeometry(2.2, 0.12, 3.4);
  pool.add(new THREE.LineSegments(new THREE.EdgesGeometry(deck), lineMat(GOLD, 0.8)));
  const water = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.8), faceMat(WATER, 0.45));
  water.rotation.x = -Math.PI / 2; water.position.y = 0.07;
  pool.add(water);
  pool.position.set(4.1, 0.06, 1.2);
  root.add(pool);

  // Dimension line (blueprint feel)
  const dimPts = [new THREE.Vector3(-3.4, 0, 2.6), new THREE.Vector3(-3.4, y, 2.6)];
  const dim = new THREE.Line(new THREE.BufferGeometry().setFromPoints(dimPts),
    new THREE.LineDashedMaterial({ color: 0xf7f4ee, dashSize: 0.15, gapSize: 0.12, transparent: true, opacity: 0.35 }));
  dim.computeLineDistances();
  root.add(dim);

  // Build animation: each floor drops in and fades up, one after another.
  const BUILD_START = performance.now() + 150, STEP = 380, DUR = 650;
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const setOpacity = (obj, k) => obj.traverse((o) => {
    if (o.material) {
      o.material.userData.base ??= o.material.opacity;
      o.material.opacity = o.material.userData.base * k;
    }
  });
  floors.forEach((f) => { f.visible = false; });
  pool.visible = false; dim.visible = false;

  // Pointer parallax (desktop only)
  let px = 0, py = 0, tx = 0, ty = 0;
  const finePointer = window.matchMedia('(pointer: fine)').matches;
  if (finePointer) {
    window.addEventListener('pointermove', (e) => {
      tx = (e.clientX / window.innerWidth - 0.5) * 0.5;
      ty = (e.clientY / window.innerHeight - 0.5) * 0.25;
    }, { passive: true });
  }

  function resize() {
    const r = stage.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(stage);
  resize();

  // Only render while the hero is on screen and the tab is visible.
  let onScreen = true, raf = 0;
  new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; loop(); }).observe(stage);
  document.addEventListener('visibilitychange', loop);

  function frame(now) {
    raf = 0;
    floors.forEach((f, i) => {
      const t = Math.min(1, Math.max(0, (now - BUILD_START - i * STEP) / DUR));
      if (t <= 0) return;
      f.visible = true;
      const k = ease(t);
      f.position.y = f.userData.targetY + (1 - k) * 2.2;
      setOpacity(f, k);
    });
    const tail = Math.min(1, Math.max(0, (now - BUILD_START - floors.length * STEP) / DUR));
    if (tail > 0) { pool.visible = dim.visible = true; setOpacity(pool, ease(tail)); setOpacity(dim, ease(tail)); }

    px += (tx - px) * 0.05; py += (ty - py) * 0.05;
    root.rotation.y = Math.sin(now / 6000) * 0.25 + px;
    root.rotation.x = py * 0.3;
    water.material.opacity = 0.4 + Math.sin(now / 700) * 0.06;

    renderer.render(scene, camera);
    loop();
  }
  function loop() {
    if (!raf && onScreen && !document.hidden) raf = requestAnimationFrame(frame);
  }

  stage.appendChild(canvas);
  stage.classList.add('is-3d');
  loop();
}
