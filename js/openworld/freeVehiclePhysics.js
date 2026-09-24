/**
 * FreeRacer - Free-body vehicle physics (open world)
 * ---------------------------------------------------------------------------
 * Arcade-simulation hybrid single-track ("bicycle") model with:
 *   - engine acceleration curve with aerodynamic headroom, drag, rolling loss
 *   - front/rear slip-angle tyre model with saturation (Pacejka-lite)
 *   - longitudinal weight transfer, drivetrain personality (FWD/RWD/AWD)
 *   - traction limit → wheelspin (power oversteer / torque understeer)
 *   - handbrake drifting with drift scoring & nitro recharge
 *   - 3-tier nitro (standard / precision / overdrive) shared with circuit mode
 *   - surface grip (asphalt / plaza / sidewalk / boardwalk / offroad)
 *   - ramps & airborne flight with air control
 *   - static collision against the world CollisionGrid (3-circle body)
 *   - assist presets (beginner / standard / expert)
 *
 * Runs at the game's fixed 120 Hz step. Exposes the same duck-typed
 * interface as ArcadeCarPhysics so camera, HUD and audio need no changes.
 *
 * Conventions: yaw θ → forward = (sin θ, 0, cos θ); local +X = driver's LEFT.
 * Steering angle δ > 0 = left turn (matches CarModel wheel pivot rotation).
 */
