// ============================================================================
// TURBO RUSH - CORE GAME ENGINE & RACE COORDINATOR
// ============================================================================
// Integrates 3D anti-gravity physics, AI rivals, realistic procedural supercars,
// camera views, HUD, track props, destructibles, racing line, weather systems,
// race modes (Arcade, Time Trial, Team Racing), private multiplayer, and audio.

class GameEngine {
  constructor() {
    this.scene = null;
    this.camera = null;
    this.renderer = null;

    // Subsystems
    this.track = null;
    this.playerCar = null;
    this.playerPhysics = null;
    this.chaseCamera = null;
    this.hud = null;
    this.aiRacers = [];
    this.workshop = null;
    this.mapSelect = null;

    // New Modular Systems
    this.trackProps = null;
    this.destructibles = null;
    this.racingLine = null;
    this.tutorial = null;
    this.raceModes = null;
    this.weather = null;
    this.replay = null;
    this.multiplayer = null;

    // Race State
    this.gameState = 'WORKSHOP'; // WORKSHOP, MAP_SELECT, COUNTDOWN, RACING, PAUSED, FINISHED, REPLAY
    this.raceTime = 0;
    this.playerLap = 1;
    this.maxLaps = 3;
    this.playerPosition = 1;
    this.isWrongWay = false;
    this.lastCheckpointPassed = -1;
    this.expectedNextCheckpoint = 0;
    this.validLap = true;
    this.bestLapTime = Infinity;
    this.currentLapStartTime = 0;
    this.respawnPenaltyTimer = 0;
    this.raceCashEarned = 0;

    // Selections
    this.selectedCarId = 'falcon_s1';
    this.selectedMapId = 'emerald_highway';
    this.selectedMode = 'arcade';
    this.selectedWeather = 'clear';

    // Timing & Clock
    this.clock = new THREE.Clock();
    this.physicsAccumulator = 0.0; // Fixed-timestep accumulator

    // Inputs
    this.inputs = {
      throttle: 0,
      brake: 0,
      steer: 0,
      handbrake: false,
      nitro: false
    };
    this.touchInputs = {
      left: false,
      right: false,
      gas: false,
      brake: false,
      nitro: false
    };

    // Lights
    this.sceneLight_hemi = null;
    this.sceneLight_dir = null;

    this.init();
  }

  init() {
    this.setupThree();
    this.setupTrack(null);
    this.setupInputs();
    this.setupMobileControls();
    this.setupSettingsModal();
    this.setupWindowResize();

    // Initialize systems that require scene/camera
    this.weather = new window.WeatherManager(this.scene, this.renderer);
    this.weather.bindLights(this.sceneLight_hemi, this.sceneLight_dir);
    this.replay = new window.ReplayManager(this.camera, this.scene);
    this.tutorial = new window.TutorialManager(this);
    this.raceModes = new window.RaceModesManager(this);
    this.multiplayer = new window.MultiplayerClient(this);

    // Start in Workshop Mode
    this.gameState = 'WORKSHOP';
    this.workshop = new window.WorkshopManager(this);
    this.mapSelect = new window.MapSelectManager(this);
    this.workshop.enterWorkshop();

    // Start render loop
    requestAnimationFrame(this.animate.bind(this));
  }

  // ─────────────────────────────────────────────
  // FLOW: Workshop → Map Select → Race
  // ─────────────────────────────────────────────
  openMapSelect(selectedCarId) {
    this.selectedCarId = selectedCarId;
    this.gameState = 'MAP_SELECT';
    this.mapSelect.enterMapSelect(selectedCarId);
  }

  promptReturnToWorkshop() {
    if (this.gameState === 'WORKSHOP') return;
    this.previousGameState = this.gameState;
    this.gameState = 'PAUSED';
    const quitModal = document.getElementById('quit-confirm-modal');
    if (quitModal) {
      quitModal.style.display = 'flex';
      quitModal.classList.remove('hidden');
    }
  }

  cancelReturnToWorkshop() {
    const quitModal = document.getElementById('quit-confirm-modal');
    if (quitModal) {
      quitModal.style.display = 'none';
      quitModal.classList.add('hidden');
    }
    if (this.gameState === 'PAUSED' && this.previousGameState) {
      this.gameState = this.previousGameState;
    }
  }

  returnToWorkshop() {
    this.gameState = 'WORKSHOP';
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
    if (this.weather) this.weather.applyWeather('clear');
    if (window.SoundEngine) {
      window.SoundEngine.stopMusic();
      if (typeof window.SoundEngine.silenceGameplayAudio === 'function') {
        window.SoundEngine.silenceGameplayAudio();
      }
    }

    // Hide racing HUD & any popups/modals
    const hud = document.getElementById('hud');
    if (hud) hud.style.display = 'none';
    const countdownScreen = document.getElementById('countdown-screen');
    if (countdownScreen) countdownScreen.classList.add('hidden');
    const checkpointMissed = document.getElementById('checkpoint-missed');
    if (checkpointMissed) checkpointMissed.classList.add('hidden');
    const finishModal = document.getElementById('finish-modal');
    if (finishModal) finishModal.classList.add('hidden');
    const settingsModal = document.getElementById('settings-modal');
    if (settingsModal) settingsModal.style.display = 'none';
    const quitModal = document.getElementById('quit-confirm-modal');
    if (quitModal) {
      quitModal.style.display = 'none';
      quitModal.classList.add('hidden');
    }

    // Cleanly clear active race objects & track
    this.clearScene();

    this.workshop.enterWorkshop();
  }

