/**
 * Advanced 120 Hz AI Driver & Trajectory Controller System
 * Built for realistic open-world racing at 300+ km/h (83.33+ m/s).
 * 
 * Implements:
 * 1. Industrial PID Controller with low-pass filtered derivative and conditional anti-windup.
 * 2. High-speed Steering Controller:
 *    - Blended Heading Error & Cross-Track Error (K_cte = 1.8, deadband 0.003 rad).
 *    - Output rate limiter (4.0 units/s) to eliminate high-speed oscillation/zig-zagging.
 * 3. Aerodynamic Downforce Cornering Speed Planner:
 *    - Solves F_normal(v) = m*g + 0.5*rho*ClA*v^2 for cornering capacity.
 *    - Preview curvature over max(40m, speed * 2.0s).
 *    - Configurable safety utilization (0.72 novice, 0.85 standard, 0.93 elite).
 * 4. Trajectory replanning rate-limited to 15 Hz with 0.35m lane-target hysteresis.
 */

class PidController {
  constructor(kp = 1.0, ki = 0.0, kd = 0.0, integralLimit = 1.0, derivativeTau = 0.08, outputLimit = 1.0) {
    this.kp = kp;
    this.ki = ki;
    this.kd = kd;
    this.integralLimit = integralLimit;
    this.derivativeTau = derivativeTau;
    this.outputLimit = outputLimit;

    this.integral = 0.0;
    this.previousError = 0.0;
    this.derivative = 0.0;
  }

  reset() {
    this.integral = 0.0;
    this.previousError = 0.0;
    this.derivative = 0.0;
  }

  step(error, dt) {
    const safeDt = Math.max(dt, 0.0001);

    // Filtered derivative: raw = (err - prev) / dt, smoothed by low-pass filter
    const rawDerivative = (error - this.previousError) / safeDt;
    const alpha = safeDt / (this.derivativeTau + safeDt);
    this.derivative = THREE.MathUtils.lerp(this.derivative, rawDerivative, alpha);

    // Conditional integration (anti-windup while saturated)
    const candidateIntegral = THREE.MathUtils.clamp(
      this.integral + error * safeDt,
      -this.integralLimit,
      this.integralLimit
    );

    const unsaturated = this.kp * error + this.ki * candidateIntegral + this.kd * this.derivative;
    const output = THREE.MathUtils.clamp(unsaturated, -this.outputLimit, this.outputLimit);

    if (Math.abs(output - unsaturated) < 1e-4 || Math.sign(error) !== Math.sign(unsaturated)) {
      this.integral = candidateIntegral;
    }

    this.previousError = error;
    return output;
  }
}

class AIRacer {
  constructor(name, colorHex, trackManager, difficulty = 0.85, carId = 'veloce_v8_gt') {
    this.name = name;
    this.track = trackManager;
    this.difficulty = difficulty; // 0.72 (Novice) to 0.93 (Elite)
    this.carId = carId;

    this.carModel = new CarModel(colorHex, false, carId, 1);
    this.physics = new ArcadeCarPhysics(this.carModel, trackManager, false);

    // ── 1. Steering PID Controller (Section 3.3 Baseline) ──
    // Kp=1.40, Ki=0.05, Kd=0.18, Limit=0.35, Tau=0.08s, OutputLimit=1.0
    this.steeringPid = new PidController(1.40, 0.05, 0.18, 0.35, 0.08, 1.0);
    this.currentSteering = 0.0;
    this.maxSteeringRate = 4.0; // units/second rate limiter
    this.steerDeadband = 0.003; // 0.003 radians
    this.kCte = 1.8;            // Cross-track error gain

    // ── 2. Speed PID Controller (Section 3.3 Baseline) ──
    // Kp=1.10, Ki=0.25, Kd=0.08, Limit=0.40, Tau=0.12s, OutputLimit=1.0
    this.speedPid = new PidController(1.10, 0.25, 0.08, 0.40, 0.12, 1.0);

    // ── 3. AI Racing Line & Trajectory State ──
    this.chosenLaneOffset = (Math.random() * 2 - 1) * 2.2;
    this.targetLaneOffset = this.chosenLaneOffset;
    this.laneHysteresis = 0.35; // 0.35m lane hysteresis
    this.replanTimer = 0.0;
    this.replanInterval = 1.0 / 15.0; // 15 Hz trajectory planning

    this.currentLap = 1;
    this.totalProgress = 0;
    this.isFinished = false;
    this.finishTime = 0;
  }