(function () {
  const G = 9.81;
  const AIR_GRAVITY = 14.0;
  const REST_OFFSET = 0.08;

  const SURFACE_MU = {
    asphalt: 1.0,
    plaza: 0.95,
    sidewalk: 0.86,
    boardwalk: 0.80,
    offroad: 0.55,
    ramp: 1.0
  };

  const ASSIST_PRESETS = {
    beginner: { yawDamping: 2.6, tractionControl: 1.0, counterSteer: 0.90, abs: true, steerLimit: 0.85, antiSpin: 1.0 },
    standard: { yawDamping: 1.2, tractionControl: 0.45, counterSteer: 0.50, abs: true, steerLimit: 1.0, antiSpin: 0.7 },
    expert: { yawDamping: 0.35, tractionControl: 0.0, counterSteer: 0.0, abs: false, steerLimit: 1.0, antiSpin: 0.25 }
  };

  class FreeVehiclePhysics {
    /**
     * @param {CarModel} carModel
     * @param {object} world  { getGroundHeight(x,z), surfaceAt(x,z), collision }
     * @param {boolean} isPlayer
     * @param {object} carConfig  entry from CarDatabase
     */
    constructor(carModel, world, isPlayer = false, carConfig = null) {
      this.car = carModel;
      this.world = world;
      this.isPlayer = isPlayer;
      this.track = null; // duck-type compatibility (camera checks this)
      this.carConfig = carConfig || (window.getCarById ? window.getCarById(carModel && carModel.carId) : null) || {};
      const cfg = this.carConfig.physics || {};
      const dims = this.carConfig.dimensions || {};
      const stats = this.carConfig.stats || {};
      const engine = this.carConfig.engine || {};

      // ── Kinematic state ──
      this.position = new THREE.Vector3();
      this.quaternion = new THREE.Quaternion();
      this.velocity = new THREE.Vector3();
      this.linearAcceleration = new THREE.Vector3();
      this.prevVelocity = new THREE.Vector3();
      this.yaw = 0;
      this.yawRate = 0;
      this.speed = 0;         // signed forward speed (m/s)
      this.vLat = 0;          // lateral velocity in body frame (+ = left)
      this.steerAngle = 0;
      this.currentThrottle = 0;
      this.currentBrake = 0;
      this.brakePressure = 0;

      // ── Vehicle parameters ──
      this.mass = dims.curbWeightKg || 1450;
      this.wheelbase = dims.wheelbase || 2.7;
      this.halfWidth = (dims.width || 1.9) * 0.5;
      this.halfLength = (dims.length || 4.5) * 0.5;
      this.drivetrain = engine.drivetrain || (this.mass > 1700 ? 'AWD' : 'RWD');
      const frontBias = this.drivetrain === 'FWD' ? 0.60 : (this.drivetrain === 'AWD' ? 0.54 : 0.47);
      this.a = this.wheelbase * (1 - frontBias); // CG → front axle
      this.b = this.wheelbase * frontBias;       // CG → rear axle
      this.hCg = 0.48;
      this.Iz = this.mass * (this.wheelbase * this.wheelbase + (this.halfWidth * 2) ** 2) / 12 * 1.15;

      this.maxSpeed = cfg.maxSpeed || 70;
      this.baseAcceleration = (cfg.acceleration || 24) * 0.45;
      this.acceleration = this.baseAcceleration;
      this.brakeDeceleration = (cfg.brakeDecel || 40) * 0.55;
      this.cdA = cfg.cdA || 0.66;
      this.gripStat = (stats.grip || 80) / 100;
      this.tireGrip = 1.0;
      this.handlingStat = (stats.handling || 80) / 100;
      this.stabilityStat = (stats.stability || 85) / 100;
      this.maxSteerAngle = cfg.maxSteerAngle || 0.56;
      this.highSpeedSteer = cfg.highSpeedSteer || 0.11;
      this.driftMultiplier = cfg.driftMultiplier || 1.0;
      this.corneringStiffness = 9.5 + this.handlingStat * 4.0; // Pacejka B
      this.steerResponse = 9.0 + this.handlingStat * 5.0;
      this.gearCount = engine.gearCount || 6;
      this.redline = engine.redline || 7500;

      // ── Nitro ──
      this.maxNitro = cfg.nitroCapacity || 100;
      this.nitroFuel = this.maxNitro;
      this.isNitroActive = false;
      this.nitroEfficiency = 1.0;
      this.nitroTimingWindow = 0;
      this.nitroTier = 'none';
      this.wasNitroPressed = false;
      this.lastNitroPressTime = 0;

      // ── Drift ──
      this.isHandbrake = false;
      this.isDrifting = false;
      this.driftAngle = 0;
      this.driftScore = 0;
      this.driftChain = 0;
      this.driftTimer = 0;
      this.wheelspin = 0;
      this.scrub = 0;
      this.driftHold = false;   // sustained-drift grip state (hysteresis)
      this.lastGroundedX = 0;
      this.lastGroundedZ = 0;

      // ── Ground / air ──
      this.isAirborne = false;
      this.airTime = 0;
      this.landingImpact = 0;
      this.groundY = 0;
      this.groundPitch = 0;
      this.surfaceType = 'asphalt';
      this.surfaceMu = 1.0;
      this.surfaceWetness = 0;

      // ── Chassis visuals ──
      this.chassisPitch = 0;
      this.chassisRoll = 0;

      // ── Collision ──
      this.collisionCooldown = 0;
      this.ghostTimer = 0;
      this.lastImpactSpeed = 0;
      this.onImpact = null; // callback(strength, worldPoint)
      this.stuckTimer = 0;

      // ── Gear sim (HUD) ──
      this.currentGear = 1;
      this.engineRpm = 1000;
      this.idleRpm = 1000;
      this.maxRpm = this.redline;

      // ── Assists ──
      this.assistLevel = 'standard';
      this.assist = ASSIST_PRESETS.standard;
      this.stabilityBonus = 1.0;
      this.roughGripScale = 1.0;   // grip retained off the asphalt (suspension/tyre/ride-height trade-off)
      this.nitroPowerMult = 1.0;

      // ── Respawn anchor (set by the event system) ──
      this.checkpointRespawn = null;

      // scratch
      this._fwd = new THREE.Vector3();
      this._up = new THREE.Vector3(0, 1, 0);
      this._right = new THREE.Vector3();
      this._left = new THREE.Vector3();
      this._q = new THREE.Quaternion();
      this._q2 = new THREE.Quaternion();
      this._axisY = new THREE.Vector3(0, 1, 0);
      this._prevPosition = new THREE.Vector3();
      this._prevQuaternion = new THREE.Quaternion();
      this._interpPosition = new THREE.Vector3();
      this._interpQuaternion = new THREE.Quaternion();
      this.latestSnapshot = null;
    }

    // ── Interface helpers ──────────────────────────────────────────────────
    setAssistLevel(level) {
      this.assistLevel = ASSIST_PRESETS[level] ? level : 'standard';
      this.assist = ASSIST_PRESETS[this.assistLevel];
    }

    setPose(x, z, yaw, y = null) {
      this.position.set(x, y === null ? this.sampleGround(x, z) + REST_OFFSET : y, z);
      this.yaw = yaw;
      this.velocity.set(0, 0, 0);
      this.prevVelocity.set(0, 0, 0);
      this.speed = 0;
      this.vLat = 0;
      this.yawRate = 0;
      this.steerAngle = 0;
      this.isAirborne = false;
      this.chassisPitch = 0;
      this.chassisRoll = 0;
      this.driftAngle = 0;
      this.isDrifting = false;
      this.quaternion.setFromAxisAngle(this._axisY, yaw);
      this._prevPosition.copy(this.position);
      this._prevQuaternion.copy(this.quaternion);
      if (this.car && this.car.group) {
        this.car.group.position.copy(this.position);
        this.car.group.quaternion.copy(this.quaternion);
      }
    }

    getForwardVector() { return this._fwd.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
    getUpVector() { return this._up.set(0, 1, 0).applyQuaternion(this.quaternion); }
    getRightVector() { return this._right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); } // local +X
    getLeftVector() { return this._left.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); }
    getSpeedKmh() { return THREE.MathUtils.clamp(Math.round(Math.abs(this.speed) * 3.6), 0, 450); }
    getNitroPercent() { return THREE.MathUtils.clamp((this.nitroFuel / this.maxNitro) * 100, 0, 100); }

    sampleGround(x, z) {
      return this.world && this.world.getGroundHeight ? this.world.getGroundHeight(x, z) : 0;
    }

    // ── Main step ─────────────────────────────────────────────────────────
    update(dt, inputs = {}) {
      const throttle = THREE.MathUtils.clamp(inputs.throttle !== undefined ? inputs.throttle : (inputs.gas || 0), 0, 1);
      const brake = THREE.MathUtils.clamp(inputs.brake || 0, 0, 1);
      const steer = THREE.MathUtils.clamp(inputs.steer || 0, -1, 1);
      const handbrake = !!inputs.handbrake;
      const nitro = !!inputs.nitro;
      this.currentThrottle = throttle;
      this.currentBrake = brake;
      this.isHandbrake = handbrake;

      if (this.collisionCooldown > 0) this.collisionCooldown = Math.max(0, this.collisionCooldown - dt);
      if (this.ghostTimer > 0) this.ghostTimer = Math.max(0, this.ghostTimer - dt);

      const nitroMult = this.updateNitro(dt, nitro, throttle);
      this.updateSurface();
      this.updateSteering(dt, steer);

      if (this.isAirborne) {
        this.stepAirborne(dt, steer, throttle, brake);
      } else {
        this.stepGrounded(dt, throttle, brake, handbrake, nitroMult);
      }

      this.resolveStaticCollisions(dt);
      this.updateChassisVisuals(dt, throttle, brake);
      this.updateGearSim();
      this.syncVisuals(dt, throttle, brake, handbrake);

      this.linearAcceleration.subVectors(this.velocity, this.prevVelocity).divideScalar(Math.max(dt, 1e-4));
      this.prevVelocity.copy(this.velocity);
    }

    // ── Nitro (identical tier rules to circuit mode) ───────────────────────
    updateNitro(dt, nitro, throttle) {
      const justPressed = nitro && !this.wasNitroPressed;
      this.wasNitroPressed = nitro;
      if (justPressed) {
        const now = performance.now() * 0.001;
        const since = now - this.lastNitroPressTime;
        this.lastNitroPressTime = now;
        if (!this.isNitroActive && this.nitroFuel > 4.0) {
          this.nitroTier = 'standard';
          this.nitroTimingWindow = 0.45;
        } else if (this.isNitroActive && this.nitroTier === 'standard') {
          if (this.nitroTimingWindow > 0.05 && this.nitroTimingWindow < 0.40) {
            this.nitroTier = 'precision';
            if (this.isPlayer && window.SoundEngine && window.SoundEngine.playPrecisionChime) window.SoundEngine.playPrecisionChime();
          } else if (since < 0.35 && this.nitroFuel > 35.0) {
            this.nitroTier = 'overdrive';
            if (this.isPlayer && window.SoundEngine && window.SoundEngine.playOverdriveBoom) window.SoundEngine.playOverdriveBoom();
          }
        }
      }
      if (this.nitroTimingWindow > 0) this.nitroTimingWindow = Math.max(0, this.nitroTimingWindow - dt);

      this.isNitroActive = false;
      let mult = 1.0;
      if (nitro && this.nitroFuel > 2.0 && (throttle > 0.05 || this.isAirborne)) {
        this.isNitroActive = true;
        let rate = 20.0;
        if (this.nitroTier === 'overdrive') { mult = 1.70 * 1.45; rate = 34.0; }
        else if (this.nitroTier === 'precision') { mult = 1.70 * 1.18; rate = 13.5; }
        else { this.nitroTier = 'standard'; mult = 1.70; }
        mult = 1 + (mult - 1) * this.nitroPowerMult;
        this.nitroFuel = Math.max(0, this.nitroFuel - (rate / Math.max(0.5, this.nitroEfficiency)) * dt);
      } else {
        this.nitroTier = 'none';
        this.nitroFuel = Math.min(this.maxNitro, this.nitroFuel + dt * 4.0);
      }
      return mult;
    }

    // ── Surface ───────────────────────────────────────────────────────────
    updateSurface() {
      if (!this.world || !this.world.surfaceAt) return;
      const res = this.world.surfaceAt(this.position.x, this.position.z);
      const t = typeof res === 'string' ? res : ((res && res.type) || 'asphalt');
      this.surfaceType = t;
      this.surfaceMu = SURFACE_MU[t] !== undefined ? SURFACE_MU[t] : 1.0;
      if (t !== 'asphalt' && t !== 'plaza') this.surfaceMu *= this.roughGripScale;
      this.surfaceMu *= (1 - this.surfaceWetness * 0.3);
    }

    // ── Steering ──────────────────────────────────────────────────────────
    updateSteering(dt, steer) {
      const speedRatio = Math.min(1, Math.abs(this.speed) / this.maxSpeed);
      const maxNow = THREE.MathUtils.lerp(this.maxSteerAngle, this.highSpeedSteer, Math.pow(speedRatio, 0.75)) * this.assist.steerLimit;
      let target = -steer * maxNow;

      // Counter-steer assist: when the rear steps out, add opposite lock
      if (this.assist.counterSteer > 0 && !this.isAirborne && Math.abs(this.speed) > 6) {
        const slip = Math.atan2(this.vLat, Math.max(Math.abs(this.speed), 1));
        target += THREE.MathUtils.clamp(-slip * this.assist.counterSteer * 0.9, -maxNow, maxNow) * 0.5;
      }
      const rate = steer !== 0 ? this.steerResponse : this.steerResponse * 1.6;
      this.steerAngle = THREE.MathUtils.damp(this.steerAngle, target, rate, dt);
    }

    // ── Grounded dynamics ─────────────────────────────────────────────────
    stepGrounded(dt, throttle, brake, handbrake, nitroMult) {
      const m = this.mass;
      let vx = this.speed;
      let vy = this.vLat;
      let r = this.yawRate;
      const delta = this.steerAngle;
      const absVx = Math.abs(vx);

      // 1. Longitudinal acceleration demand -------------------------------
      let aLong = 0;
      const dragDecel = 0.5 * 1.225 * this.cdA * vx * vx / m;
      const rollDecel = (this.surfaceType === 'offroad' ? 2.8 : (this.surfaceType === 'sidewalk' || this.surfaceType === 'boardwalk' ? 1.8 : 0.9));
      const reversing = vx < -0.3;

      let driveDemand = 0;
      if (throttle > 0.02) {
        if (reversing) {
          driveDemand = this.brakeDeceleration * 0.9 * throttle; // brake out of reverse
        } else {
          const headroom = Math.max(0, 1 - Math.pow(Math.max(0, vx) / this.maxSpeed, 2.2));
          const lowSpeedPunch = THREE.MathUtils.lerp(1.3, 1.0, THREE.MathUtils.smoothstep(vx, 0, 25));
          driveDemand = this.acceleration * throttle * nitroMult * THREE.MathUtils.lerp(0.10, 1.0, headroom) * lowSpeedPunch;
        }
      }

      // Traction limit on the driven axle → wheelspin
      const driveShare = this.drivetrain === 'AWD' ? 1.0 : (this.drivetrain === 'FWD' ? 0.62 : 0.66);
      const tractionLimit = this.surfaceMu * this.tireGrip * G * 2.6 * driveShare + 4.0;
      this.wheelspin = 0;
      if (driveDemand > tractionLimit && !reversing) {
        const excess = (driveDemand - tractionLimit) / Math.max(tractionLimit, 1);
        const tc = this.assist.tractionControl;
        this.wheelspin = THREE.MathUtils.clamp(excess * (1 - tc * 0.85), 0, 1);
        driveDemand = tractionLimit + (driveDemand - tractionLimit) * (0.25 + tc * 0.6);
      }
      aLong += driveDemand;

      // Brakes / reverse
      if (brake > 0.02) {
        if (vx > 0.4) {
          this.brakePressure = THREE.MathUtils.damp(this.brakePressure, brake, 7.0, dt);
          const brk = this.brakeDeceleration * this.brakePressure * Math.min(1.15, 0.55 + this.surfaceMu * 0.6);
          aLong -= brk;
        } else if (throttle < 0.02 && !handbrake) {
          // reverse
          aLong -= this.acceleration * 0.45 * brake;
        }
      } else {
        this.brakePressure = 0;
      }

      // Handbrake
      let rearMuScale = 1.0;
      if (handbrake) {
        if (absVx > 1.0) aLong -= Math.sign(vx) * 7.5;
        rearMuScale = 0.28;
      }
      // Sustained drift: once sideways with throttle, the rear stays loose until
      // the slide is caught (hysteresis) — gives controllable, throttle-steered drifts
      const slipNow = Math.abs(Math.atan2(vy, Math.max(absVx, 0.8)));
      if (this.driftHold) {
        if (slipNow < 0.09 || throttle < 0.25 || absVx < 6) this.driftHold = false;
      } else if (slipNow > 0.20 && throttle > 0.3 && absVx > 9) {
        this.driftHold = true;
      }
      if (this.driftHold) {
        // more throttle → looser rear (bigger angle); easing off lets grip return
        const loose = THREE.MathUtils.clamp((throttle - 0.3) / 0.7, 0, 1);
        let hold = THREE.MathUtils.lerp(0.88, 0.60 + 0.10 * (1 - this.driftMultiplier), loose);
        // anti-spin: past ~30° the rear progressively bites again so slides stay catchable
        const bite = THREE.MathUtils.smoothstep(slipNow, 0.55, 1.0) * this.assist.antiSpin;
        hold = THREE.MathUtils.lerp(hold, 1.0, bite);
        rearMuScale = Math.min(rearMuScale, hold);
      }

      // Drag, rolling & cornering scrub (sliding bleeds speed)
      if (absVx > 0.05) {
        const scrubDecel = Math.abs(Math.sin(slipNow)) * Math.min(absVx, 30) * 0.30;
        aLong -= Math.sign(vx) * (dragDecel + rollDecel + scrubDecel);
      }

      // Apply longitudinal with a simple stiction clamp
      const prevVx = vx;
      vx += aLong * dt;
      if (throttle < 0.02 && brake < 0.02 && Math.sign(prevVx) !== Math.sign(vx)) vx = 0;
      if (handbrake && throttle < 0.02 && Math.abs(vx) < 0.6) vx = 0;
      vx = THREE.MathUtils.clamp(vx, -18.0, this.maxSpeed * (nitroMult > 1 ? 1.06 : 1.0));

      // 2. Lateral / yaw dynamics (bicycle model) -------------------------
      const L = this.wheelbase;
      const ax = (vx - prevVx) / Math.max(dt, 1e-4);
      const Fz = m * G;
      const transfer = THREE.MathUtils.clamp(m * ax * this.hCg / L, -Fz * 0.35, Fz * 0.35);
      const Fzf = Fz * (this.b / L) - transfer;
      const Fzr = Fz * (this.a / L) + transfer;

      const mu = this.surfaceMu * this.tireGrip * (1.30 + 0.70 * this.gripStat);
      let muF = mu;
      let muR = mu * rearMuScale;
      // combined slip: wheelspin & heavy braking eat lateral grip
      if (this.wheelspin > 0) {
        if (this.drivetrain === 'FWD') muF *= 1 - 0.45 * this.wheelspin;
        else if (this.drivetrain === 'RWD') muR *= 1 - 0.55 * this.wheelspin;
        else { muF *= 1 - 0.2 * this.wheelspin; muR *= 1 - 0.3 * this.wheelspin; }
      }
      if (brake > 0.4 && !this.assist.abs) { muF *= 0.75; muR *= 0.8; }

      const B = this.corneringStiffness;
      const C = 1.35;
      const sgn = vx < -0.3 ? -1 : 1;
      const magic = (alpha) => Math.sin(C * Math.atan(B * alpha));
      const w = THREE.MathUtils.smoothstep(absVx, 1.5, 8.0);
      const rKin = vx * Math.tan(delta) / L;
      let damping = this.assist.yawDamping * this.stabilityBonus + this.stabilityStat * 0.6;
      if (handbrake) damping *= 0.5;
      // Self-alignment: at deep slip angles both axles saturate and the pure
      // bicycle model loses its restoring moment; this combined-slip term makes
      // a lifted-off slide straighten out instead of pirouetting.
      const alignGain = 6.0 * (this.assist.antiSpin + 0.3) * (this.driftHold ? 0.15 : 1) * (handbrake ? 0.2 : 1) * THREE.MathUtils.smoothstep(absVx, 3, 10);
      // Sub-step the stiff tyre model so low-speed slip stays stable at 120 Hz
      const subSteps = absVx < 14 ? 4 : 2;
      const h = dt / subSteps;
      const vxEff = Math.max(absVx, 0.8);
      for (let i = 0; i < subSteps; i++) {
        const alphaF = Math.atan2(vy + this.a * r, vxEff) - sgn * delta;
        const alphaR = Math.atan2(vy - this.b * r, vxEff);
        const FyF = -muF * Math.max(Fzf, 0) * magic(alphaF);
        const FyR = -muR * Math.max(Fzr, 0) * magic(alphaR);
        const ayDyn = (FyF * Math.cos(delta) + FyR) / m - vx * r;
        const beta = Math.atan2(vy, vxEff) * sgn;
        const align = Math.sign(beta) * Math.min(Math.abs(beta), 1.2) * alignGain; // rotate nose toward travel direction
        const rDotDyn = (this.a * FyF * Math.cos(delta) - this.b * FyR) / this.Iz - r * damping + align;
        const rDyn = THREE.MathUtils.clamp(r + rDotDyn * h, -3.5, 3.5);
        r = THREE.MathUtils.lerp(rKin, rDyn, w);
        vy = THREE.MathUtils.lerp(0, vy + ayDyn * h, w);
      }
      // bleed residual lateral velocity when nearly stopped
      if (absVx < 1.5) vy *= Math.max(0, 1 - 6 * dt);

      // Drift detection & scoring
      const slipAngle = Math.atan2(vy, vxEff);
      this.driftAngle = slipAngle;
      const aggressive = Math.abs(slipAngle) > 0.17 && absVx > 9;
      if ((handbrake && absVx > 8) || aggressive) {
        this.isDrifting = true;
        this.driftTimer += dt;
        if (this.isPlayer) {
          const pts = Math.abs(slipAngle) * absVx * 3.2 * this.driftMultiplier * dt * (1 + Math.min(this.driftTimer, 4) * 0.25);
          this.driftScore += Math.floor(pts * 10) / 10;
          this.nitroFuel = Math.min(this.maxNitro, this.nitroFuel + dt * 14.0);
        }
      } else {
        this.isDrifting = false;
        this.driftTimer = Math.max(0, this.driftTimer - dt * 3);
      }
      this.scrub = THREE.MathUtils.clamp(Math.abs(slipAngle) * 2.2 + this.wheelspin * 0.8 + (handbrake && absVx > 4 ? 0.4 : 0), 0, 1);

      // 3. Integrate --------------------------------------------------------
      this.speed = vx;
      this.vLat = vy;
      this.yawRate = r;
      this.yaw += r * dt;

      const fwd = this.getForwardVector();
      const left = this.getLeftVector();
      this.velocity.set(
        fwd.x * vx + left.x * vy,
        0,
        fwd.z * vx + left.z * vy
      );
      this.position.x += this.velocity.x * dt;
      this.position.z += this.velocity.z * dt;

      // 4. Ground following ------------------------------------------------
      const gy = this.sampleGround(this.position.x, this.position.z);
      const aheadY = this.sampleGround(this.position.x + fwd.x * 1.5, this.position.z + fwd.z * 1.5);
      const behindY = this.sampleGround(this.position.x - fwd.x * 1.5, this.position.z - fwd.z * 1.5);
      this.groundPitch = Math.atan2(aheadY - behindY, 3.0);
      const targetY = gy + REST_OFFSET;
      const drop = this.position.y - targetY;
      if (drop > 0.55 && absVx > 3) {
        // drove off an edge (ramp end / curb drop) → airborne.
        // Launch angle comes from the slope we were just on, not the drop ahead.
        this.isAirborne = true;
        this.airTime = 0;
        const y0 = this.sampleGround(this.lastGroundedX, this.lastGroundedZ);
        const yb = this.sampleGround(this.lastGroundedX - fwd.x * 1.5, this.lastGroundedZ - fwd.z * 1.5);
        const launchPitch = Math.atan2(y0 - yb, 1.5);
        this.velocity.y = Math.max(0, Math.sin(Math.max(0, launchPitch)) * absVx) + 0.6;
        this.velocity.x *= Math.cos(launchPitch);
        this.velocity.z *= Math.cos(launchPitch);
        if (this.isPlayer && window.SoundEngine) window.SoundEngine.playBeep(true);
      } else {
        // snap toward ground with a soft curb-hop
        const k = drop < 0 ? 40 : 12;
        this.position.y = THREE.MathUtils.damp(this.position.y, targetY, k, dt);
        this.velocity.y = 0;
        this.groundY = gy;
        this.lastGroundedX = this.position.x;
        this.lastGroundedZ = this.position.z;
      }

      // Orientation: yaw + ground pitch (ramps)
      this.quaternion.setFromAxisAngle(this._axisY, this.yaw);
      if (Math.abs(this.groundPitch) > 0.002) {
        this._q.setFromAxisAngle(this.getRightVector(), -this.groundPitch);
        this.quaternion.multiply(this._q);
      }
    }

    // ── Airborne ──────────────────────────────────────────────────────────
    stepAirborne(dt, steer, throttle, brake) {
      this.airTime += dt;
      this.velocity.y -= AIR_GRAVITY * dt;
      this.velocity.multiplyScalar(Math.pow(0.997, dt * 60));
      this.position.addScaledVector(this.velocity, dt);

      // air control
      this.yawRate = THREE.MathUtils.damp(this.yawRate, -steer * 1.6, 3.0, dt);
      this.yaw += this.yawRate * dt;
      const airPitch = (brake - throttle) * 0.9;
      this.chassisPitch = THREE.MathUtils.damp(this.chassisPitch, airPitch * 0.35, 2.5, dt);

      const fwd = this.getForwardVector();
      this.speed = this.velocity.x * fwd.x + this.velocity.z * fwd.z;
      const left = this.getLeftVector();
      this.vLat = this.velocity.x * left.x + this.velocity.z * left.z;

      const gy = this.sampleGround(this.position.x, this.position.z);
      if (this.position.y <= gy + REST_OFFSET && this.velocity.y <= 0) {
        // landing
        this.isAirborne = false;
        this.position.y = gy + REST_OFFSET;
        const vImpact = Math.abs(this.velocity.y);
        this.landingImpact = Math.min(0.30, vImpact * 0.03);
        this.velocity.y = 0;
        // heavy landings scrub speed and settle yaw
        const scrubF = THREE.MathUtils.clamp(1 - vImpact * 0.012, 0.75, 1);
        this.speed *= scrubF;
        this.vLat *= 0.5;
        this.yawRate *= 0.4;
        if (this.isPlayer && window.SoundEngine) {
          if (vImpact > 7) window.SoundEngine.playImpact(Math.min(1, vImpact / 14));
        }
      }
      if (this.position.y < -30) this.resetToRoad();

      this.quaternion.setFromAxisAngle(this._axisY, this.yaw);
      this._q.setFromAxisAngle(this.getRightVector(), THREE.MathUtils.clamp(-Math.atan2(this.velocity.y, Math.max(6, Math.hypot(this.velocity.x, this.velocity.z))) * 0.6, -0.5, 0.5));
      this.quaternion.multiply(this._q);
    }

    // ── Static collisions ─────────────────────────────────────────────────
    resolveStaticCollisions(dt) {
      const grid = this.world && this.world.collision;
      if (!grid) return;
      const fwd = this.getForwardVector();
      const left = this.getLeftVector();
      const r = this.halfWidth * 0.98;
      const offsets = [this.halfLength * 0.62, 0, -this.halfLength * 0.62];
      const y = this.position.y + 0.5;
      let hit = null;
      for (let i = 0; i < offsets.length; i++) {
        const off = offsets[i];
        const cx = this.position.x + fwd.x * off;
        const cz = this.position.z + fwd.z * off;
        const res = grid.resolveCircle(cx, cz, r, y);
        if (res && (!hit || res.depth > hit.depth)) hit = { res, off };
      }
      if (!hit) { this.stuckTimer = 0; return; }

      const { res, off } = hit;
      // positional correction
      this.position.x += res.nx * res.depth;
      this.position.z += res.nz * res.depth;

      // velocity response
      const vn = this.velocity.x * res.nx + this.velocity.z * res.nz;
      if (vn < 0) {
        const restitution = 0.22;
        const impulse = -vn * (1 + restitution);
        const tx = -res.nz; const tz = res.nx;
        const vt = this.velocity.x * tx + this.velocity.z * tz;
        const vnAfter = vn + impulse;
        // tangential scrub: glancing hits keep speed, head-on hits bleed it
        const scrub = THREE.MathUtils.clamp(Math.abs(vn) / Math.max(1, Math.abs(vt) + Math.abs(vn)), 0, 1);
        const keep = 1 - 0.35 * scrub;
        this.velocity.x = tx * vt * keep + res.nx * vnAfter;
        this.velocity.z = tz * vt * keep + res.nz * vnAfter;

        // yaw kick from off-centre hits
        const nLeft = res.nx * left.x + res.nz * left.z;
        this.yawRate += (off * impulse * nLeft) / (0.5 * this.wheelbase * this.wheelbase) * 0.55;
        this.yawRate = THREE.MathUtils.clamp(this.yawRate, -4, 4);

        // re-derive body-frame speeds
        this.speed = this.velocity.x * fwd.x + this.velocity.z * fwd.z;
        this.vLat = this.velocity.x * left.x + this.velocity.z * left.z;

        const strength = Math.abs(vn);
        this.lastImpactSpeed = strength;
        if (strength > 2.5 && this.collisionCooldown <= 0) {
          this.collisionCooldown = 0.25;
          if (this.onImpact) this.onImpact(strength, res);
          if (this.isPlayer && window.SoundEngine) window.SoundEngine.playImpact(Math.min(1, strength / 16));
        }
      }
      // stuck detection: pinned against a wall with throttle
      if (Math.abs(this.speed) < 0.6 && this.currentThrottle > 0.5) this.stuckTimer += dt; else this.stuckTimer = 0;
    }

    /**
     * Circle-vs-circle response against another vehicle (player, AI, traffic).
     * Both bodies must expose position, velocity, yaw, halfWidth, halfLength,
     * mass and (optionally) speed/vLat/yawRate for re-derivation.
     */
    static collideVehicles(A, B) {
      const circlesOf = (V) => {
        const fx = Math.sin(V.yaw); const fz = Math.cos(V.yaw);
        const off = V.halfLength * 0.5;
        const r = V.halfWidth * 1.02;
        return [
          { x: V.position.x + fx * off, z: V.position.z + fz * off, r, off },
          { x: V.position.x - fx * off, z: V.position.z - fz * off, r, off: -off }
        ];
      };
      const quick = Math.hypot(A.position.x - B.position.x, A.position.z - B.position.z);
      if (quick > A.halfLength + B.halfLength + 1) return false;
      const ca = circlesOf(A);
      const cb = circlesOf(B);
      let collided = false;
      for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 2; j++) {
          const p = ca[i]; const q = cb[j];
          let dx = p.x - q.x; let dz = p.z - q.z;
          let d = Math.hypot(dx, dz);
          const minD = p.r + q.r;
          if (d >= minD) continue;
          if (d < 1e-4) { dx = Math.sin(A.yaw + 1.5); dz = Math.cos(A.yaw + 1.5); d = 1e-4; }
          const nx = dx / d; const nz = dz / d;
          const pen = minD - d;
          const mA = A.mass || 1500; const mB = B.mass || 1500;
          const wA = mB / (mA + mB); const wB = mA / (mA + mB);
          A.position.x += nx * pen * wA; A.position.z += nz * pen * wA;
          B.position.x -= nx * pen * wB; B.position.z -= nz * pen * wB;
          const rvx = A.velocity.x - B.velocity.x;
          const rvz = A.velocity.z - B.velocity.z;
          const vn = rvx * nx + rvz * nz;
          if (vn < 0) {
            const e = 0.25;
            const jImp = -(1 + e) * vn / (1 / mA + 1 / mB);
            A.velocity.x += nx * jImp / mA; A.velocity.z += nz * jImp / mA;
            B.velocity.x -= nx * jImp / mB; B.velocity.z -= nz * jImp / mB;
            const kick = (jImp / mA) * 0.35;
            if (A.yawRate !== undefined) A.yawRate = THREE.MathUtils.clamp(A.yawRate + p.off * kick * (nx * Math.cos(A.yaw) - nz * Math.sin(A.yaw)) * 0.5, -4, 4);
            if (B.yawRate !== undefined) B.yawRate = THREE.MathUtils.clamp(B.yawRate - q.off * (jImp / mB) * 0.35 * (nx * Math.cos(B.yaw) - nz * Math.sin(B.yaw)) * 0.5, -4, 4);
            [A, B].forEach((V) => {
              if (typeof V.rederiveBodyVelocity === 'function') V.rederiveBodyVelocity();
            });
            if (A.onVehicleImpact) A.onVehicleImpact(Math.abs(vn), B);
            if (B.onVehicleImpact) B.onVehicleImpact(Math.abs(vn), A);
          }
          collided = true;
        }
      }
      return collided;
    }

    rederiveBodyVelocity() {
      const fwd = this.getForwardVector();
      const left = this.getLeftVector();
      this.speed = this.velocity.x * fwd.x + this.velocity.z * fwd.z;
      this.vLat = this.velocity.x * left.x + this.velocity.z * left.z;
    }

    // ── Visual helpers ────────────────────────────────────────────────────
    updateChassisVisuals(dt, throttle, brake) {
      if (this.isAirborne) return;
      const ax = this.linearAcceleration.x * Math.sin(this.yaw) + this.linearAcceleration.z * Math.cos(this.yaw);
      const ay = this.speed * this.yawRate; // + = turning left
      // rotation about local +X (driver's left): negative angle lifts the nose
      const targetPitch = THREE.MathUtils.clamp(-ax * 0.006, -0.05, 0.07);
      const targetRoll = THREE.MathUtils.clamp(ay * 0.0065, -0.10, 0.10);
      this.chassisPitch = THREE.MathUtils.damp(this.chassisPitch, targetPitch, 7.0, dt);
      this.chassisRoll = THREE.MathUtils.damp(this.chassisRoll, targetRoll, 8.0, dt);
      if (this.landingImpact > 0) this.landingImpact = THREE.MathUtils.damp(this.landingImpact, 0, 12, dt);
    }

    updateGearSim() {
      const kmh = Math.abs(this.speed) * 3.6;
      const top = this.maxSpeed * 3.6;
      const n = this.gearCount;
      if (this.speed < -0.5) { this.currentGear = 'R'; this.engineRpm = this.idleRpm + Math.abs(this.speed) * 220; return; }
      if (kmh < 1) { this.currentGear = 'N'; this.engineRpm = this.idleRpm + this.currentThrottle * 2500; return; }
      // geometric gear spacing
      let gear = 1;
      let lo = 0;
      let hi = top * 0.14;
      for (let g = 1; g <= n; g++) {
        const upper = g === n ? top * 1.2 : top * (0.14 + (g / n) * 0.9) * (0.95 + g * 0.01);
        if (kmh <= upper) { gear = g; hi = upper; break; }
        lo = upper;
        gear = g;
        hi = upper;
      }
      this.currentGear = gear;
      const frac = THREE.MathUtils.clamp((kmh - lo) / Math.max(1, hi - lo), 0, 1);
      this.engineRpm = this.idleRpm + 1200 + frac * (this.maxRpm - this.idleRpm - 1200) * (0.9 + this.currentThrottle * 0.1);
    }

    syncVisuals(dt, throttle, brake, handbrake) {
      if (this.car && this.car.group) {
        this.car.group.position.copy(this.position);
        this._q2.copy(this.quaternion);
        if (Math.abs(this.chassisPitch) > 0.001) {
          this._q.setFromAxisAngle(this.getRightVector(), this.chassisPitch);
          this._q2.multiply(this._q);
        }
        if (Math.abs(this.chassisRoll) > 0.001) {
          this._q.setFromAxisAngle(this.getForwardVector(), this.chassisRoll);
          this._q2.multiply(this._q);
        }
        this.car.group.quaternion.copy(this._q2);
      }
      const isBrakingVisual = (brake > 0.08 || handbrake) && Math.abs(this.speed) > 0.5;
      if (this.car && typeof this.car.updateVisuals === 'function') {
        this.car.updateVisuals(this.speed, this.steerAngle, isBrakingVisual, this.isNitroActive, this.speed < -0.2, dt, this.nitroTier || 'standard');
      }
      if (this.isPlayer && window.SoundEngine) {
        const speedRatio = Math.min(1, Math.abs(this.speed) / this.maxSpeed);
        window.SoundEngine.updateCarAudio(speedRatio, this.isDrifting, this.isNitroActive, throttle, this.scrub, this.surfaceWetness || 0);
      }
    }

    // ── Reset / respawn ───────────────────────────────────────────────────
    resetToRoad() {
      if (this.checkpointRespawn) {
        const c = this.checkpointRespawn;
        this.setPose(c.x, c.z, c.yaw);
        this.ghostTimer = 2.0;
        return;
      }
      const net = this.world && this.world.network;
      if (net) {
        const near = net.nearestRoadPoint(this.position.x, this.position.z, 200);
        if (near) {
          // pick the travel direction closest to the current heading
          const fwd = this.getForwardVector();
          const along = fwd.x * near.dx + fwd.z * near.dz;
          const dir = along >= 0 ? 1 : -1;
          const dx = near.dx * dir; const dz = near.dz * dir;
          const r = window.RoadNetwork.rightOf(dx, dz);
          const laneOff = window.RoadNetwork.LANE_WIDTH * 0.5 + (near.edge.lanes > 1 ? window.RoadNetwork.LANE_WIDTH * 0.5 : 0);
          const x = near.x + r.x * laneOff;
          const z = near.z + r.z * laneOff;
          this.setPose(x, z, Math.atan2(dx, dz));
          this.ghostTimer = 2.0;
          return;
        }
      }
      const sp = (this.world && this.world.spawn) || { x: 0, z: 0, yaw: 0 };
      this.setPose(sp.x, sp.z, sp.yaw);
    }

    respawnAtCheckpoint() { this.resetToRoad(); }

    /**
     * Apply a UpgradeSystem modifier vector (parts + tuning). Idempotent: always
     * derived from the stock values captured in the constructor.
     */
    applyModifiers(m) {
      if (!m) return;
      if (!this._stock) {
        this._stock = { mass: this.mass, maxSpeed: this.maxSpeed, brake: this.brakeDeceleration, cdA: this.cdA, cornering: this.corneringStiffness, steer: this.steerResponse, drift: this.driftMultiplier, maxNitro: this.maxNitro };
      }
      const s = this._stock;
      this.mass = s.mass * m.mass;
      this.Iz = this.mass * (this.wheelbase * this.wheelbase + (this.halfWidth * 2) ** 2) / 12 * 1.15;
      this.acceleration = this.baseAcceleration * m.power / m.mass;
      this.maxSpeed = Math.min(100, s.maxSpeed * m.topSpeed / Math.pow(m.drag, 0.33));
      this.cdA = s.cdA * m.drag;
      this.brakeDeceleration = s.brake * m.brake / Math.pow(m.mass, 0.5);
      this.tireGrip = m.grip;
      this.corneringStiffness = s.cornering * Math.sqrt(m.handling);
      this.steerResponse = s.steer * Math.sqrt(m.handling);
      this.stabilityBonus = m.stability;
      this.driftMultiplier = s.drift * m.driftability;
      this.roughGripScale = m.rough;
      this.maxNitro = s.maxNitro * m.nitroCapacity;
      this.nitroFuel = Math.min(this.nitroFuel, this.maxNitro) || this.maxNitro;
      this.nitroEfficiency = m.nitroEfficiency;
      this.nitroPowerMult = m.nitroPower;
    }

    /** Instant placement (debug / tests / event grid). */
    teleport(x, z, yaw) { this.setPose(x, z, yaw); }

    // ── Upgrades (same semantics as circuit mode) ─────────────────────────
    applyUpgrades(upgrades) {
      if (!upgrades) return;
      const factor = (level) => 1 + Math.min(level || 0, 10) * 0.05;
      if (upgrades.acceleration !== undefined) this.acceleration = this.baseAcceleration * factor(upgrades.acceleration);
      if (upgrades.braking !== undefined) this.brakeDeceleration *= factor(upgrades.braking);
      if (upgrades.handling !== undefined) {
        this.corneringStiffness *= Math.sqrt(factor(upgrades.handling));
        this.steerResponse *= Math.sqrt(factor(upgrades.handling));
      }
      if (upgrades.tireGrip !== undefined) this.tireGrip *= Math.pow(factor(upgrades.tireGrip), 0.6);
      if (upgrades.antiGravityGrip !== undefined) this.tireGrip *= Math.pow(factor(upgrades.antiGravityGrip), 0.4);
      if (upgrades.landingStability !== undefined) this.stabilityBonus = factor(upgrades.landingStability);
      if (upgrades.nitroCapacity !== undefined) {
        this.maxNitro *= factor(upgrades.nitroCapacity);
        this.nitroFuel = this.maxNitro;
      }
      if (upgrades.nitroEfficiency !== undefined) this.nitroEfficiency = factor(upgrades.nitroEfficiency);
      if (upgrades.maxSpeed !== undefined) this.maxSpeed = Math.min(100, this.maxSpeed * (1 + upgrades.maxSpeed * 0.02));
    }

    // ── Fixed-step interpolation ──────────────────────────────────────────
    saveState() {
      this._prevPosition.copy(this.position);
      this._prevQuaternion.copy(this.quaternion);
    }

    interpolateVisuals(alpha) {
      if (!this.car || !this.car.group) return;
      this._interpPosition.lerpVectors(this._prevPosition, this.position, alpha);
      this._interpQuaternion.copy(this._prevQuaternion).slerp(this.quaternion, alpha);
      this.car.group.position.copy(this._interpPosition);
      this._q2.copy(this._interpQuaternion);
      if (Math.abs(this.chassisPitch) > 0.001) {
        this._q.setFromAxisAngle(this.getRightVector(), this.chassisPitch);
        this._q2.multiply(this._q);
      }
      if (Math.abs(this.chassisRoll) > 0.001) {
        this._q.setFromAxisAngle(this.getForwardVector(), this.chassisRoll);
        this._q2.multiply(this._q);
      }
      this.car.group.quaternion.copy(this._q2);
    }
  }

  FreeVehiclePhysics.SURFACE_MU = SURFACE_MU;
  FreeVehiclePhysics.ASSIST_PRESETS = ASSIST_PRESETS;
  window.FreeVehiclePhysics = FreeVehiclePhysics;
})();
