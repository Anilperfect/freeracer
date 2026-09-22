#!/usr/bin/env node
/**
 * FreeRacer - headless numeric test for the open-world vehicle model.
 * Usage: FREERACER_NODE_MODULES=/path/to/node_modules node tools/physics-test.js
 * Loads three + the open-world modules without a DOM and runs driving scenarios,
 * printing key metrics (0-100 time, top speed, turn radius, drift recovery, collisions).
 */
const path = require('path');
const fs = require('fs');
const nm = process.env.FREERACER_NODE_MODULES || path.join(__dirname, '..', 'node_modules');
const THREE = require(path.join(nm, 'three'));
global.window = global;
global.THREE = THREE;
global.performance = { now: () => Date.now() };
global.SoundEngine = null;
const root = path.join(__dirname, '..');
const load = (rel) => { const code = fs.readFileSync(path.join(root, rel), 'utf8'); new Function(code)(); };
load('js/carData.js');
load('js/openworld/roadNetwork.js');
load('js/openworld/districts/apexDowntown.js');
load('js/openworld/collisionGrid.js');
load('js/openworld/freeVehiclePhysics.js');

const district = window.DistrictApexDowntown;
const network = new window.RoadNetwork(district);
const grid = new window.CollisionGrid(40);
grid.addBox(-5, 200, 5, 210, 0, 10, 'testwall');
grid.addBox(20, 100, 21, 300, 0, 10, 'sidewall');
const world = {
  network,
  collision: grid,
  spawn: district.spawn,
  getGroundHeight: (x, z) => (x > 50 && x < 60 && z > 0 && z < 22) ? Math.max(0, (z / 22) * 3.2) : 0,
  surfaceAt: (x, z) => network.surfaceAt ? network.surfaceAt(x, z) : 'asphalt'
};

const dt = 1 / 120;
let failures = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) failures++; };
const finite = (p) => Number.isFinite(p.position.x) && Number.isFinite(p.position.z) && Number.isFinite(p.yaw) && Number.isFinite(p.speed) && Number.isFinite(p.vLat) && Number.isFinite(p.yawRate);

const fakeCar = () => ({ group: new THREE.Group(), updateVisuals() {}, carId: 'x' });

for (const cfg of window.CarDatabase) {
  const p = new window.FreeVehiclePhysics(fakeCar(), world, true, cfg);
  p.setPose(100, -400, 0);
  let t100 = null; let top = 0; let t = 0;
  for (let i = 0; i < 120 * 14; i++) {
    p.update(dt, { throttle: 1, brake: 0, steer: 0 });
    t += dt;
    if (t100 === null && p.speed * 3.6 >= 100) t100 = t;
    top = Math.max(top, p.speed * 3.6);
  }
  const straight = Math.abs(p.position.x - 100) < 0.5;
  check(`${cfg.name}: straight-line`, finite(p) && straight && t100 !== null, `0-100 ${t100 ? t100.toFixed(2) : 'n/a'}s, top ${top.toFixed(0)} km/h (cfg ${(cfg.physics.maxSpeed * 3.6).toFixed(0)}), gear ${p.currentGear}, x-drift ${(p.position.x - 100).toFixed(2)}`);
  // braking
  const v0 = p.speed;
  let tb = 0;
  while (p.speed > 0.5 && tb < 10) { p.update(dt, { throttle: 0, brake: 1, steer: 0 }); tb += dt; }
  check(`${cfg.name}: braking`, finite(p) && tb < 6, `${(v0 * 3.6).toFixed(0)} km/h → 0 in ${tb.toFixed(2)}s`);
}

// Turning radius at 50 km/h full lock
{
  const cfg = window.CarDatabase[0];
  const p = new window.FreeVehiclePhysics(fakeCar(), world, true, cfg);
  p.setPose(0, -400, 0);
  const target = 50 / 3.6;
  for (let i = 0; i < 120 * 6; i++) p.update(dt, { throttle: p.speed < target ? 0.6 : 0, brake: 0, steer: 0 });
  let minX = 0; let maxX = 0; let yaw0 = p.yaw; let rMean = 0; let n = 0;
  for (let i = 0; i < 120 * 5; i++) {
    p.update(dt, { throttle: p.speed < target ? 0.5 : 0, brake: 0, steer: 1 });
    minX = Math.min(minX, p.position.x); maxX = Math.max(maxX, p.position.x);
    rMean += p.yawRate; n++;
  }
  rMean /= n;
  const radius = Math.abs(p.speed / rMean);
  check('full-lock turn @50 km/h', finite(p) && rMean < 0 && radius > 4 && radius < 30, `radius ≈ ${radius.toFixed(1)} m, yawRate ${rMean.toFixed(2)} rad/s, slip ${(p.driftAngle * 57.3).toFixed(1)}°, x∈[${minX.toFixed(0)},${maxX.toFixed(0)}]`);
}

