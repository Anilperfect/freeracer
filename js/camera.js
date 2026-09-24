/**
 * Dynamic 3D Anti-Gravity Camera System for Turbo Rush.
 * Supports smooth 3D vehicle chase tracking, first-person cockpit camera,
 * dynamic speed FOV warp, collision camera shake, and orientation alignment
 * across 90° wall riding, loops, and inverted ceilings.
 */
class ChaseCamera {
  constructor(camera, targetPhysics) {
    this.camera = camera;
    this.target = targetPhysics;

    this.modes = ['CHASE', 'COCKPIT', 'CINEMATIC'];
    this.currentModeIndex = 0;

    // Tracking offsets
    this.chaseDistance = 7.2;
    this.chaseHeight = 2.4;
    this.smoothPosRate = 12.0;
    this.smoothRotRate = 16.0;

    // Dynamic FOV baseline (Section 3.1: 75° to 94° between 15 and 85 m/s)
    this.baseFov = 75.0;
    this.maxFov = 94.0;
    this.fovStartSpeed = 15.0; // m/s (54 km/h)
    this.fovFullSpeed = 85.0;  // m/s (306 km/h)
    this.fovResponseTime = 0.25; // seconds

    // Acceleration offset spring (4.0 Hz, damping ratio ζ = 0.90)
    this.accelOffset = new THREE.Vector3();
    this.accelOffsetVelocity = new THREE.Vector3();
    this.springOmega = 2.0 * Math.PI * 4.0; // 4.0 Hz
    this.springZeta = 0.90;

    // Shake
    this.shakeIntensity = 0;
    this.enableShake = true;

    // Internal vectors
    this.currentCameraPos = new THREE.Vector3();
    this.currentLookAt = new THREE.Vector3();
    this.currentUp = new THREE.Vector3(0, 1, 0);

    // Initial position behind target car
    if (this.target) {
      const carPos = this.target.position;
      const carForward = typeof this.target.getForwardVector === 'function'
        ? this.target.getForwardVector()
        : new THREE.Vector3(0, 0, 1).applyQuaternion(this.target.quaternion || new THREE.Quaternion());
      const carUp = typeof this.target.getUpVector === 'function'
        ? this.target.getUpVector()
        : new THREE.Vector3(0, 1, 0).applyQuaternion(this.target.quaternion || new THREE.Quaternion());

      this.currentCameraPos.copy(carPos).addScaledVector(carForward, -this.chaseDistance).addScaledVector(carUp, this.chaseHeight);
      this.currentLookAt.copy(carPos).addScaledVector(carForward, 6.0).addScaledVector(carUp, 0.9);
      this.currentUp.copy(carUp);

      this.camera.position.copy(this.currentCameraPos);
      this.camera.up.copy(this.currentUp);
      this.camera.lookAt(this.currentLookAt);
    }
  }

  toggleView() {
    this.currentModeIndex = (this.currentModeIndex + 1) % this.modes.length;
    return this.modes[this.currentModeIndex];
  }

  setMode(modeName) {
    const idx = this.modes.indexOf(modeName);
    if (idx !== -1) this.currentModeIndex = idx;
  }

  addShake(amount = 0.5) {
    if (!this.enableShake) return;
    if (window.Accessibility && window.Accessibility.get('reduceMotion')) return;
    this.shakeIntensity = Math.min(1.5, this.shakeIntensity + amount);
  }

