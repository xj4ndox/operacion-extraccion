import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

/* =====================================================================
   1. CONFIGURACIÓN  (aquí cambias números sin tocar el resto del código)
   ===================================================================== */
const CFG = {
  player: { speed: 5, boostSpeed: 8, boostTime: 6, radius: 0.4, eyeHeight: 1.7 },
  catchDistance: 1.0,               // distancia a la que un zombi te atrapa (Game Over)
  zombie: {
    file: './models/zombie.glb',
    height: 1.8,
    detectRange: 16,                // RF05: distancia de activación
    speed: 2.0,
    fastSpeed: 4.0,                 // algunos zombis son más rápidos (RF11)
    hp: 2,                          // RF07: dos impactos
    yawOffset: 0                    // si tu zombi mira al revés, pon Math.PI
  },
  // RF01 + RF02: cada arma con su propia munición
  weapons: {
    1: { name: 'Pistola',  file: './models/arma1.glb', ammo: 12, pickup: 6, cooldown: 0.30, range: 80, size: 0.45, pos: [0.28, -0.25, -0.55], rotY: Math.PI / 2 },
    2: { name: 'Escopeta', file: './models/arma2.glb', ammo: 6,  pickup: 3, cooldown: 0.90, range: 40, size: 0.95, pos: [0.28, -0.28, -0.75], rotY: Math.PI / 2 }
  }
};

// Mapa: la calle va desde z = +14 (inicio) hasta z = -212 (final)
const LEVEL = {
  startZ: 4,
  extractionZ: [-200, -188],        // zona de extracción (rango de z)
  streetHalfWidth: 8,
  // barricadas con hueco: [z, x del hueco]
  barriers: [[-30, 4], [-60, -4], [-90, 0], [-120, 5], [-150, -5], [-175, 0]],
  crates: [[-5, -12], [6, -20], [-6, -45], [3, -75], [-3, -105], [6, -135], [-5, -162], [4, -185]],
  zombies: [
    [-4, -18], [5, -24], [0, -40], [-5, -50], [4, -55], [5, -72], [-4, -82],
    [0, -100], [-5, -110], [4, -135], [-3, -142], [0, -165], [6, -168], [-6, -185]
  ],
  ammoBoxes: [[-6, -35], [5, -65], [-5, -95], [5, -125], [-4, -155], [4, -180]],
  boosts: [[0, -75], [0, -140]]
};

/* =====================================================================
   2. ESCENA, CÁMARA, RENDERER, LUCES
   ===================================================================== */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0f14);
scene.fog = new THREE.Fog(0x0a0f14, 4, 55);

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 400);
camera.position.set(0, CFG.player.eyeHeight, LEVEL.startZ);
scene.add(camera); // necesario para que las armas (hijas de la cámara) se dibujen

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0x6677aa, 0x222222, 1.0));
const moon = new THREE.DirectionalLight(0x8899cc, 0.8);
moon.position.set(-10, 30, 10);
scene.add(moon);

// Linterna del jugador
const flashlight = new THREE.SpotLight(0xfff2cc, 120, 45, 0.5, 0.5, 1.5);
flashlight.position.set(0.1, -0.1, 0);
flashlight.target.position.set(0, 0, -10);
camera.add(flashlight, flashlight.target);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* =====================================================================
   3. MUNDO: calle, edificios, barricadas, cajas, zonas
   ===================================================================== */
const colliders = [];   // cajas invisibles para chocar (jugador y zombis)
const solids = [];      // mallas que bloquean las balas

function addSolid(cx, cz, w, d, h, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(cx, h / 2, cz);
  scene.add(mesh);
  solids.push(mesh);
  colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
  return mesh;
}

