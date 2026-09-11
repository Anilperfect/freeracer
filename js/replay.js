// ============================================================================
// TURBO RUSH - FINISH LINE CINEMATIC REPLAY SYSTEM
// ============================================================================
// Records a 6-second circular buffer of vehicle transforms leading up to the
// finish line, then plays dynamic multi-angle cinematic cameras with slow-mo.

class ReplayManager {
  constructor(camera, scene) {
    this.camera = camera;
    this.scene = scene;

    this.maxBufferDuration = 6.0; // seconds
    this.buffer = []; // { time, player: { pos, quat, speed, nitro }, rivals: [{ pos, quat }] }
    this.isRecording = false;
    this.isPlaying = false;

    // Playback state
    this.playbackTime = 0;
    this.playbackSpeed = 1.0;
    this.playbackDuration = 0;
    this.cameraShotIndex = 0;
    this.cameraShotTimer = 0;

    // Camera shot definitions
    this.shots = [
      { name: 'CHASE_SWEEP', duration: 2.2 },
      { name: 'GANTRY_STATIC', duration: 2.0 },
      { name: 'WHEEL_CAM', duration: 1.8 },
      { name: 'DRONE_ORBIT', duration: 2.5 }
    ];

    // Overlay UI element
    this.uiContainer = null;
    this.onReplayFinishedCallback = null;

    this._createUI();
  }

  _createUI() {
    let container = document.getElementById('replay-overlay');
    if (!container) {
      container = document.createElement('div');
      container.id = 'replay-overlay';
      container.style.display = 'none';
      container.innerHTML = `
        <div class="replay-top-bar">
          <div class="replay-badge"><span class="rec-dot"></span> REPLAY</div>
          <div class="replay-shot-label" id="replay-shot-name">CHASE SWEEP</div>
        </div>
        <div class="replay-controls-bar">
          <button class="replay-btn" id="replay-speed-slow">0.5x</button>
          <button class="replay-btn active" id="replay-speed-norm">1.0x</button>
          <button class="replay-btn" id="replay-speed-fast">2.0x</button>
          <button class="replay-btn" id="replay-toggle-pause">❚❚ PAUSE</button>
          <button class="replay-btn replay-skip-btn" id="replay-btn-skip">SKIP REPLAY ▶▶</button>
        </div>
      `;
      document.body.appendChild(container);
    }
    this.uiContainer = container;

    // Wire up replay buttons
    const btnSlow = document.getElementById('replay-speed-slow');
    const btnNorm = document.getElementById('replay-speed-norm');
    const btnFast = document.getElementById('replay-speed-fast');
    const btnPause = document.getElementById('replay-toggle-pause');
    const btnSkip = document.getElementById('replay-btn-skip');

    if (btnSlow) {
      btnSlow.onclick = () => {
        this.playbackSpeed = 0.5;
        this._updateSpeedButtons('slow');
      };
    }
    if (btnNorm) {
      btnNorm.onclick = () => {
        this.playbackSpeed = 1.0;
        this._updateSpeedButtons('norm');
      };
    }
    if (btnFast) {
      btnFast.onclick = () => {
        this.playbackSpeed = 2.0;
        this._updateSpeedButtons('fast');
      };
    }
    if (btnPause) {
      btnPause.onclick = () => {
        if (this.playbackSpeed === 0) {
          this.playbackSpeed = 1.0;
          btnPause.textContent = '❚❚ PAUSE';
        } else {
          this.playbackSpeed = 0;
          btnPause.textContent = '▶ PLAY';
        }
      };
    }
    if (btnSkip) {
      btnSkip.onclick = () => {
        this.stopPlayback();
      };
    }
  }

  _updateSpeedButtons(active) {
    const s = document.getElementById('replay-speed-slow');
    const n = document.getElementById('replay-speed-norm');
    const f = document.getElementById('replay-speed-fast');
    if (s) s.classList.toggle('active', active === 'slow');
    if (n) n.classList.toggle('active', active === 'norm');
    if (f) f.classList.toggle('active', active === 'fast');
  }