  startRaceFromMapSelect(selectedCarId, selectedMapId, mode = 'arcade', weather = 'clear') {
    this.selectedCarId = selectedCarId;
    this.selectedMapId = selectedMapId;
    this.selectedMode = mode;
    this.selectedWeather = weather;

    // Ensure UI overlays are completely hidden
    const ws = document.getElementById('workshop-screen');
    if (ws) { ws.style.display = 'none'; ws.classList.add('hidden'); }
    const ms = document.getElementById('map-select-screen');
    if (ms) { ms.style.display = 'none'; ms.classList.add('hidden'); }
    if (this.workshop && this.workshop.previewCarModel) {
      this.scene.remove(this.workshop.previewCarModel.group);
    }
    if (this.workshop && this.workshop.platform) {
      this.scene.remove(this.workshop.platform);
    }

    // Clear old scene items
    this.clearScene();

    // Apply map-specific settings & build track
    const mapConfig = window.getMapById(selectedMapId);
    this.applyMapScene(mapConfig, weather);
    this.setupTrack(mapConfig);

    // Initialize track accessories & interactive props
    this.trackProps = new window.TrackPropsManager(this.scene, this.track);
    this.destructibles = new window.DestructiblesManager(this.scene, this.track);
    this.racingLine = new window.RacingLineManager(this.scene, this.track);

    // Apply dynamic weather
    if (this.weather) {
      this.weather.bindLights(this.sceneLight_hemi, this.sceneLight_dir);
      this.weather.applyWeather(weather);
    }

    // Setup cars, camera, HUD
    this.setupCars(selectedCarId, mode);
    this.setupCameraAndHUD();

    // 300+ km/h World Streaming & Multi-Layer Damage Systems
    if (window.VelocityAwareStreamingManager) {
      this.streamingManager = new window.VelocityAwareStreamingManager(this.scene, this.track);
    }
    if (window.DamageManager && this.playerPhysics) {
      this.damageManager = new window.DamageManager(this.scene, this.playerPhysics);
      this.playerPhysics.damageManager = this.damageManager;
    }

    // Wire up race mode
    this.raceModes.startMode(mode, selectedMapId, this.playerPhysics, this.aiRacers);

    // Connect cash pickup events to HUD
    if (this.trackProps) {
      this.trackProps.onCashPickup((amount) => {
        this.raceCashEarned += amount;
        if (this.hud) this.hud.showCashPickup(amount);
      });
    }

    // If tutorial mode, launch interactive academy
    if (mode === 'tutorial') {
      this.tutorial.startTutorial();
    }

    // Show HUD and start countdown
    const hudElem = document.getElementById('hud');
    if (hudElem) hudElem.style.display = 'flex';

    if (window.SoundEngine) {
      window.SoundEngine.startMusic('cruising');
    }

    this.startCountdown();
  }

  // ─────────────────────────────────────────────
  // SCENE SETUP & LIGHTING
  // ─────────────────────────────────────────────
  setupThree() {
    const container = document.getElementById('canvas-container');

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a1122);
    this.scene.fog = new THREE.FogExp2(0x0a1122, 0.0035);