  update(dt) {
    if (!this.target) return;

    const carPos = this.target.position;
    const carForward = typeof this.target.getForwardVector === 'function'
      ? this.target.getForwardVector()
      : new THREE.Vector3(0, 0, 1).applyQuaternion(this.target.quaternion || new THREE.Quaternion());
    const carUp = typeof this.target.getUpVector === 'function'
      ? this.target.getUpVector()
      : new THREE.Vector3(0, 1, 0).applyQuaternion(this.target.quaternion || new THREE.Quaternion());
    const carRight = typeof this.target.getRightVector === 'function'
      ? this.target.getRightVector()
      : new THREE.Vector3(1, 0, 0).applyQuaternion(this.target.quaternion || new THREE.Quaternion());

    const speedMps = Math.abs(this.target.speed || 0.0);
    const speedRatio = Math.min(1.0, speedMps / Math.max(1, this.target.maxSpeed));

    // ── 1. Dynamic FOV (Section 3.1: FOVtarget = lerp(75°, 94°, smoothstep(15, 85, speedMps))) ──
    const fovStep = THREE.MathUtils.smoothstep(speedMps, this.fovStartSpeed, this.fovFullSpeed);
    let nitroFovBoost = 0;
    if (this.target.isNitroActive) {
      if (this.target.nitroTier === 'overdrive') nitroFovBoost = 6.0;
      else if (this.target.nitroTier === 'precision') nitroFovBoost = 4.0;
      else nitroFovBoost = 2.5;
    }

    const targetFov = THREE.MathUtils.lerp(this.baseFov, this.maxFov, fovStep) + nitroFovBoost;
    // Critically damped FOV with 0.25s response time
    const fovDampRate = 1.0 / Math.max(0.01, this.fovResponseTime);
    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, fovDampRate, dt);
    this.camera.updateProjectionMatrix();

    // ── 2. Acceleration Spring Offset (4.0 Hz, ζ = 0.90) ──
    const accel = this.target.linearAcceleration || new THREE.Vector3();
    const invQuat = (this.target.quaternion || new THREE.Quaternion()).clone().invert();
    const localA = accel.clone().applyQuaternion(invQuat);

    const targetOffsetX = THREE.MathUtils.clamp(-localA.x * 0.008, -0.06, 0.06);
    const targetOffsetZ = THREE.MathUtils.clamp(-localA.z * 0.012, -0.12, 0.12);
    const targetOffset = new THREE.Vector3(targetOffsetX, 0.0, targetOffsetZ);

    // Spring calculation: F = -k*x - c*v
    const fSpring = targetOffset.clone().sub(this.accelOffset).multiplyScalar(this.springOmega * this.springOmega);
    const fDamp = this.accelOffsetVelocity.clone().multiplyScalar(2.0 * this.springZeta * this.springOmega);
    const springAccel = fSpring.sub(fDamp);
    this.accelOffsetVelocity.addScaledVector(springAccel, dt);
    this.accelOffset.addScaledVector(this.accelOffsetVelocity, dt);

    // Check landing impact from physics
    if (this.target.landingImpact && this.target.landingImpact > 0.04) {
      this.addShake(this.target.landingImpact * 2.2);
    }

    // Mode calculations
    const mode = this.modes[this.currentModeIndex];
    let desiredPos = new THREE.Vector3();
    let desiredLookAt = new THREE.Vector3();
    
    // Horizon stabilization: 0.30 normal, 0.10 during airborne state
    const horizonFactor = this.target.isAirborne ? 0.10 : 0.30;
    let desiredUp = carUp.clone().lerp(new THREE.Vector3(0, 1, 0), horizonFactor).normalize();

    const carConfig = (this.target && this.target.car && this.target.car.config) || null;
    const driverAnchor = (carConfig && carConfig.anchors && carConfig.anchors.driverCamera) || { x: -0.36, y: 1.05, z: -0.05, fov: 66 };
    const chaseAnchor = (carConfig && carConfig.anchors && carConfig.anchors.chaseCamera) || { distance: 7.0, height: 2.2, pitch: 0.9 };