  startRecording() {
    this.buffer = [];
    this.isRecording = true;
    this.isPlaying = false;
  }

  recordFrame(dt, playerCar, rivalCars) {
    if (!this.isRecording || !playerCar || !playerCar.group) return;

    const frame = {
      timestamp: this.buffer.length > 0 ? this.buffer[this.buffer.length - 1].timestamp + dt : 0,
      player: {
        pos: playerCar.group.position.clone(),
        quat: playerCar.group.quaternion.clone(),
        speed: playerCar.physics ? playerCar.physics.speed : 0,
        nitro: playerCar.physics ? playerCar.physics.isNitroActive : false
      },
      rivals: []
    };

    if (rivalCars && Array.isArray(rivalCars)) {
      for (const rival of rivalCars) {
        if (rival && rival.car && rival.car.group) {
          frame.rivals.push({
            pos: rival.car.group.position.clone(),
            quat: rival.car.group.quaternion.clone()
          });
        }
      }
    }

    this.buffer.push(frame);

    // Keep only last maxBufferDuration seconds
    while (this.buffer.length > 1 && (this.buffer[this.buffer.length - 1].timestamp - this.buffer[0].timestamp) > this.maxBufferDuration) {
      this.buffer.shift();
    }
  }

  playReplay(onFinished) {
    if (this.buffer.length < 10) {
      // Buffer too short to replay
      if (onFinished) onFinished();
      return;
    }

    this.isRecording = false;
    this.isPlaying = true;
    this.playbackTime = 0;
    this.playbackDuration = this.buffer[this.buffer.length - 1].timestamp - this.buffer[0].timestamp;
    this.cameraShotIndex = 0;
    this.cameraShotTimer = 0;
    this.playbackSpeed = 1.0;
    this.onReplayFinishedCallback = onFinished;

    if (this.uiContainer) {
      this.uiContainer.style.display = 'block';
    }
    this._updateShotLabel();
  }

  _updateShotLabel() {
    const el = document.getElementById('replay-shot-name');
    if (el && this.shots[this.cameraShotIndex]) {
      el.textContent = this.shots[this.cameraShotIndex].name.replace('_', ' ');
    }
  }

  update(dt, playerCar, rivalCars) {
    if (!this.isPlaying) return;

    this.playbackTime += dt * this.playbackSpeed;
    this.cameraShotTimer += dt * this.playbackSpeed;

    // Check if shot expired
    const currentShot = this.shots[this.cameraShotIndex];
    if (this.cameraShotTimer >= currentShot.duration) {
      this.cameraShotTimer = 0;
      this.cameraShotIndex = (this.cameraShotIndex + 1) % this.shots.length;
      this._updateShotLabel();
    }

    // Finished entire replay?
    if (this.playbackTime >= this.playbackDuration) {
      this.stopPlayback();
      return;
    }

    // Interpolate transforms for playbackTime
    const frameData = this._sampleBuffer(this.playbackTime);
    if (!frameData) return;

    // Apply interpolated transform to player car
    if (playerCar && playerCar.group) {
      playerCar.group.position.copy(frameData.player.pos);
      playerCar.group.quaternion.copy(frameData.player.quat);
      if (playerCar.setNitroFlamesActive) {
        playerCar.setNitroFlamesActive(frameData.player.nitro);
      }
    }

    // Apply to rivals
    if (rivalCars && frameData.rivals) {
      for (let i = 0; i < Math.min(rivalCars.length, frameData.rivals.length); i++) {
        const rCar = rivalCars[i].car || rivalCars[i];
        if (rCar && rCar.group && frameData.rivals[i]) {
          rCar.group.position.copy(frameData.rivals[i].pos);
          rCar.group.quaternion.copy(frameData.rivals[i].quat);
        }
      }
    }

    // Position cinematic camera
    this._applyCameraShot(currentShot.name, frameData.player);
  }

