/**
 * FreeRacer - Open-world manager (FREE_ROAM game state)
 * ---------------------------------------------------------------------------
 * Owns the district lifecycle and the free-roam frame:
 *   world build/attach · player car & physics · chase camera with wall
 *   avoidance · traffic · events · discoveries · garage entry · HUD/minimap ·
 *   pause menu · keyboard/gamepad interaction · position persistence.
 *
 * The GameEngine calls frame(dt) every animation frame while in FREE_ROAM.
 */
(function () {
  const FIXED_DT = 1 / 120;
  const MAX_STEPS = 6;

  class OpenWorldCamera extends window.ChaseCamera {
    constructor(camera, target, collision) {
      super(camera, target);
      this.collision = collision;
      this._probe = new THREE.Vector3();
    }

    update(dt) {
      super.update(dt);
      if (!this.collision || this.modes[this.currentModeIndex] === 'COCKPIT') return;
      // Pull the camera in front of any building between the car and the camera.
      const carPos = this.target.position;
      const cam = this.camera.position;
      const steps = 10;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        this._probe.lerpVectors(carPos, cam, t);
        const hit = this.collision.resolveCircle(this._probe.x, this._probe.z, 0.6, this._probe.y);
        if (hit && this._probe.y < hit.box.maxY) {
          const safeT = Math.max(0.12, (i - 1) / steps);
          this.camera.position.lerpVectors(carPos, cam, safeT);
          this.camera.position.y = Math.max(this.camera.position.y, carPos.y + 1.2);
          this.currentCameraPos.copy(this.camera.position);
          this.camera.lookAt(this.currentLookAt);
          break;
        }
      }
    }
  }

  class OpenWorldManager {
    constructor(game) {
      this.game = game;
      this.scene = game.scene;
      this.camera = game.camera;
      this.renderer = game.renderer;
      this.district = window.DistrictApexDowntown;
      this.eventDefs = window.DistrictApexDowntownEvents || [];
      this.built = false;
      this.active = false;
      this.paused = false;
      this.network = null;
      this.world = null;
      this.worldQuery = null;
      this.traffic = null;
      this.events = null;
      this.player = null;        // FreeVehiclePhysics
      this.playerCar = null;     // CarModel
      this.playerCarId = null;
      this.chaseCamera = null;
      this.hud = null;
      this.accumulator = 0;
      this.time = 0;
      this.menuTime = 0;
      this.prompt = null;
      this.nearGarage = false;
      this.discoveryMeshes = [];
      this.stats = { distance: 0 };
      this.saveTimer = 0;
      this.frameCount = 0;
      this.perf = { fps: 60, frames: 0, acc: 0 };
      this.pauseMenuOpen = false;
      this.resultsOpen = false;
      this._trafficNear = [];
      this.onKeyDown = this.onKeyDown.bind(this);
      this.setupDom();
    }

    // ── World lifecycle ──────────────────────────────────────────────────
    prepare() {
      if (this.built) return;
      const t0 = performance.now();
      this.network = new window.RoadNetwork(this.district);
      const quality = this.getQualityPreset();
      this.world = new window.WorldBuilder(this.scene, this.district, this.network, quality);
      this.worldQuery = {
        network: this.network,
        collision: this.world.collision,
        spawn: this.district.spawn,
        getGroundHeight: (x, z) => this.world.getGroundHeight(x, z),
        surfaceAt: (x, z) => this.world.surfaceAt(x, z)
      };
      this.events = new window.EventSystem(this, this.eventDefs);
      this.buildDiscoveryMarkers();
      this.buildGarageMarker();
      this.built = true;
      this.buildMs = performance.now() - t0;
      console.info(`[OpenWorld] ${this.district.name} built in ${this.buildMs.toFixed(0)} ms — ${this.world.stats.buildings} buildings, ${this.world.stats.drawCalls} static draw calls`);
      this.detach();
    }

    getQualityPreset() {
      const sel = document.getElementById('settings-graphics');
      const v = sel ? sel.value : 'high';
      return v === 'low' ? 'low' : (v === 'medium' ? 'medium' : 'high');
    }

    attach() {
      if (!this.built) this.prepare();
      [this.world.group, this.events.markerGroup, this.events.gateGroup, this.discoveryGroup, this.garageGroup].forEach((g) => {
        if (g && g.parent !== this.scene) this.scene.add(g);
      });
    }

    detach() {
      [this.world && this.world.group, this.events && this.events.markerGroup, this.events && this.events.gateGroup, this.discoveryGroup, this.garageGroup].forEach((g) => {
        if (g && g.parent === this.scene) this.scene.remove(g);
      });
    }

    applyLighting() {
      const g = this.game;
      const p = g.pipeline;
      if (p && p.lightingProfiles) {
        if (!p.lightingProfiles.neon_dusk) {
          p.lightingProfiles.neon_dusk = {
            name: 'Neon Dusk', bg: 0x1a0f2e, fogColor: 0x2b1745, fogDensity: 0.00105,
            hemiSky: 0x7a5cff, hemiGround: 0x1a0d20, hemiInt: 0.62,
            dirColor: 0xff9a5c, dirInt: 1.15, dirPos: [600, 160, -900],
            exposure: 1.08, contrast: 1.08, saturation: 1.14, tint: 0xfff2ff,
            bloomThreshold: 0.70, bloomStrength: 0.80, bloomRadius: 0.55
          };
        }
        p.applyLightingProfile('neon_dusk', g.sceneLight_hemi, g.sceneLight_dir);
      } else {
        this.scene.background = new THREE.Color(0x1a0f2e);
        this.scene.fog = new THREE.FogExp2(0x2b1745, 0.00105);
        if (g.sceneLight_hemi) { g.sceneLight_hemi.color.setHex(0x7a5cff); g.sceneLight_hemi.groundColor.setHex(0x1a0d20); g.sceneLight_hemi.intensity = 0.62; }
        if (g.sceneLight_dir) { g.sceneLight_dir.color.setHex(0xff9a5c); g.sceneLight_dir.intensity = 1.15; g.sceneLight_dir.position.set(600, 160, -900); }
      }
      // shadows over a 1.2 km city are wasteful — keep the sun light but make its shadow frustum follow the player
      if (g.sceneLight_dir) {
        g.sceneLight_dir.castShadow = this.getQualityPreset() !== 'low';
      }
    }

    /**
     * Enter free roam.
     * @param {object} opts { carId, spawn: {x,z,yaw} | 'garage' | 'last' }
     */
    enter(opts = {}) {
      this.attach();
      this.applyLighting();
      this.camera.far = 3400;
      this.camera.updateProjectionMatrix();

      const carId = opts.carId || (window.SaveManager ? window.SaveManager.getSelectedCarId() : 'v01_kairo_pulse_s');
      this.spawnPlayer(carId, this.resolveSpawn(opts.spawn));

      const density = window.SaveManager ? window.SaveManager.getSetting('trafficDensity', 'normal') : 'normal';
      if (!this.traffic) this.traffic = new window.TrafficSystem(this.scene, this.network, this.world, density);
      else { this.traffic.setDensity(density); if (this.traffic.group.parent !== this.scene) this.scene.add(this.traffic.group); }

      this.chaseCamera = new OpenWorldCamera(this.camera, this.player, this.world.collision);
      const savedMode = window.SaveManager ? window.SaveManager.getSetting('cameraMode', 'CHASE') : 'CHASE';
      this.chaseCamera.setMode(savedMode);
      this.hud = new window.OpenWorldHUD(this);
      this.active = true;
      this.paused = false;
      this.accumulator = 0;
      this.showHud(true);
      window.addEventListener('keydown', this.onKeyDown);

      if (window.SoundEngine) {
        window.SoundEngine.ensureContext && window.SoundEngine.ensureContext();
        window.SoundEngine.setVehicleProfile(carId);
        window.SoundEngine.startMusic('cruising');
      }
      const profile = window.SaveManager ? window.SaveManager.getProfile() : null;
      if (profile && !profile.progress.introSeen) {
        profile.progress.introSeen = true;
        window.SaveManager.save();
        this.toast(`Welcome to ${this.district.name}. Drive into a glowing pad to start an event.`, 'info', 6);
      } else {
        this.toast(`${this.district.name}`, 'info', 3);
      }
      if (window.SaveManager && window.SaveManager.recoveredFromCorruption) {
        window.SaveManager.recoveredFromCorruption = false;
        this.toast('Previous save was unreadable — a fresh profile was created (backup kept).', 'warn', 8);
      }
    }

    resolveSpawn(spawn) {
      const d = this.district;
      if (spawn && typeof spawn === 'object') return spawn;
      if (spawn === 'garage') return d.garage.spawn;
      if (spawn === 'last' && window.SaveManager) {
        const lp = window.SaveManager.getProfile().progress.lastPosition;
        if (lp && Number.isFinite(lp.x) && Number.isFinite(lp.z)) {
          // only trust it if it is near a road
          const near = this.network.nearestRoadPoint(lp.x, lp.z, 40);
          if (near) return lp;
        }
      }
      return d.spawn;
    }

    spawnPlayer(carId, pose) {
      this.removePlayer();
      const cfg = window.getCarById(carId) || window.CarDatabase[0];
      this.playerCarId = cfg.id;
      this.playerCar = new window.CarModel(cfg.colorHex, true, cfg.id, 0);
      this.player = new window.FreeVehiclePhysics(this.playerCar, this.worldQuery, true, cfg);
      this.scene.add(this.playerCar.group);
      if (window.SaveManager) {
        const profile = window.SaveManager.getProfile();
        if (profile.upgrades && profile.upgrades[cfg.id]) this.player.applyUpgrades(profile.upgrades[cfg.id]);
        if (profile.cosmetics && profile.cosmetics[cfg.id] && this.playerCar.setCustomization) this.playerCar.setCustomization(profile.cosmetics[cfg.id]);
        this.player.setAssistLevel(window.SaveManager.getAssistLevel());
      }
      this.player.setPose(pose.x, pose.z, pose.yaw);
      this.player.onImpact = (strength) => {
        if (this.chaseCamera) this.chaseCamera.addShake(Math.min(1.2, strength * 0.06));
        if (this.events && this.events.state === 'running') this.events.collisionCount++;
      };
      this.player.onVehicleImpact = (strength) => {
        if (strength > 3 && this.chaseCamera) this.chaseCamera.addShake(Math.min(1.0, strength * 0.05));
        if (strength > 3 && window.SoundEngine) window.SoundEngine.playImpact(Math.min(1, strength / 14));
      };
      if (this.chaseCamera) this.chaseCamera.target = this.player;
    }

    removePlayer() {
      if (this.playerCar && this.playerCar.group) this.scene.remove(this.playerCar.group);
      this.playerCar = null;
      this.player = null;
    }

    exit() {
      if (!this.active) return;
      this.persistPosition(true);
      if (this.events && this.events.state !== 'idle') this.events.end(true);
      this.hideAllOverlays();
      this.showHud(false);
      window.removeEventListener('keydown', this.onKeyDown);
      this.removePlayer();
      if (this.traffic) { this.traffic.dispose(); this.traffic = null; }
      this.detach();
      this.camera.far = 1200;
      this.camera.updateProjectionMatrix();
      this.active = false;
      this.paused = false;
      if (window.SoundEngine) {
        window.SoundEngine.stopMusic();
        if (typeof window.SoundEngine.silenceGameplayAudio === 'function') window.SoundEngine.silenceGameplayAudio();
      }
    }

    // ── Discoveries & garage markers ─────────────────────────────────────
    buildDiscoveryMarkers() {
      this.discoveryGroup = new THREE.Group();
      this.discoveryGroup.name = 'discoveries';
      const geo = new THREE.OctahedronGeometry(1.4, 0);
      this.discoveryMeshes = this.district.discoveries.map((d) => {
        const found = window.SaveManager ? window.SaveManager.hasDiscovery(d.id) : false;
        const mat = new THREE.MeshBasicMaterial({ color: 0xffc93c, transparent: true, opacity: found ? 0.0 : 0.9, depthWrite: false });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(d.x, 6 + (this.world ? this.world.getGroundHeight(d.x, d.z) : 0), d.z);
        mesh.visible = !found;
        mesh.userData.discovery = d;
        this.discoveryGroup.add(mesh);
        return mesh;
      });
      this.scene.add(this.discoveryGroup);
    }

    buildGarageMarker() {
      const g = this.district.garage;
      this.garageGroup = new THREE.Group();
      const ringGeo = new THREE.RingGeometry(g.entry.radius - 1.2, g.entry.radius, 40);
      ringGeo.rotateX(-Math.PI / 2);
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: window.EventSystem.COLORS.garage, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
      ring.position.set(g.entry.x, 0.07, g.entry.z);
      const label = window.EventSystem.makeTextSprite('Garage', '#7dff6a', 'Tune · Paint · Switch car');
      label.position.set(g.entry.x, 10, g.entry.z);
      this.garageGroup.add(ring, label);
      this.garageRing = ring;
      this.scene.add(this.garageGroup);
    }

    // ── Frame ─────────────────────────────────────────────────────────────
    frame(dt) {
      if (!this.active) return;
      this.perf.frames++; this.perf.acc += dt;
      if (this.perf.acc >= 0.5) { this.perf.fps = this.perf.frames / this.perf.acc; this.perf.frames = 0; this.perf.acc = 0; }

      const input = this.paused ? { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false, reset: false } : this.game.pollNormalizedInputs();
      this.handleGamepadMeta(input);

      if (!this.paused) {
        this.accumulator = Math.min(this.accumulator + dt, FIXED_DT * MAX_STEPS);
        let steps = 0;
        while (this.accumulator >= FIXED_DT && steps < MAX_STEPS) {
          this.fixedStep(FIXED_DT, input);
          this.accumulator -= FIXED_DT;
          steps++;
        }
        const alpha = this.accumulator / FIXED_DT;
        this.player.interpolateVisuals(alpha);
        if (this.events) this.events.rivals.forEach((ai) => ai.physics.interpolateVisuals(alpha));
        this.time += dt;
        this.saveTimer += dt;
        if (this.saveTimer > 20) { this.saveTimer = 0; this.persistPosition(false); }
      }

      if (this.chaseCamera) this.chaseCamera.update(this.paused ? 0.0001 : dt);
      this.followShadow();
      if (this.hud) this.hud.update(dt);
      if (this.game.weather) this.game.weather.update(dt, this.camera.position);
      const pipe = this.game.pipeline;
      if (pipe) {
        pipe.update(dt, this.player.getSpeedKmh(), this.player.isNitroActive, this.player.nitroTier || 'standard');
        pipe.render();
      } else {
        this.renderer.render(this.scene, this.camera);
      }
    }

    fixedStep(dt, input) {
      const p = this.player;
      if (input.reset && !this._resetHeld) { this._resetHeld = true; this.resetPlayer(); }
      if (!input.reset) this._resetHeld = false;
      p.saveState();
      if (this.events) this.events.rivals.forEach((ai) => ai.physics.saveState());

      const ev = this.events;
      if (ev && ev.state === 'countdown') {
        ev.updateCountdown(dt, input);
      } else if (ev && ev.state === 'running') {
        const prevPos = p.position.clone();
        p.update(dt, input);
        this.stats.distance += p.position.distanceTo(prevPos);
        const trafficBodies = this.traffic ? this.traffic.nearby(p.position.x, p.position.z, 260, this._trafficNear).slice() : [];
        ev.updateRunning(dt, trafficBodies);
      } else if (ev && ev.state === 'results') {
        // frozen on the results screen: coast to a stop
        p.update(dt, { throttle: 0, brake: 0.6, steer: 0, handbrake: false, nitro: false });
        ev.rivals.forEach((ai) => ai.update(dt, null));
      } else {
        const prevX = p.position.x; const prevZ = p.position.z;
        p.update(dt, input);
        this.stats.distance += Math.hypot(p.position.x - prevX, p.position.z - prevZ);
        this.updateRoam(dt);
      }

      // traffic + vehicle collisions
      if (this.traffic) {
        const racers = ev ? ev.rivals.map((r) => r.physics) : [];
        const avoid = ev && ev.state !== 'idle' && ev.active ? [{ x: ev.active.marker.x, z: ev.active.marker.z, r: 90 }] : [];
        this.traffic.update(dt, p, racers, avoid);
        this.resolveVehicleCollisions(racers);
      }
    }

    resolveVehicleCollisions(racers) {
      const p = this.player;
      const near = this.traffic.nearby(p.position.x, p.position.z, 60, this._trafficNear);
      for (let i = 0; i < near.length; i++) {
        if (p.ghostTimer > 0) break;
        window.FreeVehiclePhysics.collideVehicles(p, near[i]);
      }
      for (let r = 0; r < racers.length; r++) {
        const a = racers[r];
        if (a.ghostTimer <= 0 && p.ghostTimer <= 0) window.FreeVehiclePhysics.collideVehicles(p, a);
        const nearA = this.traffic.nearby(a.position.x, a.position.z, 40, []);
        for (let i = 0; i < nearA.length; i++) window.FreeVehiclePhysics.collideVehicles(a, nearA[i]);
        for (let r2 = r + 1; r2 < racers.length; r2++) {
          if (racers[r2].ghostTimer <= 0 && a.ghostTimer <= 0) window.FreeVehiclePhysics.collideVehicles(a, racers[r2]);
        }
      }
    }

    updateRoam(dt) {
      const p = this.player;
      // event markers
      const nearEvent = this.events.updateIdle(dt, p);
      this.nearEvent = nearEvent;
      // garage
      const g = this.district.garage.entry;
      this.nearGarage = Math.hypot(p.position.x - g.x, p.position.z - g.z) < g.radius;
      if (this.garageRing) { const s = 1 + Math.sin(this.time * 3) * 0.05; this.garageRing.scale.set(s, 1, s); }
      // prompt
      if (nearEvent) {
        this.setPrompt(nearEvent.unlocked
          ? { key: 'E', text: `Start ${nearEvent.name}`, sub: window.EventSystem.typeLabel(nearEvent), action: () => this.startEvent(nearEvent) }
          : { key: null, text: `${nearEvent.name} — locked`, sub: `Reach ${nearEvent.def.unlockRep} REP to unlock`, action: null });
      } else if (this.nearGarage) {
        this.setPrompt({ key: 'E', text: 'Enter Garage', sub: 'Tune, paint or switch your car', action: () => this.enterGarage() });
      } else {
        this.setPrompt(null);
      }
      // discoveries
      for (let i = 0; i < this.discoveryMeshes.length; i++) {
        const m = this.discoveryMeshes[i];
        if (!m.visible) continue;
        m.rotation.y += dt * 1.5;
        m.position.y = 6 + Math.sin(this.time * 2 + i) * 0.4;
        const d = m.userData.discovery;
        if (Math.hypot(p.position.x - d.x, p.position.z - d.z) < d.radius) this.onDiscovery(d, m);
      }
    }

    onDiscovery(d, mesh) {
      mesh.visible = false;
      if (window.SaveManager) {
        const isNew = window.SaveManager.addDiscovery(d.id);
        if (!isNew) return;
        window.SaveManager.addCash(d.credits);
        const info = window.SaveManager.addReputation(d.rep);
        this.toast(`Discovered ${d.name}  +₡${d.credits}  +${d.rep} REP`, 'success', 4);
        if (info.leveledUp) this.toast(`Reputation level ${info.level}: ${info.title}`, 'level', 5);
        this.events.refreshMarkerLocks();
      }
      if (window.SoundEngine) window.SoundEngine.playBeep(true);
    }

    followShadow() {
      const dir = this.game.sceneLight_dir;
      if (!dir || !dir.castShadow) return;
      const p = this.player.position;
      dir.position.set(p.x + 120, 160, p.z - 180);
      dir.target.position.set(p.x, 0, p.z);
      dir.target.updateMatrixWorld();
      const cam = dir.shadow.camera;
      if (cam.right !== 90) { cam.left = -90; cam.right = 90; cam.top = 90; cam.bottom = -90; cam.far = 500; cam.updateProjectionMatrix(); }
    }

    // ── Player helpers ────────────────────────────────────────────────────
    resetPlayer() {
      if (!this.player) return;
      this.player.resetToRoad();
      if (this.chaseCamera) this.chaseCamera.addShake(0.1);
    }

    persistPosition(force) {
      if (!window.SaveManager || !this.player) return;
      window.SaveManager.setLastPosition(this.district.id, this.player.position.x, this.player.position.z, this.player.yaw);
      if (this.stats.distance > 0) {
        window.SaveManager.addStat('distanceKm', this.stats.distance / 1000);
        this.stats.distance = 0;
      }
      window.SaveManager.addStat('playtimeSec', Math.round(this.time));
      this.time = 0;
      window.SaveManager.save();
    }

    // ── Events / garage transitions ───────────────────────────────────────
    startEvent(ev) {
      if (!this.events || this.events.state !== 'idle') return;
      this.setPrompt(null);
      if (this.events.begin(ev, this.player)) {
        this.toast(`${ev.name} — ${window.EventSystem.typeLabel(ev)}`, 'info', 3);
      }
    }

    onEventFinished(result) {
      this.showResults(result);
    }

    enterGarage() {
      this.persistPosition(true);
      this.game.enterGarageFromWorld();
    }

    // ── Interaction ───────────────────────────────────────────────────────
    setPrompt(prompt) {
      const el = this.dom.prompt;
      if (!el) { this.prompt = prompt; return; }
      const changed = (!!prompt !== !!this.prompt) || (prompt && this.prompt && prompt.text !== this.prompt.text);
      this.prompt = prompt;
      if (!changed) return;
      if (!prompt) { el.classList.add('hidden'); return; }
      el.classList.remove('hidden');
      this.dom.promptKey.textContent = prompt.key || '—';
      this.dom.promptKey.style.visibility = prompt.key ? 'visible' : 'hidden';
      this.dom.promptText.textContent = prompt.text;
      this.dom.promptSub.textContent = prompt.sub || '';
    }

    interact() {
      if (this.paused || !this.prompt || !this.prompt.action) return;
      this.prompt.action();
    }

    handleGamepadMeta(input) {
      // Gamepad extras (driving buttons are mapped in GameEngine.pollNormalizedInputs):
      // Start (9) = pause · Y/Triangle (3) while nearly stopped at a marker = interact
      // D-pad up (12) = camera · D-pad down (13) = full map
      if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
      const pads = navigator.getGamepads();
      let start = false; let y = false; let up = false; let down = false;
      for (let i = 0; i < pads.length; i++) {
        const gp = pads[i];
        if (!gp || !gp.connected) continue;
        const b = gp.buttons || [];
        start = !!(b[9] && b[9].pressed);
        y = !!(b[3] && b[3].pressed);
        up = !!(b[12] && b[12].pressed);
        down = !!(b[13] && b[13].pressed);
        break;
      }
      if (start && !this._gpStart) this.togglePause();
      this._gpStart = start;
      if (y && !this._gpY && !this.paused && this.prompt && Math.abs(this.player.speed) < 3) this.interact();
      this._gpY = y;
      if (up && !this._gpUp && !this.paused && this.chaseCamera) {
        const mode = this.chaseCamera.toggleView();
        if (window.SaveManager) window.SaveManager.setSetting('cameraMode', mode);
      }
      this._gpUp = up;
      if (down && !this._gpDown && !this.paused && this.hud) this.hud.toggleBigMap();
      this._gpDown = down;
    }

    onKeyDown(e) {
      if (!this.active) return;
      if (this.resultsOpen) {
        if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); this.continueFromResults(); }
        if (e.code === 'KeyR') this.retryEvent();
        return;
      }
      const settings = document.getElementById('settings-modal');
      const settingsOpen = settings && settings.style.display === 'flex';
      switch (e.code) {
        case 'Escape':
          if (settingsOpen) this.game.closeSettings(); // closeSettings() re-opens the pause menu
          else this.togglePause();
          break;
        case 'KeyE':
        case 'Enter':
          if (!this.paused) this.interact();
          break;
        case 'KeyC':
          if (this.chaseCamera && !this.paused) {
            const mode = this.chaseCamera.toggleView();
            if (window.SaveManager) window.SaveManager.setSetting('cameraMode', mode);
            this.toast(`Camera: ${mode}`, 'info', 1.5);
          }
          break;
        case 'KeyM':
          if (!this.paused && this.hud) this.hud.toggleBigMap();
          break;
        case 'KeyN':
          if (!this.paused && this.hud) this.hud.toggleMinimapRotation();
          break;
        default: break;
      }
    }

    // ── Pause menu ────────────────────────────────────────────────────────
    togglePause() {
      if (this.pauseMenuOpen) this.closePauseMenu(); else this.openPauseMenu();
    }

    openPauseMenu() {
      if (this.resultsOpen) return;
      this.paused = true;
      this.pauseMenuOpen = true;
      const el = this.dom.pause;
      if (el) {
        el.classList.remove('hidden');
        const quitEv = this.dom.pauseQuitEvent;
        if (quitEv) quitEv.style.display = this.events && this.events.state !== 'idle' ? '' : 'none';
        const restartEv = this.dom.pauseRestartEvent;
        if (restartEv) restartEv.style.display = this.events && this.events.state !== 'idle' ? '' : 'none';
        const assist = this.dom.pauseAssist;
        if (assist && window.SaveManager) assist.value = window.SaveManager.getAssistLevel();
        const traffic = this.dom.pauseTraffic;
        if (traffic && window.SaveManager) traffic.value = window.SaveManager.getSetting('trafficDensity', 'normal');
        if (this.dom.pauseStats && window.SaveManager) {
          const info = window.SaveManager.getLevelInfo();
          const prog = window.SaveManager.getProfile().progress;
          this.dom.pauseStats.textContent = `Level ${info.level} ${info.title} · ${info.reputation} REP · ₡${window.SaveManager.getCash().toLocaleString()} · ${prog.discoveries.length}/${this.district.discoveries.length} discoveries · ${Object.keys(prog.eventRecords).length}/${this.eventDefs.length} events cleared`;
        }
      }
      if (window.SoundEngine && typeof window.SoundEngine.silenceGameplayAudio === 'function') window.SoundEngine.silenceGameplayAudio();
    }

    closePauseMenu() {
      this.paused = false;
      this.pauseMenuOpen = false;
      if (this.dom.pause) this.dom.pause.classList.add('hidden');
      if (window.SoundEngine && window.SoundEngine.ensureContext) window.SoundEngine.ensureContext();
    }

    // ── Results ───────────────────────────────────────────────────────────
    showResults(r) {
      this.resultsOpen = true;
      const d = this.dom;
      if (!d.results) return;
      const fmt = (t) => window.OpenWorldHUD.formatTime(t);
      d.resultsTitle.textContent = r.event.name;
      const posLabel = r.event.type === 'timetrial' ? `${r.medal === 'none' ? 'NO MEDAL' : r.medal.toUpperCase() + ' MEDAL'}` : `${OpenWorldManager.ordinal(r.position)} PLACE`;
      d.resultsPosition.textContent = posLabel;
      d.resultsPosition.className = 'ow-results-position medal-' + r.medal;
      d.resultsTime.textContent = fmt(r.time);
      const tags = [];
      if (r.firstClear) tags.push('FIRST CLEAR');
      if (r.newBest && !r.firstClear) tags.push('NEW PERSONAL BEST');
      if (r.replay) tags.push('REPLAY REWARDS ×0.5');
      d.resultsTags.textContent = tags.join(' · ');
      // standings / medal table
      let rows = '';
      if (r.event.type === 'timetrial') {
        const mt = r.medalTimes;
        rows += `<div class="ow-row ${r.medal === 'gold' ? 'hit' : ''}"><span>🥇 Gold</span><span>${fmt(mt.gold)}</span></div>`;
        rows += `<div class="ow-row ${r.medal === 'silver' ? 'hit' : ''}"><span>🥈 Silver</span><span>${fmt(mt.silver)}</span></div>`;
        rows += `<div class="ow-row ${r.medal === 'bronze' ? 'hit' : ''}"><span>🥉 Bronze</span><span>${fmt(mt.bronze)}</span></div>`;
        rows += `<div class="ow-row you"><span>You</span><span>${fmt(r.time)}</span></div>`;
      } else {
        r.standings.forEach((s, i) => {
          const car = window.getCarById && s.carId ? window.getCarById(s.carId) : null;
          rows += `<div class="ow-row ${s.isPlayer ? 'you' : ''}"><span>${i + 1}. ${s.name}${car ? ` <em>${car.name}</em>` : ''}</span><span>${fmt(s.time)}</span></div>`;
        });
      }
      d.resultsStandings.innerHTML = rows;
      d.resultsCredits.textContent = `+₡${(r.credits + r.driftBonus).toLocaleString()}${r.driftBonus ? ` (incl. ₡${r.driftBonus} drift bonus)` : ''}`;
      d.resultsRep.textContent = `+${r.rep} REP`;
      if (r.levelInfo) {
        d.resultsLevel.textContent = `Level ${r.levelInfo.level} · ${r.levelInfo.title}${r.levelInfo.isMax ? '' : ` · ${r.levelInfo.current}/${r.levelInfo.needed} to next`}`;
        d.resultsLevelFill.style.width = `${Math.round(r.levelInfo.progress * 100)}%`;
        if (r.levelInfo.leveledUp) this.toast(`Reputation level ${r.levelInfo.level}: ${r.levelInfo.title}`, 'level', 5);
      }
      d.results.classList.remove('hidden');
      if (this.hud) this.hud.refreshCash();
    }

    continueFromResults() {
      if (!this.resultsOpen) return;
      this.resultsOpen = false;
      if (this.dom.results) this.dom.results.classList.add('hidden');
      if (this.events) this.events.end(false);
      this.persistPosition(true);
    }

    retryEvent() {
      if (!this.events) return;
      this.resultsOpen = false;
      if (this.dom.results) this.dom.results.classList.add('hidden');
      this.closePauseMenu();
      this.events.retry();
    }

    quitEvent() {
      if (!this.events || this.events.state === 'idle') return;
      this.events.end(true);
      this.closePauseMenu();
      this.toast('Event abandoned', 'warn', 2.5);
    }

    static ordinal(n) {
      const s = ['TH', 'ST', 'ND', 'RD'];
      const v = n % 100;
      return n + (s[(v - 20) % 10] || s[v] || s[0]);
    }

    // ── UI helpers ────────────────────────────────────────────────────────
    setupDom() {
      const $ = (id) => document.getElementById(id);
      this.dom = {
        hud: $('hud'),
        owHud: $('ow-hud'),
        prompt: $('ow-prompt'),
        promptKey: $('ow-prompt-key'),
        promptText: $('ow-prompt-text'),
        promptSub: $('ow-prompt-sub'),
        toasts: $('ow-toasts'),
        pause: $('ow-pause'),
        pauseQuitEvent: $('btn-ow-quit-event'),
        pauseRestartEvent: $('btn-ow-restart-event'),
        pauseAssist: $('ow-assist-level'),
        pauseTraffic: $('ow-traffic-density'),
        pauseStats: $('ow-pause-stats'),
        results: $('ow-results'),
        resultsTitle: $('ow-results-title'),
        resultsPosition: $('ow-results-position'),
        resultsTime: $('ow-results-time'),
        resultsTags: $('ow-results-tags'),
        resultsStandings: $('ow-results-standings'),
        resultsCredits: $('ow-results-credits'),
        resultsRep: $('ow-results-rep'),
        resultsLevel: $('ow-results-level'),
        resultsLevelFill: $('ow-results-level-fill'),
        countdown: $('countdown-screen'),
        countdownText: $('countdown-text'),
        checkpointFlash: $('ow-checkpoint-flash')
      };
      const on = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };
      on('btn-ow-resume', () => this.closePauseMenu());
      on('btn-ow-restart-event', () => this.retryEvent());
      on('btn-ow-quit-event', () => this.quitEvent());
      on('btn-ow-garage', () => { this.closePauseMenu(); this.enterGarage(); });
      on('btn-ow-settings', () => { if (this.dom.pause) this.dom.pause.classList.add('hidden'); this.pauseMenuOpen = false; this.game.openSettings(); });
      on('btn-ow-main-menu', () => { this.closePauseMenu(); this.game.goToMainMenu(); });
      on('btn-ow-results-continue', () => this.continueFromResults());
      on('btn-ow-results-retry', () => this.retryEvent());
      on('btn-ow-results-garage', () => { this.continueFromResults(); this.enterGarage(); });
      const assist = this.dom.pauseAssist;
      if (assist) assist.addEventListener('change', () => {
        if (window.SaveManager) window.SaveManager.setAssistLevel(assist.value);
        if (this.player) this.player.setAssistLevel(assist.value);
        this.toast(`Driving assists: ${assist.value}`, 'info', 2);
      });
      const traffic = this.dom.pauseTraffic;
      if (traffic) traffic.addEventListener('change', () => {
        if (window.SaveManager) window.SaveManager.setSetting('trafficDensity', traffic.value);
        if (this.traffic) this.traffic.setDensity(traffic.value);
      });
      const hudBtnPause = $('btn-ow-hud-pause');
      if (hudBtnPause) hudBtnPause.addEventListener('click', () => this.togglePause());
    }

    showHud(v) {
      if (this.dom.hud) { this.dom.hud.style.display = v ? 'flex' : 'none'; this.dom.hud.classList.toggle('ow-mode', v); }
      if (this.dom.owHud) this.dom.owHud.classList.toggle('hidden', !v);
      if (!v) this.setPrompt(null);
    }

    hideAllOverlays() {
      ['ow-pause', 'ow-results', 'ow-prompt'].forEach((id) => { const el = document.getElementById(id); if (el) el.classList.add('hidden'); });
      if (this.dom.countdown) this.dom.countdown.classList.add('hidden');
      this.pauseMenuOpen = false;
      this.resultsOpen = false;
      const settings = document.getElementById('settings-modal');
      if (settings) settings.style.display = 'none';
    }

    showCountdown(label, isGo) {
      const screen = this.dom.countdown; const text = this.dom.countdownText;
      if (!screen || !text) return;
      screen.classList.remove('hidden');
      text.textContent = label;
      text.style.animation = 'none';
      void text.offsetWidth;
      text.style.animation = 'countdown-pop 0.85s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
      if (window.SoundEngine) { window.SoundEngine.playBeep(isGo); if (!isGo && window.SoundEngine.announce) window.SoundEngine.announce(label); }
      if (isGo) setTimeout(() => screen.classList.add('hidden'), 900);
    }

    flashCheckpoint(text) {
      const el = this.dom.checkpointFlash;
      if (!el) return;
      el.textContent = text;
      el.classList.remove('hidden');
      el.style.animation = 'none';
      void el.offsetWidth;
      el.style.animation = 'ow-flash 1.1s ease-out forwards';
      clearTimeout(this._flashTimer);
      this._flashTimer = setTimeout(() => el.classList.add('hidden'), 1100);
    }

    toast(text, kind = 'info', seconds = 3) {
      const wrap = this.dom.toasts;
      if (!wrap) return;
      const el = document.createElement('div');
      el.className = `ow-toast ${kind}`;
      el.textContent = text;
      wrap.appendChild(el);
      while (wrap.children.length > 4) wrap.removeChild(wrap.firstChild);
      setTimeout(() => { el.classList.add('out'); setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 400); }, seconds * 1000);
    }
  }

  window.OpenWorldManager = OpenWorldManager;
  window.OpenWorldCamera = OpenWorldCamera;
})();