// Handbrake drift at 80 km/h then recovery
{
  const cfg = window.CarDatabase[1];
  const p = new window.FreeVehiclePhysics(fakeCar(), world, true, cfg);
  p.setPose(0, -400, 0);
  const target = 80 / 3.6;
  for (let i = 0; i < 120 * 6; i++) p.update(dt, { throttle: p.speed < target ? 0.7 : 0, brake: 0, steer: 0 });
  let maxSlip = 0; let drifted = false; let heldSlipSum = 0; let heldN = 0;
  // initiate with handbrake, then hold the slide with throttle + human-like counter-steer for 2 s
  for (let i = 0; i < 120 * 2.5; i++) {
    const slip = p.driftAngle;
    const steerIn = i < 45 ? 1 : THREE.MathUtils.clamp(1 - Math.abs(slip) * 2.2, -1, 1) * (slip < 0 ? 1 : -1) * -1;
    p.update(dt, { throttle: i < 45 ? 0.4 : 0.8, brake: 0, steer: i < 45 ? 1 : steerIn, handbrake: i < 45 });
    maxSlip = Math.max(maxSlip, Math.abs(p.driftAngle));
    drifted = drifted || p.isDrifting;
    if (i > 100) { heldSlipSum += Math.abs(p.driftAngle); heldN++; }
  }
  const heldSlip = heldSlipSum / Math.max(1, heldN);
  // hands-off recovery: straighten wheel, light throttle
  for (let i = 0; i < 120 * 3; i++) p.update(dt, { throttle: 0.2, brake: 0, steer: 0 });
  const slipAfter = Math.abs(p.driftAngle);
  check('handbrake drift + hold + recovery', finite(p) && drifted && maxSlip > 0.3 && maxSlip < 1.2 && heldSlip > 0.15 && slipAfter < 0.05 && Math.abs(p.yawRate) < 0.3, `max slip ${(maxSlip * 57.3).toFixed(1)}°, avg held ${(heldSlip * 57.3).toFixed(1)}°, after ${(slipAfter * 57.3).toFixed(1)}°, drift score ${p.driftScore.toFixed(0)}, yawRate ${p.yawRate.toFixed(2)}, speed ${(p.speed * 3.6).toFixed(0)}`);

  // Standard assists: full lock held into the turn with throttle must not end in an endless spin
  const q = new window.FreeVehiclePhysics(fakeCar(), world, true, cfg);
  q.setPose(0, -400, 0);
  for (let i = 0; i < 120 * 6; i++) q.update(dt, { throttle: q.speed < target ? 0.7 : 0, brake: 0, steer: 0 });
  let qMaxSlip = 0; let spins = 0; let lastYaw = q.yaw;
  for (let i = 0; i < 120 * 4; i++) { q.update(dt, { throttle: 0.6, brake: 0, steer: 1, handbrake: i < 40 }); qMaxSlip = Math.max(qMaxSlip, Math.abs(q.driftAngle)); }
  const turned = Math.abs(q.yaw - lastYaw);
  check('standard assists: abused full-lock drift stays catchable', finite(q) && qMaxSlip < 1.3, `max slip ${(qMaxSlip * 57.3).toFixed(0)}°, total yaw ${(turned * 57.3).toFixed(0)}°, speed ${(q.speed * 3.6).toFixed(0)} km/h`);
}

// Spin-out resistance: full throttle + full lock from 120 km/h for 3 s (expert assists)
{
  const cfg = window.CarDatabase[2];
  const p = new window.FreeVehiclePhysics(fakeCar(), world, true, cfg);
  p.setAssistLevel('expert');
  p.setPose(0, -400, 0);
  for (let i = 0; i < 120 * 8; i++) p.update(dt, { throttle: 1, brake: 0, steer: 0 });
  let maxYawRate = 0; let maxSlip = 0;
  for (let i = 0; i < 120 * 3; i++) { p.update(dt, { throttle: 1, brake: 0, steer: 1 }); maxYawRate = Math.max(maxYawRate, Math.abs(p.yawRate)); maxSlip = Math.max(maxSlip, Math.abs(p.driftAngle)); }
  check('expert high-speed full lock stays finite', finite(p) && maxYawRate <= 3.6, `max yawRate ${maxYawRate.toFixed(2)}, max slip ${(maxSlip * 57.3).toFixed(0)}°, speed now ${(p.speed * 3.6).toFixed(0)} km/h`);
}