    if (mode === 'CHASE') {
      if (this.camera.near !== 0.15) {
        this.camera.near = 0.15;
        this.camera.updateProjectionMatrix();
      }
      // Speed-sensitive chase distance & height suction
      const backDist = chaseAnchor.distance + (speedRatio * 2.0);
      const chaseH = Math.max(1.6, chaseAnchor.height - (speedRatio * 0.22));

      desiredPos.copy(carPos)
        .addScaledVector(carForward, -backDist)
        .addScaledVector(carUp, chaseH)
        .addScaledVector(carRight, this.accelOffset.x)
        .addScaledVector(carForward, this.accelOffset.z);

      // ── 3. Dynamic Apex Look-Ahead (clamp(speed * 1.2s, 25m, 120m)) ──
      const lookDist = THREE.MathUtils.clamp(speedMps * 1.2, 25.0, 120.0);
      desiredLookAt.copy(carPos)
        .addScaledVector(carForward, lookDist)
        .addScaledVector(carUp, chaseAnchor.pitch);

      if (this.target.track && this.target.track.trackLength) {
        const uAhead = ((this.target.trackU + (lookDist / this.target.track.trackLength)) % 1.0 + 1.0) % 1.0;
        const apexSample = this.target.track.getSampleAt(uAhead);
        if (apexSample) {
          // Blend vehicle-forward lookat with apex direction up to ±12°
          const toApex = apexSample.point.clone().sub(carPos);
          const apexProj = carRight.dot(toApex);
          const apexYawClamp = THREE.MathUtils.clamp(apexProj * 0.25, -lookDist * Math.tan(12.0 * Math.PI / 180.0), lookDist * Math.tan(12.0 * Math.PI / 180.0));
          desiredLookAt.addScaledVector(carRight, apexYawClamp * 0.45);
        }
      }

    } else if (mode === 'COCKPIT') {
      if (this.camera.near !== 0.05) {
        this.camera.near = 0.05;
        this.camera.updateProjectionMatrix();
      }
      const eyeH = (driverAnchor && driverAnchor.eyeHeight) ? driverAnchor.eyeHeight : 1.26;
      const pitchH = (driverAnchor && driverAnchor.pitchHeight) ? driverAnchor.pitchHeight : 1.15;
      const eyeZ = (driverAnchor && driverAnchor.z !== undefined) ? driverAnchor.z : 0.65;
      const eyeX = (driverAnchor && driverAnchor.x !== undefined) ? driverAnchor.x : -0.36;

      desiredPos.copy(carPos)
        .addScaledVector(carForward, eyeZ + this.accelOffset.z * 0.5)
        .addScaledVector(carUp, eyeH)
        .addScaledVector(carRight, eyeX + this.accelOffset.x * 0.5);

      desiredLookAt.copy(carPos)
        .addScaledVector(carForward, 35.0)
        .addScaledVector(carUp, pitchH)
        .addScaledVector(carRight, -0.15);

    } else if (mode === 'CINEMATIC') {
      desiredPos.copy(carPos)
        .addScaledVector(carForward, -12)
        .addScaledVector(carUp, 14)
        .addScaledVector(carRight, 8);
      desiredLookAt.copy(carPos);
    }

    // Smooth position and target damping
    this.currentCameraPos.lerp(desiredPos, Math.min(1.0, this.smoothPosRate * dt));
    this.currentLookAt.lerp(desiredLookAt, Math.min(1.0, this.smoothRotRate * dt));
    this.currentUp.lerp(desiredUp, Math.min(1.0, 14.0 * dt));

    // Camera collision shake
    if (this.shakeIntensity > 0.01) {
      const shakeOffset = carRight.clone().multiplyScalar((Math.random() * 2 - 1) * this.shakeIntensity * 0.35)
        .addScaledVector(carUp, (Math.random() * 2 - 1) * this.shakeIntensity * 0.35);
      this.currentCameraPos.add(shakeOffset);
      this.shakeIntensity = Math.max(0, this.shakeIntensity - dt * 2.8);
    }

    this.camera.position.copy(this.currentCameraPos);
    this.camera.up.copy(this.currentUp);
    this.camera.lookAt(this.currentLookAt);
  }
}

window.ChaseCamera = ChaseCamera;
