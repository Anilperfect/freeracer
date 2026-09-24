#!/usr/bin/env node
/**
 * FreeRacer headless smoke test.
 *
 * Boots index.html inside jsdom with real Three.js math (r128) and a stubbed
 * WebGLRenderer, then drives the game through the main flows for a number of
 * simulated frames. Reports every console error / uncaught exception.
 *
 * Usage:  node tools/smoke-test.js [--frames=600] [--verbose]
 *
 * Requires (installed in a scratch dir, NOT in the repo):
 *   npm install jsdom@24 three@0.128.0
 * Set FREERACER_NODE_MODULES to that scratch node_modules folder.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const args = process.argv.slice(2);
const getArg = (name, def) => {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : def;
};
const FRAMES = parseInt(getArg('frames', '600'), 10);
const VERBOSE = args.includes('--verbose');
const MODULES = process.env.FREERACER_NODE_MODULES || path.join(__dirname, '..', 'node_modules');

const { JSDOM, VirtualConsole } = require(path.join(MODULES, 'jsdom'));

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const errors = [];
const warnings = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('error', (...a) => { errors.push(a.map(String).join(' ')); if (VERBOSE) console.log('[console.error]', ...a); });
virtualConsole.on('warn', (...a) => { warnings.push(a.map(String).join(' ')); if (VERBOSE) console.log('[console.warn]', ...a); });
virtualConsole.on('log', (...a) => { if (VERBOSE) console.log('[console.log]', ...a); });
virtualConsole.on('jsdomError', (e) => { errors.push('jsdomError: ' + (e && e.message ? e.message : String(e))); if (VERBOSE) console.log('[jsdomError]', e); });

const dom = new JSDOM(html, {
  url: 'http://localhost/',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
  virtualConsole
});
const { window } = dom;

// ── Browser API stubs ──────────────────────────────────────────────────────
window.localStorage.clear();
window.performance = window.performance || { now: () => Date.now() };
window.fetch = () => Promise.reject(new Error('offline'));
window.WebSocket = class { constructor() { this.readyState = 3; } send() {} close() {} };
window.AudioContext = undefined; // audio.js must cope without WebAudio
window.webkitAudioContext = undefined;
window.speechSynthesis = { speak() {}, cancel() {}, getVoices() { return []; } };
window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
window.navigator.getGamepads = () => [];
window.requestAnimationFrame = (cb) => setTimeout(() => cb(window.performance.now()), 0);
window.cancelAnimationFrame = (id) => clearTimeout(id);
window.HTMLCanvasElement.prototype.getContext = function (type) {
  if (type === '2d') {
    const noop = () => {};
    const gradient = { addColorStop: noop };
    return new Proxy({}, {
      get: (t, k) => {
        if (k === 'canvas') return this;
        if (k === 'measureText') return () => ({ width: 10 });
        if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => gradient;
        if (k === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
        if (k === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
        return noop;
      },
      set: () => true
    });
  }
  return null;
};

// ── Three.js (real math, stubbed GPU) ──────────────────────────────────────
const THREE = require(path.join(MODULES, 'three', 'build', 'three.js'));
class StubRenderer {
  constructor() {
    this.domElement = window.document.createElement('canvas');
    this.shadowMap = { enabled: false, type: 0 };
    this.toneMapping = 0; this.toneMappingExposure = 1; this.outputEncoding = 0;
    this.capabilities = { isWebGL2: true, maxTextures: 16, getMaxAnisotropy: () => 1 };
    this.info = { render: { calls: 0, triangles: 0 }, memory: { geometries: 0, textures: 0 } };
    this.autoClear = true; this.renderCalls = 0;
    this._pr = 1; this._size = new THREE.Vector2(1280, 720);
  }
  setSize(w, h) { this._size.set(w, h); }
  getSize(t) { return (t || new THREE.Vector2()).copy(this._size); }
  setPixelRatio(p) { this._pr = p; }
  getPixelRatio() { return this._pr; }
  setClearColor() {} setRenderTarget() {} getRenderTarget() { return null; } clear() {} clearDepth() {}
  render(scene) {
    this.renderCalls++;
    // touch every object's world matrix so hidden math bugs (NaN) surface
    scene.updateMatrixWorld(true);
  }
  dispose() {} setAnimationLoop() {} getContext() { return {}; } compile() {}
  getDrawingBufferSize(t) { return (t || new THREE.Vector2()).copy(this._size); }
  setViewport() {} setScissor() {} setScissorTest() {} readRenderTargetPixels() {}
}
THREE.WebGLRenderer = StubRenderer;
// WebGLRenderTarget must exist for post-processing lib; stub lightly.
THREE.WebGLRenderTarget = class { constructor(w, h) { this.width = w; this.height = h; this.texture = new THREE.Texture(); } setSize() {} dispose() {} };
THREE.WebGLMultisampleRenderTarget = THREE.WebGLRenderTarget;
window.THREE = THREE;

// ── Load scripts in the same order as index.html ───────────────────────────
const scriptSrcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
const localScripts = scriptSrcs.filter(s => !/^https?:/.test(s));
const ctx = dom.getInternalVMContext();
for (const src of localScripts) {
  const code = fs.readFileSync(path.join(ROOT, src), 'utf8');
  try {
    vm.runInContext(code, ctx, { filename: src });
  } catch (e) {
    errors.push(`Script load failure in ${src}: ${e.stack || e}`);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const doc = window.document;
const click = (id) => {
  const el = doc.getElementById(id);
  if (!el) { errors.push(`Missing element #${id}`); return false; }
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  return true;
};
const key = (code, down = true) => {
  // Dispatch on window (where the game listens); dispatching on document would bubble and fire twice.
  window.dispatchEvent(new window.KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true }));
};
const visible = (id) => {
  const el = doc.getElementById(id);
  if (!el) return false;
  const inlineHidden = el.style.display === 'none';
  return !inlineHidden && !el.classList.contains('hidden');
};
const report = (label, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  — ' + extra : ''}`);
  if (!ok) process.exitCode = 1;
};

// ── Drive the game ─────────────────────────────────────────────────────────
const frames = async (n, fn) => { for (let f = 0; f < n; f++) { await sleep(0); if (fn) fn(f); } };
const waitFor = async (pred, ms = 8000) => { const t0 = Date.now(); while (!pred()) { if (Date.now() - t0 > ms) return false; await sleep(5); } return true; };

(async () => {
  window.addEventListener('error', (e) => errors.push('window.onerror: ' + (e.message || e)));
  // jsdom fires DOMContentLoaded asynchronously once parsing completes; only dispatch
  // manually if it never arrives (a second dispatch would boot two GameEngine instances).
  const booted = await waitFor(() => !!window.Game, 1500);
  if (!booted) doc.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));
  await sleep(50);

  const Game = window.Game;
  report('GameEngine constructed', !!Game);
  if (!Game) { finish(); return; }

  // ── A. Title → main menu ────────────────────────────────────────────────
  report('Boot state is TITLE', Game.gameState === 'TITLE', `state=${Game.gameState}`);
  const built = await waitFor(() => Game.mainMenu && Game.mainMenu.worldReady, 20000);
  report('Open world built on title screen', built, built ? `${Game.openWorld.buildMs.toFixed(0)} ms, ${Game.openWorld.world.stats.buildings} buildings, ${Game.openWorld.world.stats.drawCalls} draw calls` : 'timeout');
  await frames(20);
  key('Space');
  await sleep(20);
  report('Any key → MAIN_MENU', Game.gameState === 'MAIN_MENU', `state=${Game.gameState}`);
  await frames(30); // menu cinematic frames (menu traffic)

  // ── B. Free roam ────────────────────────────────────────────────────────
  click('btn-mm-drive');
  await sleep(30);
  const ow = Game.openWorld;
  report('DRIVE → FREE_ROAM with player', Game.gameState === 'FREE_ROAM' && !!ow.player && ow.active, `state=${Game.gameState}`);
  report('Traffic spawned', !!ow.traffic && ow.traffic.cars.length > 0, `${ow.traffic ? ow.traffic.cars.length : 0} cars`);

  key('KeyW', true);
  let maxSpeed = 0; let nan = 0; let minY = Infinity; let maxY = -Infinity;
  await frames(FRAMES, (f) => {
    const p = ow.player.position;
    if (![p.x, p.y, p.z, ow.player.yaw].every(Number.isFinite)) nan++;
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    maxSpeed = Math.max(maxSpeed, ow.player.getSpeedKmh());
    if (f === Math.floor(FRAMES / 2)) key('KeyA', true);
    if (f === Math.floor(FRAMES / 2) + 40) { key('KeyA', false); key('ShiftLeft', true); }
  });
  key('KeyW', false); key('ShiftLeft', false);
  report('Free roam: player accelerates', maxSpeed > 10, `max ${maxSpeed} km/h after ${ow.time.toFixed(2)} s simulated (${FRAMES} frames)`);
  report('Free roam: no NaN / stays on ground', nan === 0 && minY > -1 && maxY < 6, `nan=${nan} y∈[${minY.toFixed(2)}, ${maxY.toFixed(2)}]`);
  {
    const cam = Game.camera.position; const pp = ow.player.position; const fwd = ow.player.getForwardVector();
    const rel = new window.THREE.Vector3().subVectors(cam, pp);
    const behind = rel.x * fwd.x + rel.z * fwd.z < 0;
    report('Chase camera sits behind and above the car', behind && cam.y > pp.y + 0.5 && rel.length() < 30, `offset (${rel.x.toFixed(1)}, ${rel.y.toFixed(1)}, ${rel.z.toFixed(1)})`);
  }

  // Optional soak: step the fixed-rate simulation directly for N simulated seconds
  const SOAK = parseInt(getArg('soak', '0'), 10);
  if (SOAK > 0) {
    const t0 = Date.now();
    let steps = 0; let bad = 0; let maxKmh = 0; let hits = 0; let minTraffic = Infinity; let maxTrafficSpeed = 0; let outOfBounds = 0;
    const bnd = ow.district.bounds;
    const rnd = (() => { let x = 12345; return () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; }; })();
    let steer = 0; let nitro = false; let hb = false;
    for (let t = 0; t < SOAK * 120; t++) {
      if (t % 90 === 0) { steer = (rnd() - 0.5) * 1.6; nitro = rnd() < 0.2; hb = rnd() < 0.08; }
      ow.fixedStep(1 / 120, { throttle: 1, brake: 0, steer, handbrake: hb, nitro, reset: false });
      steps++;
      const p = ow.player.position;
      if (![p.x, p.y, p.z, ow.player.yaw, ow.player.speed].every(Number.isFinite)) bad++;
      if (p.x < bnd.minX - 30 || p.x > bnd.maxX + 30 || p.z < bnd.minZ - 30 || p.z > bnd.maxZ + 260) outOfBounds++;
      maxKmh = Math.max(maxKmh, ow.player.getSpeedKmh());
      if (ow.player.lastImpactTime !== undefined && ow.player.lastImpactTime === ow.time) hits++;
      const active = ow.traffic.cars.filter((c) => c.active);
      minTraffic = Math.min(minTraffic, active.length);
      active.forEach((c) => { maxTrafficSpeed = Math.max(maxTrafficSpeed, c.speed); if (![c.position.x, c.position.z].every(Number.isFinite)) bad++; });
    }
    const wall = Date.now() - t0;
    report(`Soak ${SOAK}s: no NaN, stays in district`, bad === 0 && outOfBounds === 0, `${steps} steps in ${wall} ms (${(wall / steps).toFixed(3)} ms/step) max ${maxKmh.toFixed(0)} km/h traffic≥${minTraffic} active, traffic max ${(maxTrafficSpeed * 3.6).toFixed(0)} km/h, oob=${outOfBounds}`);
    key('KeyR'); await frames(3);
  }

  // building collision: drive straight into the nearest building
  const b = ow.world.buildings.reduce((best, bb) => { const d = Math.hypot(bb.x - ow.player.position.x, bb.z - ow.player.position.z); return d < best.d ? { d, bb } : best; }, { d: Infinity, bb: null }).bb;
  if (b) {
    ow.player.teleport(b.x + b.hx + 18, b.z, Math.atan2(-1, 0)); // face −x toward the building
    key('KeyW', true);
    await frames(240);
    key('KeyW', false);
    const px = ow.player.position.x; const pz = ow.player.position.z;
    const inside = Math.abs(px - b.x) < b.hx - 0.5 && Math.abs(pz - b.z) < b.hz - 0.5;
    report('Building collision blocks player', !inside && Number.isFinite(px), `player at (${px.toFixed(1)}, ${pz.toFixed(1)}) building x∈±${b.hx} around ${b.x}`);
  }

  // reset to road
  key('KeyR'); await frames(5);
  const near = ow.network.nearestRoadPoint(ow.player.position.x, ow.player.position.z, 40);
  report('R resets onto a road', !!near && near.dist < near.edge.halfWidth + 1, near ? `dist ${near.dist.toFixed(1)} m` : 'no road nearby');

  // ── C. Event: approach marker → E → countdown → run → finish ────────────
  const ev = ow.events.events[0];
  ow.player.teleport(ev.marker.x - ev.marker.dx * 2, ev.marker.z - ev.marker.dz * 2, Math.atan2(ev.marker.dx, ev.marker.dz));
  await frames(10);
  report('Event prompt appears near marker', visible('ow-prompt') && ow.nearEvent && ow.nearEvent.id === ev.id, `prompt="${doc.getElementById('ow-prompt-text').textContent}"`);
  key('KeyE');
  await sleep(10);
  report('E starts countdown', ow.events.state === 'countdown', `state=${ow.events.state}`);
  report('Rivals placed on grid', ow.events.rivals.length === (ev.def || ev).opponents, `${ow.events.rivals.length} rivals`);
  await waitFor(() => ow.events.state === 'running', 6000);
  report('Countdown → running', ow.events.state === 'running', `state=${ow.events.state}`);

  key('KeyW', true);
  await frames(240);
  const rivalsMoving = ow.events.rivals.every((ai) => ai.physics.speed > 3 && Number.isFinite(ai.physics.position.x));
  report('AI rivals drive', rivalsMoving, ow.events.rivals.map((ai) => `${ai.name}:${ai.physics.getSpeedKmh()}km/h`).join(' '));
  const hudState = ow.events.getHudState();
  report('Event HUD state', !!hudState && hudState.time > 0.05 && hudState.checkpoints > 0, hudState ? `t=${hudState.time.toFixed(1)} cp=${hudState.checkpoint}/${hudState.checkpoints} pos=${hudState.position}` : 'none');

  // teleport through every gate (just past each checkpoint, heading along its direction)
  const cashBefore = window.SaveManager.getCash(); const repBefore = window.SaveManager.getReputation();
  let gatesPassed = 0;
  for (let i = ow.events.playerCheckpoint; i < ev.checkpoints.length; i++) {
    const cp = ev.checkpoints[i];
    ow.player.teleport(cp.x + cp.dx * 1.5, cp.z + cp.dz * 1.5, Math.atan2(cp.dx, cp.dz));
    ow.player.velocity.set(cp.dx * 12, 0, cp.dz * 12); ow.player.speed = 12;
    const ok = await waitFor(() => ow.events.state !== 'running' || ow.events.playerCheckpoint > i, 1500);
    if (ok) gatesPassed++;
    if (ow.events.state !== 'running') break;
  }
  report('Checkpoint gates register', gatesPassed === ev.checkpoints.length, `${gatesPassed}/${ev.checkpoints.length}`);
  key('KeyW', false);
  await sleep(50);
  report('Player finishes event → results', ow.events.state === 'results' && ow.resultsOpen && visible('ow-results'), `state=${ow.events.state} pos="${doc.getElementById('ow-results-position').textContent}" time=${doc.getElementById('ow-results-time').textContent}`);
  const cashAfter = window.SaveManager.getCash(); const repAfter = window.SaveManager.getReputation();
  report('Event rewards credited (credits + reputation)', cashAfter > cashBefore && repAfter > repBefore, `₡${cashBefore}→${cashAfter} rep ${repBefore}→${repAfter}`);
  const rec = window.SaveManager.getEventRecord(ev.id);
  report('Event record saved', !!rec && rec.bestTime > 0 && rec.plays === 1, JSON.stringify(rec));
  report('Results: AI standings listed', doc.getElementById('ow-results-standings').children.length === (ev.def || ev).opponents + 1, `${doc.getElementById('ow-results-standings').children.length} rows`);
  await frames(30); // results frames

  click('btn-ow-results-continue');
  await sleep(10);
  report('Continue → back to free roam', ow.events.state === 'idle' && !ow.resultsOpen && !ow.paused, `state=${ow.events.state}`);
  report('Event markers refreshed (unlock by rep)', ow.events.events.filter((e) => e.unlocked).length >= 1);

  // ── D. Pause menu / settings / garage ───────────────────────────────────
  key('Escape'); await sleep(5);
  report('ESC opens pause menu', ow.paused && visible('ow-pause'));
  click('btn-ow-settings'); await sleep(5);
  report('Pause → settings modal', Game.gameState === 'PAUSED' && doc.getElementById('settings-modal').style.display === 'flex');
  key('Escape'); await sleep(5);
  report('ESC from settings returns to pause menu', Game.gameState === 'FREE_ROAM' && ow.pauseMenuOpen && visible('ow-pause'), `state=${Game.gameState} pauseOpen=${ow.pauseMenuOpen}`);
  key('Escape'); await sleep(5);
  report('ESC resumes', !ow.paused && !visible('ow-pause'));
  await frames(5);

  key('Escape'); await sleep(5);
  click('btn-ow-garage'); await sleep(30);
  report('Pause → GARAGE', Game.gameState === 'WORKSHOP' && visible('workshop-screen') && !ow.active, `state=${Game.gameState}`);
  await frames(20);
  click('btn-ws-drive'); await sleep(30);
  report('Garage DRIVE → back in world at garage', Game.gameState === 'FREE_ROAM' && ow.active && Math.hypot(ow.player.position.x - ow.district.garage.spawn.x, ow.player.position.z - ow.district.garage.spawn.z) < 5, `state=${Game.gameState}`);
  await frames(20);
  ow.persistPosition(true);
  const savedPos = window.SaveManager.getProfile().progress.lastPosition;
  report('Last position persisted', !!savedPos && Number.isFinite(savedPos.x), JSON.stringify(savedPos));

  // discovery pickup
  const disc = ow.district.discoveries[0];
  ow.player.teleport(disc.x, disc.z, 0);
  await waitFor(() => window.SaveManager.hasDiscovery(disc.id), 1500);
  report('Discovery collected', window.SaveManager.hasDiscovery(disc.id), disc.name);

  // camera / map hotkeys
  const camBefore = ow.chaseCamera.currentModeIndex;
  key('KeyC'); await frames(3);
  report('C cycles camera mode', ow.chaseCamera.currentModeIndex !== camBefore, `${camBefore} → ${ow.chaseCamera.currentModeIndex}`);
  key('KeyM'); await frames(3);
  report('M toggles full map', ow.hud.bigMap === true);
  key('KeyM'); key('KeyN'); await frames(3);
  report('N toggles minimap rotation', ow.hud.rotate === false && ow.hud.bigMap === false);
  key('KeyN'); await frames(3);

  key('Escape'); await sleep(5);
  click('btn-ow-main-menu'); await sleep(30);
  report('Pause → MAIN MENU', Game.gameState === 'MAIN_MENU' && !ow.active && visible('main-menu'), `state=${Game.gameState}`);
  await frames(10);

  // ── D2. Phase 2: roster, parts, tuning, test drive ──────────────────────
  {
    const SM = window.SaveManager; const US = window.UpgradeSystem;
    report('UpgradeSystem + PartsCatalog loaded', !!US && !!window.PartsCatalog && US.catalog.categories.length === 8, US ? `${US.catalog.categories.length} categories` : 'missing');
    report('Roster has 10 cars across manufacturers', window.CarDatabase.length >= 10 && new Set(window.CarDatabase.map(c => c.manufacturer)).size >= 6, `${window.CarDatabase.length} cars, ${new Set(window.CarDatabase.map(c => c.manufacturer)).size} makers`);
    // every car builds a mesh + physics modifiers without throwing
    let built = 0; const errs = [];
    window.CarDatabase.forEach((c) => {
      try {
        const m = new window.CarModel(c.colorHex, false, c.id, 0);
        const mods = US.getModifiers(c.id);
        if (m.group && Number.isFinite(mods.power) && mods.power > 0) built++;
        m.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      } catch (e) { errs.push(`${c.id}: ${e.message}`); }
    });
    report('All cars build a model + modifier set', built === window.CarDatabase.length && errs.length === 0, errs[0] || `${built}/${window.CarDatabase.length}`);

    // garage from menu → parts tab renders 8 rows with stage pips
    click('btn-mm-garage'); await sleep(30);
    const ws = Game.workshop;
    report('Main menu → GARAGE', Game.gameState === 'WORKSHOP' && visible('workshop-screen'), `state=${Game.gameState}`);
    const rows = doc.querySelectorAll('#ws-upgrade-rows .ws-part');
    const statBars = doc.querySelectorAll('#ws-live-stats .ws-stat');
    report('Garage shows 8 part categories + 6 live stat bars', rows.length === 8 && statBars.length === 6, `${rows.length} rows, ${statBars.length} bars`);

    const carId = ws.allCars[ws.carIndex].id;
    const prBefore = US.calculatePR(carId);
    const cashBefore = SM.getCash();
    const cost = US.getNextStageCost(carId, 'engine');
    SM.addCash(Math.max(0, cost - cashBefore + 100));
    ws.updateUI();
    const installBtn = doc.querySelector('#ws-upgrade-rows .ws-install[data-cat="engine"]');
    report('Engine INSTALL button enabled once affordable', !!installBtn && !installBtn.disabled && installBtn.classList.contains('ok'), installBtn ? installBtn.textContent : 'missing');
    installBtn.dispatchEvent(new window.MouseEvent('mouseenter', { bubbles: true }));
    const previewDelta = doc.querySelector('#ws-live-stats .ws-delta.up');
    report('Hovering a part previews stat gains', !!previewDelta, previewDelta ? previewDelta.textContent : 'no delta shown');
    installBtn.click(); await sleep(5);
    const cashAfter = SM.getCash();
    report('Installing engine stage 1 spends credits + raises PR', US.getParts(carId).engine === 1 && cashAfter === cashBefore + Math.max(0, cost - cashBefore + 100) - cost && US.calculatePR(carId) > prBefore, `PR ${prBefore} → ${US.calculatePR(carId)}, cost ₡${cost}`);
    const mods = US.getModifiers(carId);
    report('Engine stage 1 modifies power (>1) and mass (≥1)', mods.power > 1.0 && mods.mass >= 1.0, `power ×${mods.power.toFixed(3)} mass ×${mods.mass.toFixed(3)}`);
    // trade-off: max aero should cut top speed
    const aeroPreview = US.getModifiers(carId, { previewCategory: 'aero' });
    const aeroBad = window.UpgradeSystem.constructor.describeEffects(US.getNextStage(carId, 'aero').effects).some((e) => !e.good);
    report('Aero preview shows trade-off (grip ↑, drag ↑ flagged as downside)', aeroPreview.grip > mods.grip && aeroPreview.drag > mods.drag && aeroBad, `grip ×${aeroPreview.grip.toFixed(3)} drag ×${aeroPreview.drag.toFixed(3)}`);

    // tuning: preset + slider + persistence
    click('ws-subtab-tuning'); await sleep(5);
    report('TUNING sub-tab shows 5 sliders + 5 presets', doc.querySelectorAll('#ws-tuning-panel input[type=range]').length === 5 && doc.querySelectorAll('#ws-tuning-panel .ws-preset').length === 5 && doc.getElementById('ws-tuning-panel').style.display === 'block');
    doc.querySelector('#ws-tuning-panel .ws-preset[data-preset="drift"]').click(); await sleep(5);
    report('Drift preset applies rear brake bias', US.activePresetId(carId) === 'drift' && US.getTuning(carId).brakeBias < 0, JSON.stringify(US.getTuning(carId)));
    const slider = doc.querySelector('#ws-tuning-panel input[data-slider="downforce"]');
    slider.value = '1'; slider.dispatchEvent(new window.Event('input', { bubbles: true })); slider.dispatchEvent(new window.Event('change', { bubbles: true }));
    report('Downforce slider change stored (custom setup)', US.getTuning(carId).downforce === 1 && US.activePresetId(carId) === null);
    const tuned = US.getModifiers(carId); const untuned = US.getModifiers(carId, { tuning: { downforce: 0 } });
    report('High downforce tuning: drag ↑ grip ↑ vs untuned', tuned.drag > untuned.drag && tuned.grip > untuned.grip && US.getDisplayStats(carId).topSpeed <= US.getDisplayStats(carId, { tuning: { downforce: 0 } }).topSpeed, `drag ×${tuned.drag.toFixed(3)} grip ×${tuned.grip.toFixed(3)}`);
    const rawSave = JSON.parse(window.localStorage.getItem(SM.storageKey));
    report('Parts + tuning persisted in save', rawSave.parts && rawSave.parts[carId] && rawSave.parts[carId].engine === 1 && rawSave.tuning && rawSave.tuning[carId] && rawSave.tuning[carId].downforce === 1);

    // legacy migration: old-style upgrade levels become stages
    {
      const sm3 = new SM.constructor();
      sm3.profile.parts = {}; sm3.profile.tuning = {}; sm3.profile.partsMigrated = false;
      sm3.profile.upgrades = { veloce_v10_corsa: { acceleration: 10, tireGrip: 5, braking: 1, nitroCapacity: 6 } };
      const savedRef = window.SaveManager; window.SaveManager = sm3;
      US.ensureProfile(sm3.profile);
      window.SaveManager = savedRef;
      report('Legacy 10-level upgrades migrate to stages', sm3.profile.partsMigrated === true && sm3.profile.parts.veloce_v10_corsa.engine === 5 && sm3.profile.parts.veloce_v10_corsa.tires >= 2 && sm3.profile.parts.veloce_v10_corsa.nitro >= 2, JSON.stringify(sm3.profile.parts.veloce_v10_corsa));
    }

    // test drive a locked car
    click('ws-subtab-parts'); await sleep(5);
    const lockedIdx = ws.allCars.findIndex((c) => !SM.isCarUnlocked(c.id));
    ws.carIndex = lockedIdx; ws.updateUI(); await sleep(5);
    const lockedCar = ws.allCars[lockedIdx];
    const lockedInstall = doc.querySelector('#ws-upgrade-rows .ws-install[data-cat="engine"]');
    report('Locked car: install disabled, TEST DRIVE + PURCHASE shown', lockedInstall && lockedInstall.disabled && !doc.getElementById('btn-test-drive').classList.contains('hidden') && doc.getElementById('btn-select-car').textContent.startsWith('PURCHASE'), lockedCar.name);
    click('btn-test-drive'); await sleep(30);
    report('TEST DRIVE → free roam in the locked car, events disabled', Game.gameState === 'FREE_ROAM' && ow.active && ow.testDrive === true && ow.playerCarId === lockedCar.id && SM.getSelectedCarId() !== lockedCar.id, `car=${ow.playerCarId} selected=${SM.getSelectedCarId()}`);
    const evTest = ow.events.events.find((e) => e.unlocked);
    ow.player.teleport(evTest.marker.x - evTest.marker.dx * 2, evTest.marker.z - evTest.marker.dz * 2, Math.atan2(evTest.marker.dx, evTest.marker.dz));
    await frames(10);
    key('KeyE'); await frames(3);
    report('Test drive cannot start events', ow.events.state === 'idle' && ow.prompt && /test drive/i.test(ow.prompt.text || ''), ow.prompt ? ow.prompt.text : 'no prompt');
    ow.enterGarage(); await sleep(30);
    report('Test drive → garage focuses the tested car', Game.gameState === 'WORKSHOP' && ws.allCars[ws.carIndex].id === lockedCar.id, `state=${Game.gameState} car=${ws.allCars[ws.carIndex].id}`);
    click('btn-ws-main-menu'); await sleep(30);
    report('Garage → MAIN MENU', Game.gameState === 'MAIN_MENU', `state=${Game.gameState}`);
    await frames(10);
  }

  // ── D3. Phase 3+: districts, drift, championships, caches, settings ──────
  {
    const SM = window.SaveManager; const R = window.DistrictRegistry;
    const totals = R.totals();
    report('Registry: 3 districts, 12 events, 20 discoveries', !!R && totals.districts === 3 && totals.events === 12 && totals.discoveries === 20, JSON.stringify(totals));
    const rep0 = SM.getReputation();
    report('Harborline locked below 1500 REP', R.isUnlocked('apex_downtown') && !R.isUnlocked('harborline') && !R.isUnlocked('sunspire_coast'), `rep=${rep0}`);
    SM.addReputation(Math.max(0, 1600 - rep0));
    report('1500 REP unlocks Harborline only', R.isUnlocked('harborline') && !R.isUnlocked('sunspire_coast'), `rep=${SM.getReputation()}`);
    SM.addReputation(Math.max(0, 3600 - SM.getReputation()));
    report('3500 REP unlocks Sunspire Coast', R.unlocked().length === 3, R.unlocked().map((e) => e.id).join(','));

    click('btn-mm-drive'); await sleep(30);
    report('DRIVE after unlocks', Game.gameState === 'FREE_ROAM' && ow.active, `district=${ow.districtId}`);
    key('Escape'); await sleep(5);
    const sel = doc.getElementById('ow-district-select');
    report('Pause travel dropdown lists 3 districts', !!sel && sel.options.length === 3, sel ? `${sel.options.length} options` : 'missing');
    report('Pause stats show district totals', /3 districts/.test(doc.getElementById('ow-pause-stats').textContent), doc.getElementById('ow-pause-stats').textContent);
    sel.value = 'harborline';
    click('btn-ow-travel'); await sleep(30);
    if (ow.paused) { key('Escape'); await sleep(5); }
    report('Fast travel → Harborline rebuilt at garage', ow.districtId === 'harborline' && ow.world.stats.buildings > 50 && !ow.paused && Math.hypot(ow.player.position.x - ow.district.garage.spawn.x, ow.player.position.z - ow.district.garage.spawn.z) < 6, `${ow.world.stats.buildings} buildings`);
    key('KeyW', true);
    let d3nan = 0;
    await frames(60, () => { if (![ow.player.position.x, ow.player.position.z, ow.player.yaw].every(Number.isFinite)) d3nan++; });
    key('KeyW', false);
    report('Harborline: no NaN over 60 frames', d3nan === 0);

    // neon cache pickup
    const cache = ow.district.caches.find((c) => !SM.hasCache(c.id));
    const cash0 = SM.getCash();
    ow.player.teleport(cache.x + 3, cache.z, 0);
    await waitFor(() => SM.hasCache(cache.id), 1500);
    report('Neon cache collected (+credits)', SM.hasCache(cache.id) && SM.getCash() > cash0, `${cache.name} ₡${cash0}→${SM.getCash()}`);

    // sunspire: sand surface + drift event
    ow.switchDistrict('sunspire_coast', 'garage'); await sleep(30);
    report('Fast travel → Sunspire Coast', ow.districtId === 'sunspire_coast' && ow.world.stats.buildings > 50, `${ow.world.stats.buildings} buildings`);
    report('Beach strip reads as sand', ow.world.surfaceAt(0, 430) === 'sand' && ow.world.surfaceAt(0, 350) !== 'sand', `430→${ow.world.surfaceAt(0, 430)} 350→${ow.world.surfaceAt(0, 350)}`);
    SM.addReputation(Math.max(0, 4600 - SM.getReputation()));
    ow.events.refreshMarkerLocks();
    const dev = ow.events.events.find((e) => ((e.def || e).type === 'drift') && e.unlocked);
    report('Drift event unlocked with gold target', !!dev && (dev.def || dev).driftTargets.gold === 1500, dev ? dev.id : 'none');
    ow.player.teleport(dev.marker.x - dev.marker.dx * 2, dev.marker.z - dev.marker.dz * 2, Math.atan2(dev.marker.dx, dev.marker.dz));
    await frames(10);
    report('Drift prompt shows target score', visible('ow-prompt') && /1,?500/.test(doc.getElementById('ow-prompt-sub').textContent), `"${doc.getElementById('ow-prompt-sub').textContent}"`);
    key('KeyE'); await sleep(10);
    report('E starts drift countdown', ow.events.state === 'countdown', `state=${ow.events.state}`);
    await waitFor(() => ow.events.state === 'running', 6000);
    const dhs = ow.events.getHudState();
    report('Drift HUD state exposes score + targets', !!dhs && dhs.type === 'drift' && typeof dhs.driftScore === 'number' && dhs.driftTargets.gold === 1500, dhs ? `score=${dhs.driftScore}` : 'none');
    key('Escape'); await sleep(5);
    click('btn-ow-quit-event'); await sleep(10);
    report('Abandon drift → back to free roam', ow.events.state === 'idle' && !ow.paused, `state=${ow.events.state}`);

    // championships (Neon Coast Cup: P1 + P2 + P1 = 27 pts)
    const champs = window.getChampionshipsForEvent('apex_plaza_sprint');
    report('Neon Coast Cup includes plaza sprint', champs.length === 1 && champs[0].id === 'neon_coast_cup');
    const cup = window.getChampionshipById('neon_coast_cup');
    SM.recordChampionshipResult(cup, 'apex_plaza_sprint', 1);
    SM.recordChampionshipResult(cup, 'apex_harbor_run', 2);
    const cupFinal = SM.recordChampionshipResult(cup, 'apex_plaza_circuit', 1);
    report('Championship completes with best-position points', cupFinal.completed === true && cupFinal.points === 27 && cupFinal.firstCompletion === true, `${cupFinal.points} pts`);

    // map filter hotkeys
    key('Digit1'); await frames(3);
    const fOff = ow.hud.filters.events === false;
    key('Digit1'); await frames(3);
    report('Digit1 toggles event markers', fOff && ow.hud.filters.events === true);

    // day/night + weather
    ow.timeOfDay = 1.5; ow.applyTimeOfDay(); await frames(2);
    report('Night lighting applies (night peak + clock)', ow.nightFactor(1.5) > 0.9 && ow.nightFactor(12) < 0.2 && ow.clockString() === '01:30', `clock=${ow.clockString()} night=${ow._nightFactor.toFixed(2)}`);
    ow.rollFreeRoamWeather(true);
    report('Weather roll yields a valid state', ['clear', 'fog', 'rain'].includes(ow._weatherKind), ow._weatherKind);

    // remappable controls
    const C = window.FreeRacerControls;
    const conflict = C.rebind('accelerate', 'KeyT', 0);
    const rebound = C.matches('accelerate', 'KeyT');
    C.reset();
    report('Rebind + reset round-trips', rebound && conflict.ok && C.matches('accelerate', 'KeyW') && !C.matches('accelerate', 'KeyT'));

    // accessibility
    const A = window.Accessibility;
    A.set('colorblind', 'deuteranopia'); A.set('textScale', 1.3); A.set('reduceMotion', true); A.set('subtitles', true);
    const sh0 = ow.chaseCamera.shakeIntensity;
    ow.chaseCamera.addShake(1);
    A.subtitle('D3 test caption');
    report('Accessibility applies (palette, text, motion, captions)', window.EventSystem.COLORS.marker === 0x00bfff && doc.documentElement.style.fontSize === '20.8px' && doc.body.classList.contains('fr-reduce-motion') && ow.chaseCamera.shakeIntensity === sh0 && doc.getElementById('ow-subtitles').textContent === 'D3 test caption', `shake ${sh0}→${ow.chaseCamera.shakeIntensity}`);
    A.set('colorblind', 'none'); A.set('textScale', 1); A.set('reduceMotion', false);

    // truck roster entry
    const truck = window.getCarById('ironclad_ridgeback');
    let truckBuilt = false;
    try { const tm = new window.CarModel(truck.colorHex, false, truck.id, 0); truckBuilt = !!tm.group; tm.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); } catch (e) { errors.push('truck build threw: ' + e.message); }
    report('Ironclad Ridgeback truck builds', !!truck && truck.bodyStyle === 'truck' && truckBuilt, truck ? `${truck.name} ${truck.engine.drivetrain}` : 'missing');

    key('Escape'); await sleep(5);
    click('btn-ow-main-menu'); await sleep(30);
    report('D3 → MAIN MENU', Game.gameState === 'MAIN_MENU' && !ow.active, `state=${Game.gameState}`);
    await frames(10);
  }

  // ── E. Circuit events (legacy flow) ─────────────────────────────────────
  click('btn-mm-circuits'); await sleep(30);
  report('Menu → circuit map select', Game.gameState === 'MAP_SELECT' && visible('map-select-screen'), `state=${Game.gameState}`);
  const mapId = (window.MapDatabase && window.MapDatabase[0] && window.MapDatabase[0].id) || 'emerald_highway';
  try { Game.startRaceFromMapSelect(Game.selectedCarId, mapId, 'arcade', 'clear'); } catch (e) { errors.push('startRaceFromMapSelect threw: ' + (e.stack || e)); }
  await sleep(20);
  report('Circuit race scene created', !!Game.track && !!Game.playerPhysics, `state=${Game.gameState}`);
  await sleep(3300);
  report('Circuit countdown → RACING', Game.gameState === 'RACING', `state=${Game.gameState}`);
  key('KeyW', true);
  let cMax = 0; let cNan = 0;
  await frames(Math.min(FRAMES, 200), () => {
    const p = Game.playerPhysics.position;
    if (![p.x, p.y, p.z].every(Number.isFinite)) cNan++;
    cMax = Math.max(cMax, Game.playerPhysics.getSpeedKmh());
  });
  key('KeyW', false);
  report('Circuit: player accelerates, no NaN', cMax > 20 && cNan === 0, `max ${cMax} km/h nan=${cNan}`);
  key('Escape'); await sleep(5);
  report('Circuit ESC pauses', Game.gameState === 'PAUSED', `state=${Game.gameState}`);
  key('Escape'); await sleep(5);
  report('Circuit ESC resumes', Game.gameState === 'RACING', `state=${Game.gameState}`);
  const c0 = window.SaveManager.getCash();
  try { Game.finishRace(); } catch (e) { errors.push('finishRace threw: ' + (e.stack || e)); }
  await sleep(200);
  report('Circuit rewards credited', window.SaveManager.getCash() > c0, `${c0} → ${window.SaveManager.getCash()}`);
  try { Game.goToMainMenu(); } catch (e) { errors.push('goToMainMenu threw: ' + (e.stack || e)); }
  await sleep(50);
  report('Circuit → main menu', Game.gameState === 'MAIN_MENU' && visible('main-menu'), `state=${Game.gameState}`);
  await frames(10);
  click('btn-mm-drive'); await sleep(30);
  report('Menu → DRIVE again (world re-attached)', Game.gameState === 'FREE_ROAM' && ow.active && ow.world.group.parent === Game.scene);
  await frames(30);

  // ── F. Save integrity ───────────────────────────────────────────────────
  const raw = window.localStorage.getItem(window.SaveManager.storageKey);
  let parsed = null; try { parsed = JSON.parse(raw); } catch (e) { /* ignore */ }
  report('Save persisted (v3 schema)', !!parsed && parsed.schemaVersion === 3 && parsed.progress && parsed.progress.eventRecords, raw ? `${raw.length} bytes` : 'missing');
  window.localStorage.setItem(window.SaveManager.storageKey, '{not json');
  const sm2 = new window.SaveManager.constructor();
  report('Corrupt save → recovered with defaults', sm2.recoveredFromCorruption === true && sm2.getCash() >= 0);

  finish();

  function finish() {
    console.log('\n──────── SUMMARY ────────');
    console.log(`Render calls: ${Game && Game.renderer ? Game.renderer.renderCalls : 'n/a'}`);
    console.log(`Warnings: ${warnings.length}`);
    console.log(`Errors:   ${errors.length}`);
    const uniq = [...new Set(errors)];
    uniq.slice(0, 25).forEach((e, i) => console.log(`  [${i + 1}] ${e.split('\n').slice(0, 6).join('\n      ')}`));
    if (uniq.length) process.exitCode = 1;
    setTimeout(() => process.exit(process.exitCode || 0), 10);
  }
})().catch(e => { console.error('Harness crashed:', e); process.exit(2); });