  /**
   * Evaluates maximum cornering speed including aerodynamic downforce:
   * F_normal(v) = m*g + 0.5*rho*ClA*v^2
   * Lateral capacity = mu * F_normal
   * Required lateral = m * v^2 * kappa
   */
  calculateAeroCorneringSpeed(kappa, surfaceMu = 1.0) {
    if (Math.abs(kappa) < 0.0001) return this.physics.maxSpeed;

    const m = 1500.0; // GT car mass
    const g = 9.81;
    const rho = 1.225;
    const clA = this.physics.clA || 1.80;
    const baseMu = 1.12 * surfaceMu;

    // Safety utilization factor: 0.72 novice, 0.85 standard, 0.93 elite
    const safetyUtilization = THREE.MathUtils.lerp(0.72, 0.93, (this.difficulty - 0.70) / 0.30);

    // Iterative solve for speed where Required Lateral = Safety * Capacity
    let vLow = 10.0;
    let vHigh = this.physics.maxSpeed;
    let vBest = vLow;

    for (let iter = 0; iter < 12; iter++) {
      const vMid = 0.5 * (vLow + vHigh);
      const downforce = 0.5 * rho * clA * vMid * vMid;
      const fNormal = (m * g) + downforce;
      const lateralCapacity = baseMu * fNormal;
      const requiredLateral = m * vMid * vMid * Math.abs(kappa);

      if (requiredLateral <= safetyUtilization * lateralCapacity) {
        vBest = vMid;
        vLow = vMid; // Try faster
      } else {
        vHigh = vMid; // Back off
      }
    }

    return THREE.MathUtils.clamp(vBest, 15.0, this.physics.maxSpeed);
  }

  /**
   * Preview upcoming curvature over lookahead window max(40m, speed * 2.0s)
   */
  getPreviewCurvature(currentU, speedMps) {
    if (!this.track || !this.track.trackLength) return 0.0;

    const totalLen = this.track.trackLength;
    const previewDistanceMeters = Math.max(40.0, speedMps * 2.0);
    const uSpan = previewDistanceMeters / totalLen;
    const numSamples = 8;
    let maxCurvature = 0.0;

    for (let i = 1; i <= numSamples; i++) {
      const u1 = ((currentU + (i / numSamples) * uSpan) % 1.0 + 1.0) % 1.0;
      const u0 = ((u1 - 0.005) % 1.0 + 1.0) % 1.0;
      const s0 = this.track.getSampleAt(u0);
      const s1 = this.track.getSampleAt(u1);
      if (s0 && s1) {
        const dot = THREE.MathUtils.clamp(s0.tangent.dot(s1.tangent), -1.0, 1.0);
        const angle = Math.acos(dot);
        const arcLen = Math.max(1.0, 0.005 * totalLen);
        const kappa = angle / arcLen;
        maxCurvature = Math.max(maxCurvature, kappa);
      }
    }

    return maxCurvature;
  }