  _applyCameraShot(shotName, playerFrame) {
    const carPos = playerFrame.pos;
    const carQuat = playerFrame.quat;

    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(carQuat);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(carQuat);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(carQuat);

    if (shotName === 'CHASE_SWEEP') {
      // Sweeping dynamic side-to-rear low tracking shot
      const sweepAngle = (this.cameraShotTimer / 2.2) * Math.PI * 0.4;
      const offset = right.clone().multiplyScalar(Math.sin(sweepAngle) * 9.0)
        .add(fwd.clone().multiplyScalar(-9.0 + Math.cos(sweepAngle) * 3.0))
        .add(up.clone().multiplyScalar(2.8));

      this.camera.position.copy(carPos).add(offset);
      this.camera.up.copy(up);
      this.camera.lookAt(carPos.clone().add(fwd.clone().multiplyScalar(4.0)).add(up.clone().multiplyScalar(1.0)));
    } else if (shotName === 'GANTRY_STATIC') {
      // High-angle gantry looking back as car rushes past
      const gantryOffset = fwd.clone().multiplyScalar(16.0).add(up.clone().multiplyScalar(6.5)).add(right.clone().multiplyScalar(4.0));
      this.camera.position.copy(carPos).add(gantryOffset);
      this.camera.up.copy(up);
      this.camera.lookAt(carPos.clone().add(up.clone().multiplyScalar(0.8)));
    } else if (shotName === 'WHEEL_CAM') {
      // Ultra-low wheel camera angled up at chassis
      const wheelOffset = right.clone().multiplyScalar(2.6).add(fwd.clone().multiplyScalar(-1.5)).add(up.clone().multiplyScalar(0.5));
      this.camera.position.copy(carPos).add(wheelOffset);
      this.camera.up.copy(up);
      this.camera.lookAt(carPos.clone().add(fwd.clone().multiplyScalar(8.0)).add(up.clone().multiplyScalar(1.2)));
    } else if (shotName === 'DRONE_ORBIT') {
      // Orbiting drone high above car
      const orbitAngle = (this.cameraShotTimer / 2.5) * Math.PI * 1.5;
      const orbitOffset = new THREE.Vector3(Math.cos(orbitAngle) * 14.0, 10.0, Math.sin(orbitAngle) * 14.0);
      this.camera.position.copy(carPos).add(orbitOffset);
      this.camera.up.set(0, 1, 0);
      this.camera.lookAt(carPos);
    }
  }

  _sampleBuffer(t) {
    if (this.buffer.length === 0) return null;
    const baseTime = this.buffer[0].timestamp;
    const targetTime = baseTime + t;

    // Find bounding frames
    let idx = 0;
    while (idx < this.buffer.length - 1 && this.buffer[idx + 1].timestamp <= targetTime) {
      idx++;
    }

    if (idx >= this.buffer.length - 1) {
      return this.buffer[this.buffer.length - 1];
    }

    const f0 = this.buffer[idx];
    const f1 = this.buffer[idx + 1];
    const span = f1.timestamp - f0.timestamp;
    const alpha = span > 0.0001 ? (targetTime - f0.timestamp) / span : 0;

    return {
      player: {
        pos: f0.player.pos.clone().lerp(f1.player.pos, alpha),
        quat: f0.player.quat.clone().slerp(f1.player.quat, alpha),
        speed: THREE.MathUtils.lerp(f0.player.speed, f1.player.speed, alpha),
        nitro: f0.player.nitro
      },
      rivals: f0.rivals.map((r0, i) => {
        const r1 = f1.rivals[i] || r0;
        return {
          pos: r0.pos.clone().lerp(r1.pos, alpha),
          quat: r0.quat.clone().slerp(r1.quat, alpha)
        };
      })
    };
  }

  stopPlayback() {
    this.isPlaying = false;
    if (this.uiContainer) {
      this.uiContainer.style.display = 'none';
    }

    if (this.onReplayFinishedCallback) {
      const cb = this.onReplayFinishedCallback;
      this.onReplayFinishedCallback = null;
      cb();
    }
  }
}

window.ReplayManager = ReplayManager;