// Wall collision
{
  const cfg = window.CarDatabase[0];
  const p = new window.FreeVehiclePhysics(fakeCar(), world, true, cfg);
  p.setPose(0, 100, 0);
  let impacts = 0; p.onImpact = () => impacts++;
  let maxZ = -Infinity;
  for (let i = 0; i < 120 * 6; i++) { p.update(dt, { throttle: 1, brake: 0, steer: 0 }); maxZ = Math.max(maxZ, p.position.z); }
  check('head-on wall collision', finite(p) && impacts >= 1 && maxZ < 200.5 && p.position.z < 199.5, `impacts ${impacts}, max z ${maxZ.toFixed(2)}, final z ${p.position.z.toFixed(2)}, speed ${(p.speed * 3.6).toFixed(0)} km/h, stuck ${p.stuckTimer.toFixed(1)}s`);
  // glancing collision: approach at 20° angle
  const q = new window.FreeVehiclePhysics(fakeCar(), world, true, cfg);
  q.setPose(18.8, 150, 0.05);
  let qImpacts = 0; q.onImpact = () => qImpacts++;
  let minSpeedAfterHit = Infinity; let hitAt = null;
  for (let i = 0; i < 120 * 6; i++) { q.update(dt, { throttle: 1, brake: 0, steer: 0 }); if (qImpacts && hitAt === null) hitAt = i; if (hitAt !== null && i < hitAt + 60) minSpeedAfterHit = Math.min(minSpeedAfterHit, q.speed); }
  check('glancing wall collision keeps speed', finite(q) && (qImpacts === 0 || minSpeedAfterHit > 5), `impacts ${qImpacts}, min speed after ${Number.isFinite(minSpeedAfterHit) ? (minSpeedAfterHit * 3.6).toFixed(0) : 'n/a'} km/h`);
}

// Ramp jump
{
  const cfg = window.CarDatabase[0];
  const p = new window.FreeVehiclePhysics(fakeCar(), world, true, cfg);
  p.setPose(55, -80, 0);
  let air = false; let maxY = 0; let landed = false; let airT = 0;
  for (let i = 0; i < 120 * 8; i++) {
    p.update(dt, { throttle: 1, brake: 0, steer: 0 });
    if (p.isAirborne) { air = true; airT += dt; maxY = Math.max(maxY, p.position.y); }
    if (air && !p.isAirborne) landed = true;
  }
  check('ramp launch & landing', finite(p) && air && landed && maxY > 3.3, `airborne ${airT.toFixed(2)}s, apex y ${maxY.toFixed(2)}, final y ${p.position.y.toFixed(2)}, speed ${(p.speed * 3.6).toFixed(0)} km/h`);
}

// Reverse + reset to road
{
  const cfg = window.CarDatabase[3];
  const p = new window.FreeVehiclePhysics(fakeCar(), world, true, cfg);
  p.setPose(20, 20, 0);
  for (let i = 0; i < 120 * 3; i++) p.update(dt, { throttle: 0, brake: 1, steer: 0.5 });
  const reversed = p.speed < -1;
  const reverseSpeed = p.speed;
  p.setPose(300, -300, 1.0);
  p.resetToRoad();
  const near = network.nearestRoadPoint(p.position.x, p.position.z, 20);
  check('reverse + resetToRoad', reversed && finite(p) && near && near.dist < 8, `reverse speed ${(reverseSpeed * 3.6).toFixed(0)}, reset → (${p.position.x.toFixed(0)}, ${p.position.z.toFixed(0)}) lateral ${near ? near.lateral.toFixed(1) : 'n/a'}`);
}

// Vehicle-vs-vehicle collision
{
  const cfg = window.CarDatabase[0];
  const a = new window.FreeVehiclePhysics(fakeCar(), world, true, cfg);
  const b = new window.FreeVehiclePhysics(fakeCar(), world, false, cfg);
  a.setPose(0, -400, 0); b.setPose(0.4, -380, 0);
  let hits = 0;
  for (let i = 0; i < 120 * 4; i++) {
    a.update(dt, { throttle: 1 }); b.update(dt, { throttle: 0.2 });
    if (window.FreeVehiclePhysics.collideVehicles(a, b)) hits++;
  }
  check('car-vs-car collision', finite(a) && finite(b) && hits > 0 && b.speed > a.speed * 0.5, `contacts ${hits}, a ${(a.speed * 3.6).toFixed(0)} km/h, b ${(b.speed * 3.6).toFixed(0)} km/h, gap ${(b.position.z - a.position.z).toFixed(1)} m`);
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PHYSICS CHECKS PASSED');
process.exit(failures ? 1 : 0);