  update(dt, allCars) {
    if (!this.track) return;

    const speedMps = Math.abs(this.physics.speed || 0.0);
    const currentU = this.physics.trackU;
    const carPos = this.physics.position;
    const carForward = this.physics.getForwardVector();
    const carRight = this.physics.getRightVector();

    // ── 1. Trajectory Replanning (15 Hz) ──
    this.replanTimer += dt;
    if (this.replanTimer >= this.replanInterval) {
      this.replanTimer = 0.0;

      // Obstacle & traffic avoidance lane bias
      let desiredLane = this.chosenLaneOffset;
      if (allCars) {
        for (const other of allCars) {
          if (other === this.physics) continue;
          const toOther = new THREE.Vector3().subVectors(other.position, carPos);
          const dist = toOther.length();
          if (dist < 22.0 && carForward.dot(toOther) > 0) {
            // Other vehicle is ahead within avoidance range
            const otherLat = other.lateralOffset || 0.0;
            const myLat = this.physics.lateralOffset;
            desiredLane = (myLat >= otherLat) ? myLat + 2.4 : myLat - 2.4;
          }
        }
      }

      // Apply lane hysteresis (0.35m) to prevent thrashing
      if (Math.abs(desiredLane - this.targetLaneOffset) > this.laneHysteresis) {
        this.targetLaneOffset = desiredLane;
      }
    }

    this.chosenLaneOffset = THREE.MathUtils.damp(this.chosenLaneOffset, this.targetLaneOffset, 4.0, dt);

    // ── 2. Dynamic Look-Ahead Distance: clamp(12 + 0.90 * speedMps, 18, 110) m ──
    const lookAheadMeters = THREE.MathUtils.clamp(12.0 + 0.90 * speedMps, 18.0, 110.0);
    const lookAheadU = (lookAheadMeters / Math.max(100.0, this.track.trackLength || 1000.0));
    const targetU = ((currentU + lookAheadU) % 1.0 + 1.0) % 1.0;
    const targetSample = this.track.getSampleAt(targetU);
    if (!targetSample) return;

    // ── 3. Steering Controller (Heading Error + Cross-Track Error) ──
    const targetPoint = targetSample.point.clone().addScaledVector(targetSample.binormal, this.chosenLaneOffset);
    const toTarget = targetPoint.clone().sub(carPos);

    // Heading error between car forward and target tangent
    const pathTangent = targetSample.tangent;
    const dot = THREE.MathUtils.clamp(carForward.dot(pathTangent), -1.0, 1.0);
    const crossY = carRight.dot(pathTangent);
    const headingError = Math.atan2(crossY, dot);

    // Signed Cross-Track Error (CTE)
    const currentSample = this.track.getSampleAt(currentU);
    let crossTrackError = 0.0;
    if (currentSample) {
      const roadCenter = currentSample.point.clone().addScaledVector(currentSample.binormal, this.chosenLaneOffset);
      const toRoad = carPos.clone().sub(roadCenter);
      crossTrackError = currentSample.binormal.dot(toRoad);
    }

    // Cross-track correction term: atan2(Kcte * CTE, speed + 2 m/s)
    const crossTrackTerm = Math.atan2(this.kCte * crossTrackError, speedMps + 2.0);
    let controlError = headingError - crossTrackTerm;

    // Apply deadband
    if (Math.abs(controlError) < this.steerDeadband) {
      controlError = 0.0;
    }

    // Steering PID Step
    const steerTarget = this.steeringPid.step(controlError, dt);
    // Rate limit steering output (4.0 units/second)
    this.currentSteering = THREE.MathUtils.clamp(
      this.currentSteering + THREE.MathUtils.clamp(steerTarget - this.currentSteering, -this.maxSteeringRate * dt, this.maxSteeringRate * dt),
      -1.0, 1.0
    );

    // ── 4. Speed Planner (Aero Capacity + Braking Distance) ──
    const previewKappa = this.getPreviewCurvature(currentU, speedMps);
    const cornerSpeed = this.calculateAeroCorneringSpeed(previewKappa, 1.0);
    const targetSpeed = cornerSpeed * this.difficulty;

    // Speed PID: Normalized speed error (target - current) / max(target, 10)
    const speedError = (targetSpeed - speedMps) / Math.max(targetSpeed, 10.0);
    const speedCommand = this.speedPid.step(speedError, dt);

    const throttleInput = Math.max(0.0, speedCommand);
    const brakeInput = Math.max(0.0, -speedCommand);

    // ── 5. Nitro Policy: Straights with high speed & sufficient fuel ──
    let nitroInput = false;
    if (previewKappa < 0.003 && speedMps > this.physics.maxSpeed * 0.75 && (this.physics.nitroFuel || 0) > 30.0) {
      nitroInput = true;
    }

    // ── 6. Execute Fixed-Step Vehicle Physics Update ──
    this.physics.update(dt, {
      throttle: throttleInput,
      brake: brakeInput,
      steer: this.currentSteering,
      handbrake: false,
      nitro: nitroInput
    });
  }
}

window.AIRacer = AIRacer;
window.PidController = PidController;