// Textura de ventanas dibujada con canvas (no necesita archivos)
function facadeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#2a2d33'; g.fillRect(0, 0, 128, 128);
  for (let y = 8; y < 128; y += 32)
    for (let x = 8; x < 128; x += 32) {
      g.fillStyle = Math.random() < 0.12 ? '#c9a54a' : '#10131a';
      g.fillRect(x, y, 16, 20);
    }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function groundTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#2b2b2e'; g.fillRect(0, 0, 64, 128);
  for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`; g.fillRect(Math.random() * 64, Math.random() * 128, 2, 2); }
  g.fillStyle = '#c9a54a'; g.fillRect(30, 0, 4, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 15);
  return t;
}

function buildWorld() {
  const W = LEVEL.streetHalfWidth;

  // Suelo
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(W * 2, 230),
    new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.95 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, -100);
  scene.add(ground);

  // Edificios a ambos lados (también son las paredes de la calle)
  const facadeTex = facadeTexture();
  for (let z = 12; z > -216; z -= 12) {
    for (const side of [-1, 1]) {
      const h = 8 + Math.random() * 10;
      const tex = facadeTex.clone();
      tex.needsUpdate = true;
      tex.repeat.set(3, Math.round(h / 4));
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
      addSolid(side * (W + 7), z, 14, 12, h, mat);
    }
  }
  // Muros del inicio y del final
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x33363d });
  addSolid(0, 16, 44, 4, 10, wallMat);
  addSolid(0, -212, 44, 4, 10, wallMat);

  // Barricadas (contenedores) con un hueco: obligan a zigzaguear
  const rust = new THREE.MeshStandardMaterial({ color: 0x7a3e24, roughness: 0.8 });
  const gapW = 4.5;
  for (const [z, gx] of LEVEL.barriers) {
    const leftW = (gx - gapW / 2) - (-W);
    const rightW = W - (gx + gapW / 2);
    if (leftW > 0.1) addSolid(-W + leftW / 2, z, leftW, 1.4, 2.4, rust);
    if (rightW > 0.1) addSolid(W - rightW / 2, z, rightW, 1.4, 2.4, rust);
  }

  // Cajas sueltas
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x8a6a3b, roughness: 0.9 });
  for (const [x, z] of LEVEL.crates) addSolid(x, z, 1.5, 1.5, 1.5, crateMat);

  // Zona de inicio (azul)
  const startRing = new THREE.Mesh(
    new THREE.RingGeometry(2.2, 3, 32),
    new THREE.MeshBasicMaterial({ color: 0x2979ff, side: THREE.DoubleSide })
  );
  startRing.rotation.x = -Math.PI / 2;
  startRing.position.set(0, 0.03, LEVEL.startZ);
  scene.add(startRing);

  // Zona de extracción (verde) + rayo de luz visible desde lejos
  const [zA, zB] = LEVEL.extractionZ;
  const exMid = (zA + zB) / 2;
  const pad = new THREE.Mesh(
    new THREE.PlaneGeometry(W * 2 - 1, Math.abs(zA - zB)),
    new THREE.MeshBasicMaterial({ color: 0x34c759, transparent: true, opacity: 0.35 })
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(0, 0.04, exMid);
  scene.add(pad);

  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(3, 3, 80, 24, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x34c759, transparent: true, opacity: 0.25, side: THREE.DoubleSide, fog: false })
  );
  beam.position.set(0, 40, exMid);
  scene.add(beam);

  const exLight = new THREE.PointLight(0x34c759, 200, 40, 2);
  exLight.position.set(0, 4, exMid);
  scene.add(exLight);
}

/* =====================================================================
   4. CARGA DE MODELOS GLB (con modelo de respaldo si el archivo no existe)
   ===================================================================== */
const loader = new GLTFLoader();
const models = { weapon1: null, weapon2: null, zombie: null };

async function tryLoad(path) {
  try {
    return await loader.loadAsync(path);
  } catch (e) {
    console.warn('No se pudo cargar ' + path + ' -> se usará un modelo simple de respaldo.');
    return null;
  }
}

// Escala el modelo a un tamaño y lo centra (apoyado en y=0 si onGround)
function normalize(object, targetSize, useHeight, onGround) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const ref = useHeight ? size.y : Math.max(size.x, size.y, size.z);
  const s = targetSize / (ref || 1);
  const holder = new THREE.Group();
  object.scale.multiplyScalar(s);
  object.position.set(-center.x * s, onGround ? -box.min.y * s : -center.y * s, -center.z * s);
  holder.add(object);
  return holder;
}

/* Modelos de respaldo hechos con cajas (apuntan hacia -Z) */
function fallbackWeapon(id) {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.6, roughness: 0.4 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.8 });
  if (id === 1) {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.28), dark);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.06), dark);
    grip.position.set(0, -0.1, 0.1); grip.rotation.x = 0.2;
    g.add(body, grip);
  } else {
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.7), dark);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.3), wood);
    stock.position.set(0, -0.03, 0.4);
    const pump = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.18), wood);
    pump.position.set(0, -0.05, -0.1);
    g.add(barrel, stock, pump);
  }
  return g;
}
function fallbackZombie() {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0x6f8f5a, roughness: 0.9 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0x4a3b30, roughness: 0.9 });
  const part = (w, h, d, m, x, y, z) => { const p = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); p.position.set(x, y, z); g.add(p); return p; };
  part(0.5, 0.7, 0.3, cloth, 0, 1.1, 0);        // torso
  part(0.32, 0.32, 0.32, skin, 0, 1.65, 0);     // cabeza
  part(0.18, 0.8, 0.18, cloth, -0.17, 0.4, 0);  // piernas
  part(0.18, 0.8, 0.18, cloth, 0.17, 0.4, 0);
  part(0.14, 0.14, 0.7, skin, -0.35, 1.3, 0.35); // brazos al frente (+Z)
  part(0.14, 0.14, 0.7, skin, 0.35, 1.3, 0.35);
  return g;
}

/* =====================================================================
   5. ESTADO DEL JUEGO
   ===================================================================== */
let state = 'menu'; // menu | playing | over | won
const controls = new PointerLockControls(camera, document.body);
const player = { pos: camera.position, boost: 0 };
const ammo = { 1: CFG.weapons[1].ammo, 2: CFG.weapons[2].ammo };
let current = 1;
let cooldown = 0;
let kick = 0;

const zombies = [];
const hitboxes = [];
const pickups = [];
const weaponHolders = {};

/* ---------- HUD ---------- */
const $ = (id) => document.getElementById(id);
const hud = { z: $('zLeft'), dist: $('dist'), msg: $('msg'), cross: $('crosshair'), boost: $('boost') };
let msgTimer = 0;
function showMsg(text, seconds = 2) { hud.msg.textContent = text; hud.msg.classList.add('show'); msgTimer = seconds; }
function updateWeaponHud() {
  for (const id of [1, 2]) {
    const el = $('w' + id);
    el.classList.toggle('active', id === current);
    el.classList.toggle('empty', ammo[id] === 0);
    el.querySelector('.ammo').textContent = ammo[id] + ' balas';
    el.querySelector('.name').textContent = CFG.weapons[id].name;
  }
}
function showOverlay(title, cls, text, btn, onClick) {
  const t = $('ovTitle');
  t.textContent = title; t.className = cls || '';
  $('ovText').innerHTML = text;
  const b = $('ovBtn');
  b.textContent = btn; b.disabled = false; b.onclick = onClick;
  $('overlay').classList.remove('hidden');
}
const hideOverlay = () => $('overlay').classList.add('hidden');

/* ---------- Sonido simple (WebAudio, sin archivos) ---------- */
let audio = null;
function beep(freq, dur, type = 'square', vol = 0.15) {
  if (!audio) return;
  const o = audio.createOscillator(), g = audio.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(vol, audio.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + dur);
  o.connect(g); g.connect(audio.destination);
  o.start(); o.stop(audio.currentTime + dur);
}
function shotSound(big) { beep(big ? 90 : 160, big ? 0.3 : 0.15, 'sawtooth', 0.25); }

/* =====================================================================
   6. ARMAS (hijas de la cámara)
   ===================================================================== */
const muzzle = new THREE.PointLight(0xffaa55, 0, 6, 2);
camera.add(muzzle);
muzzle.position.set(0.25, -0.15, -0.9);

function buildWeapons() {
  for (const id of [1, 2]) {
    const cfg = CFG.weapons[id];
    const glb = models['weapon' + id];
    let holder;
    if (glb) {
      holder = normalize(glb.scene.clone(true), cfg.size, false, false);
      holder.rotation.y = cfg.rotY;
      const wrap = new THREE.Group();
      wrap.add(holder);
      holder = wrap;
    } else {
      holder = new THREE.Group();
      holder.add(normalize(fallbackWeapon(id), cfg.size, false, false));
    }
    holder.position.set(...cfg.pos);
    holder.userData.basePos = holder.position.clone();
    holder.visible = id === current;
    camera.add(holder);
    weaponHolders[id] = holder;
  }
}

function selectWeapon(id) {
  if (state !== 'playing' || id === current) return;
  current = id;
  for (const k of [1, 2]) weaponHolders[k].visible = k === id;
  updateWeaponHud();
  beep(500, 0.05, 'triangle', 0.1);
}

/* =====================================================================
   7. ZOMBIS (RF04, RF05, RF07)
   ===================================================================== */
function spawnZombie(x, z, index) {
  const glb = models.zombie;
  let body, clips = [];
  if (glb) {
    body = SkeletonUtils.clone(glb.scene);
    body = normalize(body, CFG.zombie.height, true, true);
    clips = glb.animations;
  } else {
    body = fallbackZombie();
  }

  // Cada zombi necesita sus propios materiales (para el destello rojo al recibir un impacto)
  body.traverse((o) => { if (o.isMesh) o.material = o.material.clone(); });

  const holder = new THREE.Group();
  holder.add(body);
  holder.position.set(x, 0, z);
  holder.rotation.y = Math.random() * Math.PI * 2;
  scene.add(holder);

  const hitbox = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 1.9, 0.9),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hitbox.position.y = 0.95;
  holder.add(hitbox);

  const zombie = {
    holder, body, hitbox,
    hp: CFG.zombie.hp,
    state: 'idle',                  // idle -> active -> dead
    speed: index % 4 === 3 ? CFG.zombie.fastSpeed : CFG.zombie.speed,
    mixer: null, flash: 0, deathT: 0
  };
  hitbox.userData.zombie = zombie;

  if (clips.length) {
    zombie.mixer = new THREE.AnimationMixer(body);
    const clip = clips.find((c) => /walk|run|idle/i.test(c.name)) || clips[0];
    zombie.mixer.clipAction(clip).play();
  }
  zombies.push(zombie);
  hitboxes.push(hitbox);
}

function flashZombie(z) {
  z.flash = 0.12;
  z.body.traverse((o) => { if (o.isMesh && o.material.emissive) { o.material.emissive.set(0xff0000); o.material.emissiveIntensity = 1.5; } });
}
function clearFlash(z) {
  z.body.traverse((o) => { if (o.isMesh && o.material.emissive) { o.material.emissive.set(0x000000); o.material.emissiveIntensity = 1; } });
}

function damageZombie(z) {
  z.hp -= 1;                         // cada impacto válido resta 1
  flashZombie(z);
  if (z.hp <= 0) {                   // muere exactamente con el 2.º impacto
    z.state = 'dead';
    const i = hitboxes.indexOf(z.hitbox);
    if (i >= 0) hitboxes.splice(i, 1); // ya no se le puede disparar
    if (z.mixer) z.mixer.stopAllAction();
    updateZombieCount();
    beep(80, 0.4, 'sawtooth', 0.2);
  }
}
function updateZombieCount() { hud.z.textContent = zombies.filter((z) => z.state !== 'dead').length; }

/* =====================================================================
   8. DISPARO (RF01, RF02, RF07) — raycasting desde el centro de la pantalla
   ===================================================================== */
const raycaster = new THREE.Raycaster();
const center = new THREE.Vector2(0, 0);

function shoot() {
  const cfg = CFG.weapons[current];
  if (cooldown > 0) return;
  if (ammo[current] <= 0) {            // sin balas: no dispara
    beep(120, 0.05, 'square', 0.1);
    showMsg('¡Sin munición! Busca una caja', 1.2);
    return;
  }
  ammo[current] -= 1;                  // cada disparo consume 1 bala
  cooldown = cfg.cooldown;
  kick = 1;
  muzzle.intensity = 40;
  shotSound(current === 2);
  updateWeaponHud();

  raycaster.setFromCamera(center, camera);
  raycaster.far = cfg.range;
  const zHit = raycaster.intersectObjects(hitboxes, false)[0];
  const wallHit = raycaster.intersectObjects(solids, false)[0];

  // Solo cuenta si no hay una pared en medio
  if (zHit && (!wallHit || zHit.distance < wallHit.distance)) {
    damageZombie(zHit.object.userData.zombie);
    hud.cross.classList.add('hit');
    setTimeout(() => hud.cross.classList.remove('hit'), 120);
  }
}

addEventListener('mousedown', (e) => {
  // mousedown ocurre UNA vez por clic: mantener presionado no dispara en automático
  if (e.button === 0 && state === 'playing' && controls.isLocked) shoot();
});

/* =====================================================================
   9. OBJETOS COLECCIONABLES (RF02, RF10)
   ===================================================================== */
function spawnPickup(kind, x, z) {
  let mesh;
  if (kind === 'ammo') {
    mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.35, 0.35),
      new THREE.MeshStandardMaterial({ color: 0x4b5d23, emissive: 0xffc107, emissiveIntensity: 0.6 })
    );
  } else {
    mesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.3),
      new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x00e5ff, emissiveIntensity: 0.9 })
    );
  }
  mesh.position.set(x, 0.8, z);
  scene.add(mesh);
  pickups.push({ kind, mesh, taken: false });
}

function updatePickups(dt, t) {
  for (const p of pickups) {
    if (p.taken) continue;
    p.mesh.rotation.y += dt * 2;
    p.mesh.position.y = 0.8 + Math.sin(t * 3 + p.mesh.position.x) * 0.08;
    const dx = p.mesh.position.x - player.pos.x;
    const dz = p.mesh.position.z - player.pos.z;
    if (dx * dx + dz * dz < 1.4 * 1.4) {
      p.taken = true;
      scene.remove(p.mesh);
      if (p.kind === 'ammo') {
        ammo[1] += CFG.weapons[1].pickup;
        ammo[2] += CFG.weapons[2].pickup;
        updateWeaponHud();
        showMsg(`+${CFG.weapons[1].pickup} pistola · +${CFG.weapons[2].pickup} escopeta`);
        beep(700, 0.12, 'triangle', 0.15);
      } else {
        player.boost = CFG.player.boostTime;
        showMsg('¡Velocidad aumentada!');
        beep(900, 0.2, 'triangle', 0.15);
      }
    }
  }
}

/* =====================================================================
   10. COLISIONES (círculo contra cajas)
   ===================================================================== */
function resolve(pos, r) {
  for (let it = 0; it < 2; it++) {
    for (const c of colliders) {
      const nx = Math.max(c.minX, Math.min(pos.x, c.maxX));
      const nz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
      let dx = pos.x - nx, dz = pos.z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2), push = r - d;
        pos.x += (dx / d) * push; pos.z += (dz / d) * push;
      } else {
        // el centro quedó dentro de la caja: sácalo por el lado más cercano
        const l = pos.x - c.minX, rr = c.maxX - pos.x, u = pos.z - c.minZ, dn = c.maxZ - pos.z;
        const m = Math.min(l, rr, u, dn);
        if (m === l) pos.x = c.minX - r; else if (m === rr) pos.x = c.maxX + r;
        else if (m === u) pos.z = c.minZ - r; else pos.z = c.maxZ + r;
      }
    }
  }
}

/* =====================================================================
   11. ENTRADA (teclado)
   ===================================================================== */
const keys = {};
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'Digit1') selectWeapon(1);
  if (e.code === 'Digit2') selectWeapon(2);
});
addEventListener('keyup', (e) => { keys[e.code] = false; });

const fwd = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
let bobT = 0;

function updatePlayer(dt) {
  camera.getWorldDirection(fwd);
  fwd.y = 0; fwd.normalize();
  right.crossVectors(fwd, up).normalize();

  let mx = 0, mz = 0;
  if (keys['KeyW']) mz += 1;
  if (keys['KeyS']) mz -= 1;
  if (keys['KeyD']) mx += 1;
  if (keys['KeyA']) mx -= 1;

  const moving = mx !== 0 || mz !== 0;
  if (moving) {
    const len = Math.hypot(mx, mz);
    const speed = (player.boost > 0 ? CFG.player.boostSpeed : CFG.player.speed) * dt;
    player.pos.x += ((fwd.x * mz + right.x * mx) / len) * speed;
    player.pos.z += ((fwd.z * mz + right.z * mx) / len) * speed;
    resolve(player.pos, CFG.player.radius);
    bobT += dt * 9;
  }
  player.pos.y = CFG.player.eyeHeight;   // altura fija (solo X y Z)

  if (player.boost > 0) {
    player.boost -= dt;
    hud.boost.style.display = 'block';
    if (player.boost <= 0) hud.boost.style.display = 'none';
  }

  // Movimiento del arma: balanceo al caminar + retroceso al disparar
  const w = weaponHolders[current];
  if (w) {
    const base = w.userData.basePos;
    w.position.set(
      base.x + (moving ? Math.sin(bobT) * 0.01 : 0),
      base.y + (moving ? Math.abs(Math.cos(bobT)) * 0.012 : 0),
      base.z + kick * 0.08
    );
    w.rotation.x = kick * 0.12;
  }
  kick = Math.max(0, kick - dt * 8);
  muzzle.intensity = Math.max(0, muzzle.intensity - dt * 600);
}

/* =====================================================================
   12. ACTUALIZAR ZOMBIS (RF05, RF09)
   ===================================================================== */
function updateZombies(dt, t) {
  for (const z of zombies) {
    if (z.mixer && z.state === 'active') z.mixer.update(dt);

    if (z.flash > 0) { z.flash -= dt; if (z.flash <= 0) clearFlash(z); }

    // Zombi muerto: cae al suelo y no hace nada más
    if (z.state === 'dead') {
      if (z.deathT < 1) {
        z.deathT = Math.min(1, z.deathT + dt * 2);
        z.holder.rotation.x = -z.deathT * (Math.PI / 2);
        z.holder.position.y = z.deathT * 0.15;
      }
      continue;
    }

    const p = z.holder.position;
    const dx = player.pos.x - p.x, dz = player.pos.z - p.z;
    const dist = Math.hypot(dx, dz);

    // Inactivo: se queda quieto hasta que el jugador entra en su rango
    if (z.state === 'idle') {
      z.body.rotation.z = Math.sin(t * 1.5 + p.x) * 0.04; // leve balanceo
      if (dist < CFG.zombie.detectRange) z.state = 'active';
      else continue;
    }

    // Activo: persigue al jugador
    z.body.rotation.z = 0;
    const nx = dx / dist, nz = dz / dist;
    p.x += nx * z.speed * dt;
    p.z += nz * z.speed * dt;

    // separación entre zombis para que no se amontonen
    for (const o of zombies) {
      if (o === z || o.state === 'dead') continue;
      const ox = p.x - o.holder.position.x, oz = p.z - o.holder.position.z;
      const d2 = ox * ox + oz * oz;
      if (d2 < 0.64 && d2 > 1e-6) { const d = Math.sqrt(d2); p.x += (ox / d) * 0.02; p.z += (oz / d) * 0.02; }
    }
    resolve(p, 0.4);
    z.holder.rotation.y = Math.atan2(nx, nz) + CFG.zombie.yawOffset;
    if (!z.mixer) z.body.position.y = Math.abs(Math.sin(t * 8 + p.x)) * 0.05; // paso simple

    // RF09: contacto = Game Over
    if (dist < CFG.catchDistance) { gameOver(); return; }
  }
}

/* =====================================================================
   13. FIN DEL JUEGO
   ===================================================================== */
function gameOver() {
  if (state !== 'playing') return;
  state = 'over';
  controls.unlock();
  beep(100, 0.8, 'sawtooth', 0.3);
  showOverlay('GAME OVER', 'red', 'Un zombi te atrapó.', 'Reiniciar partida', () => location.reload());
}
function victory() {
  if (state !== 'playing') return;
  state = 'won';
  controls.unlock();
  beep(600, 0.3, 'triangle', 0.2); setTimeout(() => beep(900, 0.5, 'triangle', 0.2), 250);
  showOverlay('¡MISIÓN COMPLETADA!', 'green', 'Has llegado a la zona de extracción.', 'Jugar de nuevo', () => location.reload());
}

/* =====================================================================
   14. BUCLE PRINCIPAL
   ===================================================================== */
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (state === 'playing') {
    cooldown = Math.max(0, cooldown - dt);
    updatePlayer(dt);
    updateZombies(dt, t);
    updatePickups(dt, t);

    // HUD
    const [zA, zB] = LEVEL.extractionZ;
    hud.dist.textContent = Math.max(0, Math.round(player.pos.z - zA));
    if (msgTimer > 0) { msgTimer -= dt; if (msgTimer <= 0) hud.msg.classList.remove('show'); }

    // Zona de extracción
    if (player.pos.z < zA && player.pos.z > zB - 20 && Math.abs(player.pos.x) < LEVEL.streetHalfWidth) victory();
  } else {
    updatePickups(dt, t);
  }

  renderer.render(scene, camera);
}

/* =====================================================================
   15. ARRANQUE
   ===================================================================== */
async function init() {
  const [w1, w2, zb] = await Promise.all([
    tryLoad(CFG.weapons[1].file),
    tryLoad(CFG.weapons[2].file),
    tryLoad(CFG.zombie.file)
  ]);
  models.weapon1 = w1; models.weapon2 = w2; models.zombie = zb;

  buildWorld();
  buildWeapons();
  LEVEL.zombies.forEach(([x, z], i) => spawnZombie(x, z, i));
  LEVEL.ammoBoxes.forEach(([x, z]) => spawnPickup('ammo', x, z));
  LEVEL.boosts.forEach(([x, z]) => spawnPickup('boost', x, z));
  updateWeaponHud();
  updateZombieCount();

  showOverlay(
    'OPERACIÓN EXTRACCIÓN', '',
    'El mundo fue invadido por zombis. Cruza la calle infestada, cuida tus balas y llega a la <b style="color:#34c759">zona verde</b> antes de que te atrapen.<br><br>' +
    '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> moverse · <b>Mouse</b> mirar · <b>Clic</b> disparar<br>' +
    '<kbd>1</kbd> Pistola · <kbd>2</kbd> Escopeta<br>' +
    'Cada zombi muere con 2 impactos. Recoge cajas para recuperar munición.',
    'JUGAR',
    () => {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      controls.lock();
    }
  );
}

controls.addEventListener('lock', () => {
  if (state === 'menu') state = 'playing';
  if (state === 'playing') hideOverlay();
});
controls.addEventListener('unlock', () => {
  if (state === 'playing') {
    showOverlay('PAUSA', '', 'Haz clic para continuar.', 'Continuar', () => controls.lock());
  }
});

init();
animate();