    this.camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.2, 1200);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    container.appendChild(this.renderer.domElement);

    this.sceneLight_hemi = new THREE.HemisphereLight(0xddeeff, 0x112233, 0.7);
    this.scene.add(this.sceneLight_hemi);

    this.sceneLight_dir = new THREE.DirectionalLight(0xfffaed, 1.8);
    this.sceneLight_dir.position.set(80, 140, 60);
    this.sceneLight_dir.castShadow = true;
    this.sceneLight_dir.shadow.mapSize.width = 2048;
    this.sceneLight_dir.shadow.mapSize.height = 2048;
    this.sceneLight_dir.shadow.camera.near = 0.5;
    this.sceneLight_dir.shadow.camera.far = 400;
    const d = 180;
    this.sceneLight_dir.shadow.camera.left = -d;
    this.sceneLight_dir.shadow.camera.right = d;
    this.sceneLight_dir.shadow.camera.top = d;
    this.sceneLight_dir.shadow.camera.bottom = -d;
    this.sceneLight_dir.shadow.bias = -0.0005;
    this.scene.add(this.sceneLight_dir);

    // Initialize HDR Rendering Pipeline & Post-Processing
    if (window.RenderingPipeline) {
      this.pipeline = new window.RenderingPipeline(this.renderer, this.scene, this.camera);
    } else {
      this.pipeline = null;
    }
  }

  applyMapScene(mapConfig, weather = 'clear') {
    if (!mapConfig) return;
    const env = mapConfig.environment;

    // Map weather selection to HDR lighting profile
    let profileKey = 'day';
    if (weather === 'rain') profileKey = 'rain';
    else if (weather === 'fog') profileKey = 'fog';
    else if (weather === 'storm') profileKey = 'storm';
    else if (weather === 'night') profileKey = 'night';
    else if (mapConfig.id === 'helios_rift') profileKey = 'sunset';
    else if (mapConfig.id === 'zenith_citadel') profileKey = 'night';
    else profileKey = 'day';

    if (this.pipeline) {
      this.pipeline.applyLightingProfile(profileKey, this.sceneLight_hemi, this.sceneLight_dir);
    } else {
      this.scene.background = new THREE.Color(env.bgColor);
      this.scene.fog = new THREE.FogExp2(env.fogColor, env.fogDensity);

      this.sceneLight_hemi.color.setHex(env.hemiSkyColor);
      this.sceneLight_hemi.groundColor.setHex(env.hemiGroundColor);
      this.sceneLight_hemi.intensity = env.hemiIntensity;

      this.sceneLight_dir.color.setHex(env.dirColor);
      this.sceneLight_dir.intensity = env.dirIntensity;
      this.sceneLight_dir.position.set(env.dirPosition[0], env.dirPosition[1], env.dirPosition[2]);
    }
  }

  clearScene() {
    if (this.track && typeof this.track.destroy === 'function') this.track.destroy();
    if (this.trackProps) this.trackProps.dispose();
    if (this.destructibles) this.destructibles.dispose();
    if (this.racingLine) this.racingLine.dispose();

    const keep = [this.sceneLight_hemi, this.sceneLight_dir];
    if (this.weather && this.weather.weatherGroup) keep.push(this.weather.weatherGroup);

    const toRemove = [];
    this.scene.traverse(obj => {
      if (!keep.includes(obj) && obj !== this.scene && obj.parent === this.scene) {
        toRemove.push(obj);
      }
    });

    toRemove.forEach(obj => this.scene.remove(obj));

    this.track = null;
    this.playerCar = null;
    this.playerPhysics = null;
    this.chaseCamera = null;
    this.hud = null;
    this.aiRacers = [];
  }

  setupTrack(mapConfig) {
    this.track = new window.TrackManager(this.scene, mapConfig);
  }

  setupCars(selectedCarId = 'veloce_v10_corsa', mode = 'arcade') {
    const playerCarConfig = window.getCarById(selectedCarId);

    // 1. Player Car
    this.playerCar = new window.CarModel(playerCarConfig.colorHex, true, selectedCarId, 0);
    this.playerPhysics = new window.ArcadeCarPhysics(this.playerCar, this.track, true, playerCarConfig.physics);
    this.scene.add(this.playerCar.group);

    // Bind vehicle audio profile
    if (window.SoundEngine) {
      window.SoundEngine.setVehicleProfile(selectedCarId);
    }

    // Load saved upgrades and customizations
    if (window.SaveManager) {
      const profile = window.SaveManager.getProfile();
      if (profile.upgrades && profile.upgrades[selectedCarId]) {
        this.playerPhysics.applyUpgrades(profile.upgrades[selectedCarId]);
      }
      if (profile.cosmetics && profile.cosmetics[selectedCarId]) {
        this.playerCar.setCustomization(profile.cosmetics[selectedCarId]);
      }
    }

    // Grid Slot 1
    this.playerPhysics.setTrackPosition(0.0, -2.5, 0);

    // 2. Opponent AI Cars (Arcade, Team Racing)
    this.aiRacers = [];

    if (mode === 'timetrial' || mode === 'practice' || mode === 'tutorial') {
      // Solo mode: no AI cars
      return;
    }

    const aiConfigs = [
      { name: 'Veloce GT (Blue)', color: 0x1a56e6, carId: 'veloce_v8_gt', offset: 2.5, uBack: 0.008, diff: 0.90, team: 'blue' },
      { name: 'Veloce Stradale (Gold)', color: 0xd4af37, carId: 'veloce_v12_stradale', offset: -2.5, uBack: 0.016, diff: 0.85, team: 'red' },
      { name: 'Veloce Corsa (Red)', color: 0xe61a2b, carId: 'veloce_v10_corsa', offset: 2.5, uBack: 0.024, diff: 0.82, team: 'blue' }
    ];

    this.aiRacers = aiConfigs.map(cfg => {
      const ai = new window.AIRacer(cfg.name, cfg.color, this.track, cfg.diff, cfg.carId);
      ai.team = cfg.team;
      this.scene.add(ai.carModel.group);

      const u = ((1.0 - cfg.uBack) % 1.0 + 1.0) % 1.0;
      ai.physics.setTrackPosition(u, cfg.offset, 0);
      return ai;
    });
  }

  setupCameraAndHUD() {
    this.chaseCamera = new window.ChaseCamera(this.camera, this.playerPhysics);
    this.hud = new window.HUDManager(this.track);
  }

  // ─────────────────────────────────────────────
  // INPUTS & CONTROLS
  // ─────────────────────────────────────────────
  setupInputs() {
    const activeKeys = {};

    window.addEventListener('keydown', (e) => {
      activeKeys[e.code] = true;
      if (window.SoundEngine) window.SoundEngine.ensureContext();

      // Camera view toggle (C)
      if (e.code === 'KeyC' && this.chaseCamera) {
        this.chaseCamera.toggleView();
      }

      // Respawn (R)
      if (e.code === 'KeyR' && this.gameState === 'RACING') {
        this.respawnPlayer();
      }

      // Racing Line toggle (T)
      if (e.code === 'KeyT' && this.racingLine) {
        const active = !this.racingLine.visible;
        this.racingLine.setVisible(active);
      }

      // Main Menu Hotkey (M)
      if (e.code === 'KeyM') {
        if (this.gameState === 'RACING' || this.gameState === 'COUNTDOWN') {
          this.promptReturnToWorkshop();
        }
      }

      // Pause & Settings (Escape)
      if (e.code === 'Escape') {
        const quitModal = document.getElementById('quit-confirm-modal');
        if (quitModal && quitModal.style.display !== 'none' && !quitModal.classList.contains('hidden')) {
          this.cancelReturnToWorkshop();
        } else if (this.gameState === 'RACING') {
          this.openSettings();
        } else if (this.gameState === 'PAUSED') {
          this.closeSettings();
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      activeKeys[e.code] = false;
    });

    this.activeKeys = activeKeys;

    // HUD Button clicks
    const mainMenuBtn = document.getElementById('btn-main-menu');
    if (mainMenuBtn) {
      mainMenuBtn.addEventListener('click', () => this.promptReturnToWorkshop());
    }

    const cancelQuitBtn = document.getElementById('btn-cancel-quit');
    if (cancelQuitBtn) {
      cancelQuitBtn.addEventListener('click', () => this.cancelReturnToWorkshop());
    }

    const confirmQuitBtn = document.getElementById('btn-confirm-quit');
    if (confirmQuitBtn) {
      confirmQuitBtn.addEventListener('click', () => this.returnToWorkshop());
    }

    const camBtn = document.getElementById('btn-cam-toggle');
    if (camBtn) {
      camBtn.addEventListener('click', () => {
        if (this.chaseCamera) this.chaseCamera.toggleView();
      });
    }

    const soundBtn = document.getElementById('btn-sound');
    if (soundBtn) {
      soundBtn.addEventListener('click', () => {
        if (window.SoundEngine) {
          const isMuted = window.SoundEngine.toggleMute();
          soundBtn.textContent = isMuted ? '🔇' : '🔊';
        }
      });
    }

    const resetBtn = document.getElementById('btn-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => this.respawnPlayer());
    }

    const settingsBtn = document.getElementById('btn-settings');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => this.openSettings());
    }

    const restartBtn = document.getElementById('btn-restart');
    if (restartBtn) {
      restartBtn.addEventListener('click', () => {
        const modal = document.getElementById('finish-modal');
        if (modal) modal.classList.add('hidden');
        this.startRaceFromMapSelect(this.selectedCarId, this.selectedMapId, this.selectedMode, this.selectedWeather);
      });
    }

    const garageBtn = document.getElementById('btn-return-garage');
    if (garageBtn) {
      garageBtn.addEventListener('click', () => {
        const modal = document.getElementById('finish-modal');
        if (modal) modal.classList.add('hidden');
        this.returnToWorkshop();
      });
    }
  }

  setupMobileControls() {
    const bindTouch = (id, key) => {
      const el = document.getElementById(id);
      if (!el) return;
      const setTouch = (val) => {
        this.touchInputs[key] = val;
        el.classList.toggle('pressed', val);
        if (window.SoundEngine) window.SoundEngine.ensureContext();
      };
      el.addEventListener('touchstart', (e) => { e.preventDefault(); setTouch(true); }, { passive: false });
      el.addEventListener('touchend', (e) => { e.preventDefault(); setTouch(false); }, { passive: false });
      el.addEventListener('touchcancel', (e) => { e.preventDefault(); setTouch(false); }, { passive: false });
    };

    bindTouch('touch-left', 'left');
    bindTouch('touch-right', 'right');
    bindTouch('touch-gas', 'gas');
    bindTouch('touch-brake', 'brake');
    bindTouch('touch-nitro', 'nitro');

    const touchMenu = document.getElementById('touch-menu');
    if (touchMenu) {
      touchMenu.addEventListener('click', () => this.promptReturnToWorkshop());
    }
    const touchCam = document.getElementById('touch-cam');
    if (touchCam) {
      touchCam.addEventListener('click', () => {
        if (this.chaseCamera) this.chaseCamera.toggleView();
      });
    }
    const touchReset = document.getElementById('touch-reset');
    if (touchReset) {
      touchReset.addEventListener('click', () => this.respawnPlayer());
    }
  }

  // ─────────────────────────────────────────────
  // SETTINGS MODAL
  // ─────────────────────────────────────────────
  setupSettingsModal() {
    const modal = document.getElementById('settings-modal');
    const closeBtn = document.getElementById('settings-close');
    const saveBtn = document.getElementById('btn-save-settings');
    const replayTutBtn = document.getElementById('btn-replay-tutorial');
    const settingsMainMenuBtn = document.getElementById('btn-settings-main-menu');

    const qSelect = document.getElementById('settings-graphics');
    const fovInput = document.getElementById('settings-fov');
    const lineToggle = document.getElementById('settings-racing-line');
    const shakeToggle = document.getElementById('settings-shake');
    const volMaster = document.getElementById('settings-vol-master');
    const volMusic = document.getElementById('settings-vol-music');
    const volSfx = document.getElementById('settings-vol-sfx');
    const volVoice = document.getElementById('settings-vol-voice');

    if (closeBtn) closeBtn.onclick = () => this.closeSettings();
    if (saveBtn) saveBtn.onclick = () => this.closeSettings();

    if (settingsMainMenuBtn) {
      settingsMainMenuBtn.onclick = () => {
        this.closeSettings();
        this.returnToWorkshop();
      };
    }

    if (replayTutBtn) {
      replayTutBtn.onclick = () => {
        this.closeSettings();
        this.startRaceFromMapSelect(this.selectedCarId, 'helios_rift', 'tutorial', 'clear');
      };
    }

    if (qSelect) {
      qSelect.onchange = () => {
        const val = qSelect.value;
        if (this.weather) this.weather.setQuality(val);
        if (val === 'low') {
          this.renderer.shadowMap.enabled = false;
          this.renderer.setPixelRatio(1);
        } else if (val === 'medium') {
          this.renderer.shadowMap.enabled = true;
          this.renderer.setPixelRatio(1.25);
        } else {
          this.renderer.shadowMap.enabled = true;
          this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        }
      };
    }

    if (fovInput) {
      fovInput.oninput = () => {
        const fov = parseFloat(fovInput.value);
        if (this.camera) {
          this.camera.fov = fov;
          this.camera.updateProjectionMatrix();
        }
      };
    }

    if (lineToggle) {
      lineToggle.onchange = () => {
        if (this.racingLine) this.racingLine.setVisible(lineToggle.checked);
      };
    }

    if (volMaster) {
      volMaster.oninput = () => {
        if (window.SoundEngine) window.SoundEngine.setMasterVolume(parseFloat(volMaster.value));
      };
    }
    if (volMusic) {
      volMusic.oninput = () => {
        if (window.SoundEngine) window.SoundEngine.setMusicVolume(parseFloat(volMusic.value));
      };
    }
    if (volSfx) {
      volSfx.oninput = () => {
        if (window.SoundEngine) window.SoundEngine.setSFXVolume(parseFloat(volSfx.value));
      };
    }
    if (volVoice) {
      volVoice.oninput = () => {
        if (window.SoundEngine) window.SoundEngine.setVoiceVolume(parseFloat(volVoice.value));
      };
    }
  }

  openSettings() {
    this.gameState = 'PAUSED';
    const modal = document.getElementById('settings-modal');
    if (modal) modal.style.display = 'flex';
  }

  closeSettings() {
    const modal = document.getElementById('settings-modal');
    if (modal) modal.style.display = 'none';
    if (this.gameState === 'PAUSED') {
      this.gameState = 'RACING';
    }
  }

  // ─────────────────────────────────────────────
  // COUNTDOWN & RACE START
  // ─────────────────────────────────────────────
  startCountdown() {
    this.gameState = 'COUNTDOWN';
    this.raceTime = 0;
    this.playerLap = 1;
    this.lastCheckpointPassed = -1;
    this.expectedNextCheckpoint = 0;
    this.validLap = true;
    this.bestLapTime = Infinity;
    this.currentLapStartTime = 0;
    this.playerPosition = 1;
    this.respawnPenaltyTimer = 0;
    this.raceCashEarned = 0;

    const countdownScreen = document.getElementById('countdown-screen');
    const countdownText = document.getElementById('countdown-text');
    if (!countdownScreen || !countdownText) return;

    countdownScreen.classList.remove('hidden');

    const steps = ['3', '2', '1', 'GO!'];
    let idx = 0;

    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }

    const triggerStep = () => {
      if (this.gameState !== 'COUNTDOWN' && idx < steps.length - 1) {
        if (this.countdownInterval) {
          clearInterval(this.countdownInterval);
          this.countdownInterval = null;
        }
        return;
      }

      countdownText.textContent = steps[idx];
      countdownText.style.animation = 'none';
      void countdownText.offsetWidth; // reflow
      countdownText.style.animation = 'countdown-pop 0.85s cubic-bezier(0.175, 0.885, 0.32, 1.275)';

      const isGo = (idx === steps.length - 1);
      if (window.SoundEngine) {
        window.SoundEngine.playBeep(isGo);
        if (isGo) {
          window.SoundEngine.announce("GO GO GO!", true);
        } else {
          window.SoundEngine.announce(steps[idx]);
        }
      }

      if (isGo) {
        this.gameState = 'RACING';
        this.currentLapStartTime = 0;
        if (this.replay) this.replay.startRecording();
        setTimeout(() => {
          countdownScreen.classList.add('hidden');
        }, 1000);
        if (this.countdownInterval) {
          clearInterval(this.countdownInterval);
          this.countdownInterval = null;
        }
      }
      idx++;
    };

    // Trigger '3' immediately upon race launch
    triggerStep();

    this.countdownInterval = setInterval(() => {
      if (this.gameState !== 'COUNTDOWN') {
        if (this.countdownInterval) {
          clearInterval(this.countdownInterval);
          this.countdownInterval = null;
        }
        return;
      }

      if (idx < steps.length) {
        triggerStep();
      } else {
        if (this.countdownInterval) {
          clearInterval(this.countdownInterval);
          this.countdownInterval = null;
        }
      }
    }, 1000);
  }

  respawnPlayer() {
    if (!this.playerPhysics || !this.track) return;
    this.playerPhysics.respawnAtCheckpoint();
    this.respawnPenaltyTimer = 3.0; // 3-second penalty
    this.validLap = false; // Invalidate current lap for records
    if (this.chaseCamera) this.chaseCamera.addShake(0.8);
    if (window.SoundEngine) window.SoundEngine.announce("CAR RECOVERED — 3s PENALTY");
  }

  // ─────────────────────────────────────────────
  // RACE UPDATE LOOP
  // ─────────────────────────────────────────────
  updateRaceLogic(dt) {
    if (this.gameState !== 'RACING') return;

    this.raceTime += dt;
    const playerU = this.playerPhysics.trackU;

    // Respawn penalty timer
    if (this.respawnPenaltyTimer > 0) {
      this.respawnPenaltyTimer -= dt;
      // Lock speed during penalty
      this.playerPhysics.speed = Math.min(this.playerPhysics.speed, 8.0);
      if (this.hud) this.hud.updatePenaltyTimer(this.respawnPenaltyTimer);
    } else if (this.hud) {
      this.hud.updatePenaltyTimer(0);
    }

    // Ordered checkpoint validation (16 checkpoints per lap)
    const currentCheckpointIndex = Math.floor(playerU * 16);
    if (currentCheckpointIndex !== this.lastCheckpointPassed) {
      // First pass after start grid initialization
      if (this.lastCheckpointPassed === -1) {
        if (currentCheckpointIndex <= 1 || currentCheckpointIndex >= 14) {
          this.lastCheckpointPassed = currentCheckpointIndex;
          this.expectedNextCheckpoint = (currentCheckpointIndex + 1) % 16;
        }
        return;
      }

      // Validate: did we hit the expected next checkpoint?
      if (currentCheckpointIndex === this.expectedNextCheckpoint) {
        // Valid checkpoint pass
        this.lastCheckpointPassed = currentCheckpointIndex;
        this.expectedNextCheckpoint = (currentCheckpointIndex + 1) % 16;
        if (this.raceModes) {
          this.raceModes.onCheckpointPassed(currentCheckpointIndex, this.raceTime);
        }
      } else if (currentCheckpointIndex > this.expectedNextCheckpoint && 
                 currentCheckpointIndex - this.expectedNextCheckpoint <= 2) {
        // Allow small skips (e.g., going fast through a corner)
        this.lastCheckpointPassed = currentCheckpointIndex;
        this.expectedNextCheckpoint = (currentCheckpointIndex + 1) % 16;
        if (this.raceModes) {
          this.raceModes.onCheckpointPassed(currentCheckpointIndex, this.raceTime);
        }
      } else if (Math.abs(currentCheckpointIndex - this.lastCheckpointPassed) > 3) {
        // Check for normal start/finish line wrap-around (e.g. 15 -> 0 or 0 -> 15)
        const isWrapAround = (this.lastCheckpointPassed >= 13 && currentCheckpointIndex <= 2) ||
                             (this.lastCheckpointPassed <= 2 && currentCheckpointIndex >= 13);
        if (!isWrapAround) {
          // Genuine missed checkpoint / shortcut
          this.validLap = false;
          if (this.hud) this.hud.showCheckpointMissed();
        }
        // Still update to prevent stuck state
        this.lastCheckpointPassed = currentCheckpointIndex;
        this.expectedNextCheckpoint = (currentCheckpointIndex + 1) % 16;
      }
    }

    // Finish line crossing check
    if (this.lastCheckpointPassed >= 12 && playerU < 0.08) {
      const lapDuration = this.raceTime - this.currentLapStartTime;
      // Only update best lap from validated laps
      if (this.validLap && lapDuration < this.bestLapTime) {
        this.bestLapTime = lapDuration;
      }
      this.currentLapStartTime = this.raceTime;
      this.validLap = true; // Reset validation for next lap
      this.expectedNextCheckpoint = 0;

      this.playerLap++;
      this.lastCheckpointPassed = 0;

      if (this.playerLap === this.maxLaps) {
        if (window.SoundEngine) {
          window.SoundEngine.announce("FINAL LAP!", true);
          window.SoundEngine.setMusicIntensity('finallap');
        }
      }

      if (this.playerLap > this.maxLaps && this.selectedMode !== 'practice') {
        this.finishRace();
        return;
      }
    }

    // Wrong Way Check
    const forward = this.playerPhysics.getForwardVector();
    const trackSample = this.track.getSampleAt(playerU);
    this.isWrongWay = trackSample && forward.dot(trackSample.tangent) < -0.3 && Math.abs(this.playerPhysics.speed) > 3.0;

    // Leaderboard Position Sorting
    if (this.aiRacers.length > 0) {
      const allRacers = [
        { name: 'Player', physics: this.playerPhysics, lap: this.playerLap, isPlayer: true }
      ];

      this.aiRacers.forEach(ai => {
        allRacers.push({
          name: ai.name,
          physics: ai.physics,
          lap: ai.currentLap,
          isPlayer: false
        });
      });

      allRacers.forEach(r => {
        const u = this.track.getTrackProgress(r.physics.position);
        r.totalScore = (r.lap * 1.0) + u;
      });

      allRacers.sort((a, b) => b.totalScore - a.totalScore);
      const newPos = allRacers.findIndex(r => r.isPlayer) + 1;

      if (newPos !== this.playerPosition && newPos === 1 && this.playerPosition > 1) {
        if (window.SoundEngine) window.SoundEngine.announce("LEAD CHANGE! YOU ARE IN 1ST!");
      }
      this.playerPosition = newPos;
    }
  }

  finishRace() {
    this.gameState = 'FINISHED';

    // Collect actual race results
    const results = [];
    results.push({
      name: 'YOU',
      isPlayer: true,
      time: this.raceTime,
      lap: this.playerLap,
      driftScore: this.playerPhysics.driftScore || 0
    });

    this.aiRacers.forEach(ai => {
      results.push({
        name: ai.name,
        isPlayer: false,
        time: this.raceTime + (Math.random() * 8 + 1), // Estimated offset
        lap: ai.currentLap || this.maxLaps,
        driftScore: 0
      });
    });

    // Sort by lap count desc, then time asc
    results.sort((a, b) => {
      if (b.lap !== a.lap) return b.lap - a.lap;
      return a.time - b.time;
    });

    // Calculate race earnings
    const playerRank = results.findIndex(r => r.isPlayer) + 1;
    const positionBonus = [0, 2000, 1000, 500, 200];
    const baseReward = 500;
    const posReward = positionBonus[playerRank] || 100;
    const lapBonus = this.maxLaps * 150;
    const driftBonus = Math.min(500, Math.floor((this.playerPhysics.driftScore || 0) / 10));
    const pickupCash = this.raceCashEarned;
    const totalEarnings = baseReward + posReward + lapBonus + driftBonus + pickupCash;

    // Award cash
    if (window.SaveManager) {
      window.SaveManager.addCash(totalEarnings);
    }

    // Record best time
    if (window.SaveManager && this.validLap && this.bestLapTime < Infinity) {
      window.SaveManager.recordBestTime(this.selectedMapId, this.bestLapTime);
    }

    if (this.raceModes) {
      this.raceModes.onRaceFinished(this.raceTime, playerRank);
    }

    if (window.SoundEngine) {
      window.SoundEngine.announce(playerRank === 1 ? "VICTORY! RACE COMPLETE!" : "RACE COMPLETE!", true);
      if (playerRank === 1) window.SoundEngine.playVictory();
    }

    // Launch Cinematic Replay
    if (this.replay && this.replay.buffer.length > 10) {
      this.replay.playReplay(() => {
        this.showFinishModal(results, {
          base: baseReward,
          position: posReward,
          laps: lapBonus,
          drift: driftBonus,
          pickups: pickupCash,
          total: totalEarnings,
          rank: playerRank
        });
      });
    } else {
      this.showFinishModal(results, {
        base: baseReward,
        position: posReward,
        laps: lapBonus,
        drift: driftBonus,
        pickups: pickupCash,
        total: totalEarnings,
        rank: playerRank
      });
    }
  }

  showFinishModal(results, earnings) {
    const finishModal = document.getElementById('finish-modal');
    if (finishModal) finishModal.classList.remove('hidden');

    // Total time
    const totalTimeElem = document.getElementById('final-time');
    if (totalTimeElem && this.hud) {
      totalTimeElem.textContent = this.hud.formatTime(this.raceTime);
    }

    // Best lap
    const bestLapDisplay = document.getElementById('best-lap-display');
    const bestLapTime = document.getElementById('best-lap-time');
    const newRecordBadge = document.getElementById('new-record-badge');
    if (bestLapDisplay && this.bestLapTime < Infinity) {
      bestLapDisplay.style.display = 'flex';
      if (bestLapTime && this.hud) bestLapTime.textContent = this.hud.formatTime(this.bestLapTime);
      // Check if it's a new record
      if (window.SaveManager) {
        const profile = window.SaveManager.getProfile();
        const previousBest = profile.bestTimes[this.selectedMapId];
        if (!previousBest || this.bestLapTime <= previousBest) {
          if (newRecordBadge) newRecordBadge.style.display = 'inline-block';
        }
      }
    }

    // Dynamic leaderboard
    const lbContainer = document.getElementById('leaderboard-container');
    if (lbContainer && results) {
      const winnerTime = results[0].time;
      lbContainer.innerHTML = results.map((r, i) => {
        const rank = i + 1;
        const delta = i === 0 ? 'WINNER 🏆' : `+${(r.time - winnerTime).toFixed(1)}s`;
        const playerClass = r.isPlayer ? ' player' : '';
        const medals = ['', '🥇', '🥈', '🥉'];
        return `
          <div class="leaderboard-item${playerClass}" style="animation: slide-in 0.4s ease-out ${i * 0.15}s both;">
            <div class="racer-info">
              <span class="racer-rank">${medals[rank] || rank}</span>
              <span class="racer-name">${r.name}</span>
            </div>
            <span class="racer-time">${delta}</span>
          </div>
        `;
      }).join('');
    }

    // Earnings breakdown
    const earningsRows = document.getElementById('earnings-rows');
    const earningsTotal = document.getElementById('earnings-total-value');
    if (earningsRows && earnings) {
      earningsRows.innerHTML = `
        <div class="earn-row"><span>Completion Bonus</span><span>+${earnings.base} ₡</span></div>
        <div class="earn-row"><span>Position (P${earnings.rank})</span><span>+${earnings.position} ₡</span></div>
        <div class="earn-row"><span>Lap Bonus (×${this.maxLaps})</span><span>+${earnings.laps} ₡</span></div>
        ${earnings.drift > 0 ? `<div class="earn-row"><span>Drift Score</span><span>+${earnings.drift} ₡</span></div>` : ''}
        ${earnings.pickups > 0 ? `<div class="earn-row"><span>Track Pickups</span><span>+${earnings.pickups} ₡</span></div>` : ''}
      `;
    }
    if (earningsTotal && earnings) {
      earningsTotal.textContent = `+${earnings.total.toLocaleString()} ₡`;
    }
  }

  // ─────────────────────────────────────────────
  // NORMALIZED CONTROLLER INTERFACE (Keyboard, Touch & Gamepad)
  // ─────────────────────────────────────────────
  pollNormalizedInputs() {
    let throttle = (this.activeKeys['KeyW'] || this.activeKeys['ArrowUp'] || this.touchInputs.gas) ? 1.0 : 0.0;
    let brake = (this.activeKeys['KeyS'] || this.activeKeys['ArrowDown'] || this.touchInputs.brake) ? 1.0 : 0.0;
    let steer = 0.0;
    if (this.activeKeys['KeyA'] || this.activeKeys['ArrowLeft'] || this.touchInputs.left) steer -= 1.0;
    if (this.activeKeys['KeyD'] || this.activeKeys['ArrowRight'] || this.touchInputs.right) steer += 1.0;

    let handbrake = !!(this.activeKeys['Space'] || (steer !== 0 && brake > 0));
    let nitro = !!(this.activeKeys['ShiftLeft'] || this.activeKeys['ShiftRight'] || this.touchInputs.nitro);
    let reset = !!this.activeKeys['KeyR'];

    // HTML5 Gamepad API Support (Unified normalized controller interface)
    if (typeof navigator !== 'undefined' && navigator.getGamepads) {
      const gamepads = navigator.getGamepads();
      for (let i = 0; i < gamepads.length; i++) {
        const gp = gamepads[i];
        if (gp && gp.connected) {
          // Left analog stick horizontal for steering with deadzone
          const axisSteer = gp.axes && gp.axes[0];
          if (axisSteer !== undefined && Math.abs(axisSteer) > 0.12) {
            steer = THREE.MathUtils.clamp(steer + axisSteer, -1.0, 1.0);
          }
          // D-Pad steering fallback
          if (gp.buttons && gp.buttons[14] && gp.buttons[14].pressed) steer = Math.max(-1.0, steer - 1.0);
          if (gp.buttons && gp.buttons[15] && gp.buttons[15].pressed) steer = Math.min(1.0, steer + 1.0);

          // Right trigger (RT / R2) or A / Cross button for throttle
          const rtVal = (gp.buttons && gp.buttons[7]) ? gp.buttons[7].value : 0;
          const aBtn = (gp.buttons && gp.buttons[0] && gp.buttons[0].pressed) ? 1.0 : 0;
          throttle = Math.max(throttle, Math.max(rtVal, aBtn));

          // Left trigger (LT / L2) or X / Square button for brake
          const ltVal = (gp.buttons && gp.buttons[6]) ? gp.buttons[6].value : 0;
          const xBtn = (gp.buttons && gp.buttons[2] && gp.buttons[2].pressed) ? 1.0 : 0;
          brake = Math.max(brake, Math.max(ltVal, xBtn));

          // B / Circle button or Left Bumper (LB / L1) for handbrake
          if (gp.buttons && ((gp.buttons[1] && gp.buttons[1].pressed) || (gp.buttons[4] && gp.buttons[4].pressed))) {
            handbrake = true;
          }

          // Y / Triangle button or Right Bumper (RB / R1) for nitro
          if (gp.buttons && ((gp.buttons[3] && gp.buttons[3].pressed) || (gp.buttons[5] && gp.buttons[5].pressed))) {
            nitro = true;
          }

          // Back / Select button (Button 8) for vehicle reset
          if (gp.buttons && gp.buttons[8] && gp.buttons[8].pressed) {
            reset = true;
          }
          break; // Primary connected gamepad
        }
      }
    }

    return { throttle, brake, steer, handbrake, nitro, reset };
  }

  // ─────────────────────────────────────────────
  // MAIN ANIMATION LOOP
  // ─────────────────────────────────────────────
  animate() {
    requestAnimationFrame(this.animate.bind(this));

    const dt = Math.min(this.clock.getDelta(), 0.05);

    // 1. Workshop Mode
    if (this.gameState === 'WORKSHOP') {
      if (this.workshop) this.workshop.update(dt);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    // 2. Map Selection Mode
    if (this.gameState === 'MAP_SELECT') {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    // 3. Cinematic Replay Playback
    if (this.replay && this.replay.isPlaying) {
      this.replay.update(dt, this.playerCar, this.aiRacers);
      if (this.weather) this.weather.update(dt, this.camera.position);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    // 4. Countdown & Active Racing — FIXED TIMESTEP PHYSICS
    if (this.gameState === 'RACING' || this.gameState === 'COUNTDOWN') {
      // Poll Unified Normalized Controller Interface (once per frame)
      const input = this.pollNormalizedInputs();

      // Manual Reset Trigger from Gamepad
      if (input.reset && this.gameState === 'RACING' && (!this.respawnPenaltyTimer || this.respawnPenaltyTimer <= 0)) {
        this.respawnPlayer();
      }

      // ── Fixed Timestep Accumulator ──
      // Physics runs at a constant FIXED_DT (120 Hz) for deterministic behavior.
      // Visual rendering interpolates between physics states for smooth display.
      const FIXED_DT = VEHICLE_PHYSICS_CONSTANTS.FIXED_DT;
      const MAX_SUBSTEPS = VEHICLE_PHYSICS_CONSTANTS.MAX_SUBSTEPS;
      this.physicsAccumulator += dt;

      // Cap accumulator to prevent spiral of death on lag spikes
      if (this.physicsAccumulator > FIXED_DT * MAX_SUBSTEPS) {
        this.physicsAccumulator = FIXED_DT * MAX_SUBSTEPS;
      }

      let physicsSteps = 0;
      while (this.physicsAccumulator >= FIXED_DT && physicsSteps < MAX_SUBSTEPS) {
        // Save state before tick for interpolation
        if (this.playerPhysics) this.playerPhysics.saveState();
        this.aiRacers.forEach(ai => ai.physics.saveState());

        if (this.gameState === 'COUNTDOWN') {
          // Lock vehicle in starting grid during countdown - engine can rev with input.throttle, but wheels are clamped
          if (this.playerPhysics) {
            this.playerPhysics.speed = 0.0;
            this.playerPhysics.update(FIXED_DT, { throttle: input.throttle, brake: 0, steer: 0, handbrake: true, nitro: false });
            this.playerPhysics.speed = 0.0;
          }
        } else {
          // Player Physics Update (fixed dt)
          this.playerPhysics.update(FIXED_DT, input);

          // Update AI Opponents (fixed dt)
          const allPhysics = [this.playerPhysics, ...this.aiRacers.map(a => a.physics)];
          this.aiRacers.forEach(ai => ai.update(FIXED_DT, allPhysics));

          // Update Track Systems (civilian traffic, audio, etc.) at fixed rate
          if (this.track && typeof this.track.update === 'function') {
            this.track.update(FIXED_DT, this.playerPhysics, allPhysics);
          }

          // Update Track Props (boost pads, nitro refills, cash pickups)
          if (this.trackProps) {
            this.trackProps.update(FIXED_DT, this.playerPhysics);
          }

          // Update Destructible obstacles & debris pool
          if (this.destructibles) {
            this.destructibles.update(FIXED_DT, this.playerPhysics, allPhysics);
          }

          // Update Dynamic Damage & Detached Debris
          if (this.damageManager) {
            this.damageManager.update(FIXED_DT);
          }

          // Update Velocity-Aware World Streaming
          if (this.streamingManager && this.playerPhysics && this.playerPhysics.latestSnapshot) {
            this.streamingManager.update(this.playerPhysics.latestSnapshot, FIXED_DT);
          }

          this.updateRaceLogic(FIXED_DT);
        }

        this.physicsAccumulator -= FIXED_DT;
        physicsSteps++;
      }

      // ── Rendering Interpolation ──
      // Blend between previous and current physics state for smooth visuals
      const alpha = this.physicsAccumulator / FIXED_DT;
      if (this.playerPhysics) this.playerPhysics.interpolateVisuals(alpha);
      this.aiRacers.forEach(ai => ai.physics.interpolateVisuals(alpha));

      // ── Per-Frame Systems (visual-only, use raw dt) ──
      if (this.gameState === 'RACING') {
        // Record replay frame (once per render frame)
        if (this.replay) {
          this.replay.recordFrame(dt, this.playerCar, this.aiRacers);
        }

        // Update 3D Dynamic Racing Line
        if (this.racingLine) {
          this.racingLine.update(this.playerPhysics);
        }

        // Update Race Mode logic (Time Trial splits / Team points)
        if (this.raceModes) {
          this.raceModes.update(dt);
        }

        // Update Tutorial checks
        if (this.tutorial && this.tutorial.isActive) {
          this.tutorial.update(dt);
        }

        // Update Multiplayer sync
        if (this.multiplayer && this.multiplayer.isConnected && this.multiplayer.currentRoom) {
          this.multiplayer.update(dt);
        }

        // Music adaptive intensity
        if (window.SoundEngine && this.playerLap < this.maxLaps) {
          if (this.playerPhysics.speed > 35) {
            window.SoundEngine.setMusicIntensity('rush');
          } else {
            window.SoundEngine.setMusicIntensity('cruising');
          }
        }
      }
    }

    // Weather particles follow camera
    if (this.weather) {
      this.weather.update(dt, this.camera.position);
    }

    // Camera and HUD
    if (this.chaseCamera) this.chaseCamera.update(dt);
    if (this.hud) {
      const allCarPhysics = [this.playerPhysics, ...this.aiRacers.map(a => a.physics)];
      this.hud.update(this.playerPhysics, this, allCarPhysics);
    }

    // Update HDR Post-Processing Pipeline
    if (this.pipeline && this.playerPhysics) {
      const speedKmh = this.playerPhysics.getSpeedKmh ? this.playerPhysics.getSpeedKmh() : (this.playerPhysics.speed * 3.6);
      this.pipeline.update(dt, speedKmh, this.playerPhysics.isNitroActive, this.playerPhysics.nitroTier || 'standard');
    }

    if (this.pipeline) {
      this.pipeline.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  setupWindowResize() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      if (this.pipeline) {
        this.pipeline.onResize(window.innerWidth, window.innerHeight);
      }
    });
  }
}

// Bootstrap game when page loads
window.addEventListener('DOMContentLoaded', () => {
  window.Game = new GameEngine();
});
