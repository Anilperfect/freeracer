/**
 * Turbo Rush - 3D Interactive Supercar Garage & Performance Showroom.
 * Features:
 * - 360° turntable inspection (drag to rotate, scroll to zoom)
 * - Showroom animations: door open/close test, active aero deployment, engine rev audio, lighting test
 * - Camera angle presets: Front 3/4, Rear 3/4, Side, Cockpit, Free Orbit
 * - 10-Level performance upgrades strictly capped at 150.0 km/h
 * - Full cosmetic customization (paint, finish, rims, calipers, underglow, nitro)
 * - Banked cash vehicle purchasing for the 3 supercars (V10 Corsa, V8 GT, V12 Stradale)
 */

class WorkshopManager {
  constructor(gameEngine) {
    this.game = gameEngine;
    this.screen = document.getElementById('workshop-screen');

    this.carIndex = 0;
    this.allCars = window.CarDatabase;
    this.selectedCarId = (window.SaveManager && window.SaveManager.getProfile().selectedCarId) || 'v01_kairo_pulse_s';

    // 3D Turntable Inspection State
    this.previewCarModel = null;
    this.platform = null;
    this.turntableRotation = 0.55;
    this.isDragging = false;
    this.lastPointerX = 0;
    this.cameraDistance = 5.2;

    // Showroom Animation State
    this.doorsOpen = false;
    this.doorProgress = 0.0;
    this.targetDoorProgress = 0.0;

    this.aeroDeployed = false;
    this.aeroProgress = 0.0;
    this.targetAeroProgress = 0.0;

    this.lightsTest = false;
    this.cameraPreset = 'ORBIT'; // 'ORBIT', 'FRONT', 'REAR', 'SIDE', 'COCKPIT'

    // Active Workshop Tab ('UPGRADES', 'CUSTOMIZE', 'SHOWROOM')
    this.activeTab = 'UPGRADES';

    this.buildUIContainers();
    this.bindEvents();
    this.bindTurntableEvents();
  }

  buildUIContainers() {
    let rightPanel = document.querySelector('.workshop-right-panel');
    if (!rightPanel) return;

    rightPanel.innerHTML = `
      <div class="ws-tab-header" style="display: flex; gap: 6px; margin-bottom: 12px;">
        <button id="ws-tab-upgrades" class="ws-tab-btn active" style="flex: 1; padding: 8px 4px; font-family: 'Orbitron', sans-serif; font-size: 10px; background: #00d8ff; color: #0a0e17; border: none; border-radius: 4px; cursor: pointer; font-weight: 700;">UPGRADES</button>
        <button id="ws-tab-cosmetics" class="ws-tab-btn" style="flex: 1; padding: 8px 4px; font-family: 'Orbitron', sans-serif; font-size: 10px; background: rgba(255,255,255,0.1); color: #fff; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; cursor: pointer; font-weight: 700;">CUSTOMIZE</button>
        <button id="ws-tab-showroom" class="ws-tab-btn" style="flex: 1; padding: 8px 4px; font-family: 'Orbitron', sans-serif; font-size: 10px; background: rgba(255,255,255,0.1); color: #fff; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; cursor: pointer; font-weight: 700;">SHOWROOM</button>
      </div>

      <div class="ws-pr-display" style="display: flex; justify-content: space-between; align-items: center; background: rgba(0, 216, 255, 0.12); padding: 8px 12px; border-radius: 6px; border: 1px solid rgba(0, 216, 255, 0.3); margin-bottom: 12px;">
        <span style="font-family: 'Orbitron', sans-serif; font-size: 11px; color: #a0d8ef;">PERFORMANCE RATING</span>
        <span id="ws-pr-value" style="font-family: 'Orbitron', sans-serif; font-size: 18px; font-weight: 900; color: #00f0ff;">680 PR</span>
      </div>

      <!-- TAB 1: UPGRADES -->
      <div id="ws-panel-upgrades" style="display: block; max-height: 380px; overflow-y: auto;">
        <div id="ws-upgrade-rows"></div>
      </div>

      <!-- TAB 2: COSMETICS -->
      <div id="ws-panel-cosmetics" style="display: none; max-height: 380px; overflow-y: auto;">
        <div style="margin-bottom: 14px;">
          <div style="font-size: 11px; font-family: 'Orbitron', sans-serif; color: #8899aa; margin-bottom: 6px;">PAINT COLOR</div>
          <div id="ws-paint-swatches" style="display: flex; flex-wrap: wrap; gap: 8px;"></div>
        </div>

        <div style="margin-bottom: 14px;">
          <div style="font-size: 11px; font-family: 'Orbitron', sans-serif; color: #8899aa; margin-bottom: 6px;">PAINT FINISH</div>
          <div id="ws-finish-options" style="display: flex; gap: 6px;"></div>
        </div>

        <div style="margin-bottom: 14px;">
          <div style="font-size: 11px; font-family: 'Orbitron', sans-serif; color: #8899aa; margin-bottom: 6px;">ALLOY RIM DESIGN</div>
          <div id="ws-rim-options" style="display: flex; flex-wrap: wrap; gap: 6px;"></div>
        </div>

        <div style="margin-bottom: 14px;">
          <div style="font-size: 11px; font-family: 'Orbitron', sans-serif; color: #8899aa; margin-bottom: 6px;">UNDERGLOW NEON</div>
          <div id="ws-underglow-swatches" style="display: flex; gap: 8px;"></div>
        </div>

        <div style="margin-bottom: 14px;">
          <div style="font-size: 11px; font-family: 'Orbitron', sans-serif; color: #8899aa; margin-bottom: 6px;">NITRO FLAME THRUSTER</div>
          <div id="ws-flame-swatches" style="display: flex; gap: 8px;"></div>
        </div>
      </div>

      <!-- TAB 3: SHOWROOM INTERACTIVE CONTROLS -->
      <div id="ws-panel-showroom" style="display: none; max-height: 380px; overflow-y: auto;">
        <div style="margin-bottom: 14px;">
          <div style="font-size: 11px; font-family: 'Orbitron', sans-serif; color: #8899aa; margin-bottom: 8px;">ANIMATED SHOWROOM ACTIONS</div>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <button id="ws-btn-doors" class="ws-action-toggle" style="padding: 8px 12px; font-family: 'Orbitron', sans-serif; font-size: 11px; background: rgba(0, 216, 255, 0.15); color: #00f0ff; border: 1px solid #00d8ff; border-radius: 4px; cursor: pointer; text-align: left;">
              🚪 OPEN DOORS
            </button>
            <button id="ws-btn-aero" class="ws-action-toggle" style="padding: 8px 12px; font-family: 'Orbitron', sans-serif; font-size: 11px; background: rgba(0, 216, 255, 0.15); color: #00f0ff; border: 1px solid #00d8ff; border-radius: 4px; cursor: pointer; text-align: left;">
              🪽 TEST ACTIVE AERO
            </button>
            <button id="ws-btn-rev" class="ws-action-toggle" style="padding: 8px 12px; font-family: 'Orbitron', sans-serif; font-size: 11px; background: rgba(255, 170, 0, 0.15); color: #ffaa00; border: 1px solid #ffaa00; border-radius: 4px; cursor: pointer; text-align: left;">
              🔊 REV ENGINE (SOUND TEST)
            </button>
            <button id="ws-btn-lights" class="ws-action-toggle" style="padding: 8px 12px; font-family: 'Orbitron', sans-serif; font-size: 11px; background: rgba(255, 255, 255, 0.1); color: #ffffff; border: 1px solid rgba(255,255,255,0.3); border-radius: 4px; cursor: pointer; text-align: left;">
              💡 TEST HEADLIGHTS & BRAKES
            </button>
          </div>
        </div>

        <div style="margin-bottom: 14px;">
          <div style="font-size: 11px; font-family: 'Orbitron', sans-serif; color: #8899aa; margin-bottom: 8px;">CAMERA PRESETS</div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
            <button class="ws-cam-btn" data-cam="FRONT" style="padding: 6px; font-family: 'Orbitron', sans-serif; font-size: 10px; background: rgba(255,255,255,0.08); color: #fff; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; cursor: pointer;">FRONT 3/4</button>
            <button class="ws-cam-btn" data-cam="REAR" style="padding: 6px; font-family: 'Orbitron', sans-serif; font-size: 10px; background: rgba(255,255,255,0.08); color: #fff; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; cursor: pointer;">REAR 3/4</button>
            <button class="ws-cam-btn" data-cam="SIDE" style="padding: 6px; font-family: 'Orbitron', sans-serif; font-size: 10px; background: rgba(255,255,255,0.08); color: #fff; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; cursor: pointer;">SIDE PROFILE</button>
            <button class="ws-cam-btn" data-cam="COCKPIT" style="padding: 6px; font-family: 'Orbitron', sans-serif; font-size: 10px; background: rgba(255,255,255,0.08); color: #fff; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; cursor: pointer;">COCKPIT VIEW</button>
            <button class="ws-cam-btn" data-cam="ORBIT" style="grid-column: span 2; padding: 6px; font-family: 'Orbitron', sans-serif; font-size: 10px; background: #00d8ff; color: #0a0e17; font-weight: 700; border: none; border-radius: 4px; cursor: pointer;">FREE 360° ORBIT</button>
          </div>
        </div>
      </div>
    `;

    // Tab switching handlers
    const tabUpgrades = document.getElementById('ws-tab-upgrades');
    const tabCosmetics = document.getElementById('ws-tab-cosmetics');
    const tabShowroom = document.getElementById('ws-tab-showroom');
    const panelUpgrades = document.getElementById('ws-panel-upgrades');
    const panelCosmetics = document.getElementById('ws-panel-cosmetics');
    const panelShowroom = document.getElementById('ws-panel-showroom');

    const setTab = (tab) => {
      this.activeTab = tab;
      [tabUpgrades, tabCosmetics, tabShowroom].forEach(t => {
        t.style.background = 'rgba(255,255,255,0.1)';
        t.style.color = '#fff';
      });
      [panelUpgrades, panelCosmetics, panelShowroom].forEach(p => p.style.display = 'none');

      if (tab === 'UPGRADES') {
        tabUpgrades.style.background = '#00d8ff'; tabUpgrades.style.color = '#0a0e17';
        panelUpgrades.style.display = 'block';
      } else if (tab === 'CUSTOMIZE') {
        tabCosmetics.style.background = '#00d8ff'; tabCosmetics.style.color = '#0a0e17';
        panelCosmetics.style.display = 'block';
        this.buildCosmeticOptions();
      } else if (tab === 'SHOWROOM') {
        tabShowroom.style.background = '#00d8ff'; tabShowroom.style.color = '#0a0e17';
        panelShowroom.style.display = 'block';
        this.bindShowroomControls();
      }
    };

    tabUpgrades.addEventListener('click', () => setTab('UPGRADES'));
    tabCosmetics.addEventListener('click', () => setTab('CUSTOMIZE'));
    tabShowroom.addEventListener('click', () => setTab('SHOWROOM'));
  }

  bindShowroomControls() {
    // 1. Doors Toggle
    const btnDoors = document.getElementById('ws-btn-doors');
    if (btnDoors) {
      btnDoors.onclick = () => {
        this.doorsOpen = !this.doorsOpen;
        this.targetDoorProgress = this.doorsOpen ? 1.0 : 0.0;
        btnDoors.textContent = this.doorsOpen ? '🚪 CLOSE DOORS' : '🚪 OPEN DOORS';
        btnDoors.style.background = this.doorsOpen ? '#00ff88' : 'rgba(0, 216, 255, 0.15)';
        btnDoors.style.color = this.doorsOpen ? '#0a0e17' : '#00f0ff';
        if (window.SoundEngine) window.SoundEngine.playBeep(this.doorsOpen);
      };
    }

    // 2. Active Aero Toggle
    const btnAero = document.getElementById('ws-btn-aero');
    if (btnAero) {
      btnAero.onclick = () => {
        this.aeroDeployed = !this.aeroDeployed;
        this.targetAeroProgress = this.aeroDeployed ? 1.0 : 0.0;
        btnAero.textContent = this.aeroDeployed ? '🪽 RETRACT ACTIVE AERO' : '🪽 TEST ACTIVE AERO';
        btnAero.style.background = this.aeroDeployed ? '#00ff88' : 'rgba(0, 216, 255, 0.15)';
        btnAero.style.color = this.aeroDeployed ? '#0a0e17' : '#00f0ff';
        if (window.SoundEngine) window.SoundEngine.playBeep(this.aeroDeployed);
      };
    }

    // 3. Rev Engine Audio
    const btnRev = document.getElementById('ws-btn-rev');
    if (btnRev) {
      btnRev.onclick = () => {
        const car = this.allCars[this.carIndex];
        if (window.SoundEngine) {
          window.SoundEngine.previewEngineRev(car.id);
        }
        btnRev.style.background = '#ffaa00';
        btnRev.style.color = '#0a0e17';
        btnRev.textContent = '🔊 REVVING...';
        setTimeout(() => {
          btnRev.style.background = 'rgba(255, 170, 0, 0.15)';
          btnRev.style.color = '#ffaa00';
          btnRev.textContent = '🔊 REV ENGINE (SOUND TEST)';
        }, 2000);
      };
    }

    // 4. Lights Test
    const btnLights = document.getElementById('ws-btn-lights');
    if (btnLights) {
      btnLights.onclick = () => {
        this.lightsTest = !this.lightsTest;
        btnLights.textContent = this.lightsTest ? '💡 LIGHTS: ACTIVE' : '💡 TEST HEADLIGHTS & BRAKES';
        btnLights.style.background = this.lightsTest ? '#ffffff' : 'rgba(255, 255, 255, 0.1)';
        btnLights.style.color = this.lightsTest ? '#0a0e17' : '#ffffff';

        if (this.previewCarModel) {
          this.previewCarModel.brakeLights.forEach(b => {
            if (b && b.material) b.material.emissiveIntensity = this.lightsTest ? 3.8 : 0.9;
          });
          this.previewCarModel.headlights.forEach(h => {
            if (h && h.material) h.material.emissiveIntensity = this.lightsTest ? 5.5 : 3.6;
          });
        }
      };
    }

    // 5. Camera Presets
    document.querySelectorAll('.ws-cam-btn').forEach(btn => {
      btn.onclick = (e) => {
        const cam = e.currentTarget.getAttribute('data-cam');
        this.cameraPreset = cam;
        if (cam === 'FRONT') {
          this.turntableRotation = 0.55;
          this.cameraDistance = 6.2;
        } else if (cam === 'REAR') {
          this.turntableRotation = 3.65;
          this.cameraDistance = 6.4;
        } else if (cam === 'SIDE') {
          this.turntableRotation = 1.57;
          this.cameraDistance = 7.0;
        } else if (cam === 'COCKPIT') {
          this.turntableRotation = 0.0;
        } else {
          this.cameraPreset = 'ORBIT';
        }
        if (window.SoundEngine) window.SoundEngine.playBeep(true);
      };
    });
  }

  bindEvents() {
    const btnNext = document.getElementById('btn-next-car');
    const btnPrev = document.getElementById('btn-prev-car');
    const btnSelect = document.getElementById('btn-select-car');
    const btnStart = document.getElementById('btn-start-race');

    if (btnNext) btnNext.addEventListener('click', () => this.changeCar(1));
    if (btnPrev) btnPrev.addEventListener('click', () => this.changeCar(-1));

    if (btnSelect) {
      btnSelect.addEventListener('click', () => {
        const currentCar = this.allCars[this.carIndex];
        const isUnlocked = window.SaveManager ? window.SaveManager.isCarUnlocked(currentCar.id) : true;

        if (!isUnlocked) {
          // Attempt vehicle purchase with banked cash
          const currentCash = window.SaveManager ? window.SaveManager.getCash() : 0;
          if (currentCash >= currentCar.price) {
            window.SaveManager.spendCash(currentCar.price, `Purchased ${currentCar.name}`);
            window.SaveManager.unlockCar(currentCar.id);
            this.selectedCarId = currentCar.id;
            window.SaveManager.getProfile().selectedCarId = this.selectedCarId;
            window.SaveManager.save();
            localStorage.setItem('turbo_rush_selected_car', this.selectedCarId);
            this.updateUI();
            if (window.SoundEngine) window.SoundEngine.playBeep(true);
          } else {
            // Flash red for insufficient funds
            btnSelect.style.background = '#ff2222';
            btnSelect.textContent = 'NO CASH!';
            setTimeout(() => this.updateButtons(), 1000);
          }
        } else {
          // Select unlocked car
          this.selectedCarId = currentCar.id;
          if (window.SaveManager) {
            window.SaveManager.getProfile().selectedCarId = this.selectedCarId;
            window.SaveManager.save();
          }
          localStorage.setItem('turbo_rush_selected_car', this.selectedCarId);
          this.updateButtons();
          if (window.SoundEngine) window.SoundEngine.playBeep(true);
        }
      });
    }

    if (btnStart) {
      btnStart.addEventListener('click', () => {
        this.exitWorkshop();
      });
    }
  }

  bindTurntableEvents() {
    const container = document.getElementById('canvas-container');
    if (!container) return;

    container.addEventListener('pointerdown', (e) => {
      if (this.game.gameState !== 'WORKSHOP') return;
      this.isDragging = true;
      this.lastPointerX = e.clientX;
      this.cameraPreset = 'ORBIT';
    });

    window.addEventListener('pointermove', (e) => {
      if (!this.isDragging || this.game.gameState !== 'WORKSHOP') return;
      const deltaX = e.clientX - this.lastPointerX;
      this.turntableRotation += deltaX * 0.008;
      this.lastPointerX = e.clientX;
    });

    window.addEventListener('pointerup', () => {
      this.isDragging = false;
    });

    container.addEventListener('wheel', (e) => {
      if (this.game.gameState !== 'WORKSHOP') return;
      this.cameraDistance = THREE.MathUtils.clamp(this.cameraDistance + e.deltaY * 0.005, 4.5, 10.0);
    });
  }

  enterWorkshop() {
    this.screen.classList.remove('hidden');
    this.screen.style.display = 'flex';

    this.cameraDistance = 5.2;
    this.turntableRotation = 0.55;
    this.doorsOpen = false;
    this.doorProgress = 0.0;
    this.targetDoorProgress = 0.0;
    this.aeroDeployed = false;
    this.aeroProgress = 0.0;
    this.targetAeroProgress = 0.0;
    this.cameraPreset = 'ORBIT';

    const selectedIdx = this.allCars.findIndex(c => c.id === this.selectedCarId);
    this.carIndex = selectedIdx >= 0 ? selectedIdx : 0;

    this.spawnPlatform();
    this.updateUI();
  }

  exitWorkshop() {
    this.screen.classList.add('hidden');
    setTimeout(() => {
      this.screen.style.display = 'none';
      if (this.previewCarModel) {
        this.game.scene.remove(this.previewCarModel.group);
      }
      if (this.platform) {
        this.game.scene.remove(this.platform);
      }
      this.game.openMapSelect(this.selectedCarId);
    }, 300);
  }

  spawnPlatform() {
    if (!this.platform) {
      const platformGroup = new THREE.Group();

      // 1. Enclosed Luxury Studio Architectural Cyclorama (Blocks all outside track objects)
      const coveGeom = new THREE.CylinderGeometry(22, 22, 14, 48, 1, true);
      const coveMat = new THREE.MeshStandardMaterial({
        color: 0x090d16,
        roughness: 0.82,
        metalness: 0.15,
        side: THREE.BackSide
      });
      const studioCove = new THREE.Mesh(coveGeom, coveMat);
      studioCove.position.y = 6.8;
      platformGroup.add(studioCove);

      // 2. High-Gloss Epoxy Mirror Showroom Floor
      const floorGeom = new THREE.CircleGeometry(22, 48);
      const floorMat = new THREE.MeshStandardMaterial({
        color: 0x0a0e18,
        metalness: 0.94,
        roughness: 0.12
      });
      const studioFloor = new THREE.Mesh(floorGeom, floorMat);
      studioFloor.rotation.x = -Math.PI * 0.5;
      studioFloor.position.y = -0.02;
      studioFloor.receiveShadow = true;
      platformGroup.add(studioFloor);

      // 3. Central Turntable Plinth
      const geom = new THREE.CylinderGeometry(4.4, 4.6, 0.25, 48);
      const mat = new THREE.MeshStandardMaterial({ color: 0x121724, metalness: 0.90, roughness: 0.18 });
      const base = new THREE.Mesh(geom, mat);
      base.position.y = -0.12;
      base.receiveShadow = true;
      platformGroup.add(base);

      // Glowing Hyper-Cyan Perimeter Ring
      const ringGeom = new THREE.TorusGeometry(4.45, 0.045, 16, 64);
      ringGeom.rotateX(Math.PI * 0.5);
      const ringMat = new THREE.MeshStandardMaterial({
        color: 0x00f0ff,
        emissive: 0x00f0ff,
        emissiveIntensity: 2.8,
        roughness: 0.2
      });
      const ring = new THREE.Mesh(ringGeom, ringMat);
      ring.position.y = 0.01;
      platformGroup.add(ring);

      // 4. Overhead Studio Softbox Light Panels (Diffused Illumination)
      [-2.4, 2.4].forEach(x => {
        const sbGeom = new THREE.BoxGeometry(2.2, 0.08, 6.4);
        const sbMat = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          emissive: 0xfffaea,
          emissiveIntensity: 2.2,
          roughness: 0.1
        });
        const softbox = new THREE.Mesh(sbGeom, sbMat);
        softbox.position.set(x, 7.8, 0);
        platformGroup.add(softbox);
      });

      // 5. Studio 3-Point Calibrated Lighting
      // Key Light (High-Angle Soft Spotlight)
      const spotLight = new THREE.SpotLight(0xfffaee, 4.5, 35, Math.PI / 3.8, 0.45);
      spotLight.position.set(0, 8.2, 3.2);
      spotLight.castShadow = true;
      spotLight.shadow.mapSize.width = 1024;
      spotLight.shadow.mapSize.height = 1024;
      platformGroup.add(spotLight);

      // Cyan Rim Light (Accentuates Supercar Silhouettes)
      const rimLight = new THREE.PointLight(0x00f0ff, 3.8, 22);
      rimLight.position.set(-4.5, 2.6, -4.5);
      platformGroup.add(rimLight);

      // Warm Golden Fill Light
      const fillLight = new THREE.PointLight(0xffaa44, 3.2, 22);
      fillLight.position.set(4.8, 2.6, 3.8);
      platformGroup.add(fillLight);

      this.platform = platformGroup;
    }
    this.game.scene.add(this.platform);
  }

  changeCar(dir) {
    this.carIndex += dir;
    if (this.carIndex < 0) this.carIndex = this.allCars.length - 1;
    if (this.carIndex >= this.allCars.length) this.carIndex = 0;

    // Reset door and aero state on car change
    this.doorsOpen = false;
    this.doorProgress = 0.0;
    this.targetDoorProgress = 0.0;
    this.aeroDeployed = false;
    this.aeroProgress = 0.0;
    this.targetAeroProgress = 0.0;

    this.updateUI();
    if (window.SoundEngine) window.SoundEngine.playBeep(false);
  }

  updateUI() {
    const car = this.allCars[this.carIndex];

    const nameEl = document.getElementById('ws-car-name');
    const mfgEl = document.getElementById('ws-car-mfg');
    const clsEl = document.getElementById('ws-car-class');
    const descEl = document.getElementById('ws-car-desc');

    if (nameEl) nameEl.textContent = car.name;
    if (mfgEl) mfgEl.textContent = `${car.manufacturer} • ${car.engine.type} (${car.engine.redline.toLocaleString()} RPM)`;
    if (clsEl) clsEl.textContent = car.carClass;
    if (descEl) descEl.textContent = car.description;

    // Performance Rating
    const prVal = window.SaveManager ? window.SaveManager.calculatePR(car.id) : 680;
    const prEl = document.getElementById('ws-pr-value');
    if (prEl) prEl.textContent = prVal + ' PR';

    this.buildUpgradeRows(car);
    this.buildCosmeticOptions();
    this.updateButtons();
    this.spawnPreviewCar(car.id);
  }

  buildUpgradeRows(car) {
    const container = document.getElementById('ws-upgrade-rows');
    if (!container) return;

    const statsList = [
      { key: 'acceleration', name: 'Acceleration', base: car.stats.acceleration },
      { key: 'handling', name: 'Handling', base: car.stats.handling },
      { key: 'braking', name: 'Braking', base: car.stats.braking },
      { key: 'tireGrip', name: 'Tire Grip', base: car.stats.grip },
      { key: 'nitroCapacity', name: 'Nitro Capacity', base: Math.round(car.physics.nitroCapacity * 0.75) },
      { key: 'nitroEfficiency', name: 'Nitro Efficiency', base: 72 },
      { key: 'landingStability', name: 'Stability', base: car.stats.stability }
    ];

    const installedUpgrades = window.SaveManager ? window.SaveManager.getUpgrades(car.id) : {};
    const currentCash = window.SaveManager ? window.SaveManager.getCash() : 0;

    let html = `
      <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255, 215, 0, 0.12); padding: 6px 12px; border-radius: 6px; border: 1px solid rgba(255, 215, 0, 0.3); margin-bottom: 10px;">
        <span style="font-family: 'Orbitron', sans-serif; font-size: 11px; color: #d4a029;">WALLET BALANCE</span>
        <span style="font-family: 'Orbitron', sans-serif; font-size: 16px; font-weight: 900; color: #ffd700;">₡ ${currentCash.toLocaleString()}</span>
      </div>
    `;

    statsList.forEach(stat => {
      const level = installedUpgrades[stat.key] || 0;
      const boostedVal = Math.min(100, Math.round(stat.base + (level * 2.5)));
      const isMax = level >= 10;
      const cost = window.SaveManager ? window.SaveManager.getUpgradeCost(car.id, stat.key) : null;
      const canAfford = cost !== null && currentCash >= cost;

      let btnLabel, btnBg, btnColor, btnCursor, btnDisabled;
      if (isMax) {
        btnLabel = 'MAX';
        btnBg = 'rgba(255,255,255,0.08)';
        btnColor = '#666';
        btnCursor = 'default';
        btnDisabled = 'disabled';
      } else if (!canAfford) {
        btnLabel = `₡${cost}`;
        btnBg = 'rgba(255,100,100,0.15)';
        btnColor = '#ff6666';
        btnCursor = 'not-allowed';
        btnDisabled = 'disabled';
      } else {
        btnLabel = `▲ ₡${cost}`;
        btnBg = '#00f0ff';
        btnColor = '#0a0e17';
        btnCursor = 'pointer';
        btnDisabled = '';
      }

      html += `
        <div class="stat-row" style="margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;">
          <div style="width: 105px;">
            <div style="font-size: 11px; font-weight: 600; color: #fff;">${stat.name}</div>
            <div style="font-size: 9px; color: #00d8ff; font-family: monospace;">LVL ${level}/10</div>
          </div>

          <div style="flex: 1; margin: 0 10px; height: 8px; background: rgba(255,255,255,0.1); border-radius: 4px; overflow: hidden; position: relative;">
            <div style="height: 100%; width: ${boostedVal}%; background: linear-gradient(90deg, #0088ff, #00f0ff); border-radius: 4px; transition: width 0.3s ease;"></div>
          </div>

          <span style="width: 28px; font-size: 11px; font-family: monospace; text-align: right; color: #fff;">${boostedVal}</span>

          <button class="ws-upgrade-btn" data-key="${stat.key}" ${btnDisabled} style="margin-left: 8px; padding: 3px 8px; font-size: 10px; font-weight: 700; background: ${btnBg}; color: ${btnColor}; border: none; border-radius: 3px; cursor: ${btnCursor}; min-width: 55px; transition: all 0.2s ease;">
            ${btnLabel}
          </button>
        </div>
      `;
    });

    container.innerHTML = html;

    container.querySelectorAll('.ws-upgrade-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const key = e.currentTarget.getAttribute('data-key');
        if (window.SaveManager) {
          const result = window.SaveManager.upgradeStat(car.id, key);
          if (result === -1) {
            e.currentTarget.style.background = '#ff3333';
            e.currentTarget.textContent = 'NO CASH!';
            setTimeout(() => this.updateUI(), 800);
          } else {
            this.updateUI();
            if (window.SoundEngine) window.SoundEngine.playBeep(true);
          }
        }
      });
    });
  }

  buildCosmeticOptions() {
    const car = this.allCars[this.carIndex];
    const profile = window.SaveManager ? window.SaveManager.getProfile() : null;
    const currentCosmetics = (profile && profile.cosmetics && profile.cosmetics[car.id]) || {
      color: '#' + car.colorHex.toString(16).padStart(6, '0'),
      finish: 'metallic',
      rimFinish: 'silver_chrome',
      underglowColor: '#00d8ff',
      nitroFlameColor: '#00f0ff'
    };

    // 1. Paint Swatches
    const swatchContainer = document.getElementById('ws-paint-swatches');
    if (swatchContainer) {
      const colors = ['#e61a2b', '#1a56e6', '#d4dae0', '#101216', '#7700ff', '#00ff88', '#ff9900', '#ff0066'];
      swatchContainer.innerHTML = colors.map(c => `
        <div class="ws-color-dot" data-color="${c}" style="width: 24px; height: 24px; border-radius: 50%; background: ${c}; cursor: pointer; border: 2px solid ${currentCosmetics.color === c ? '#fff' : 'transparent'};"></div>
      `).join('');

      swatchContainer.querySelectorAll('.ws-color-dot').forEach(dot => {
        dot.addEventListener('click', (e) => {
          const col = e.currentTarget.getAttribute('data-color');
          currentCosmetics.color = col;
          if (window.SaveManager) window.SaveManager.setCosmetics(car.id, { color: col });
          if (this.previewCarModel) this.previewCarModel.setCustomization({ color: col });
          this.buildCosmeticOptions();
        });
      });
    }

    // 2. Paint Finishes
    const finishContainer = document.getElementById('ws-finish-options');
    if (finishContainer) {
      const finishes = ['metallic', 'gloss', 'matte', 'chrome'];
      finishContainer.innerHTML = finishes.map(f => `
        <button class="ws-opt-btn" data-finish="${f}" style="flex: 1; padding: 4px 6px; font-size: 10px; font-family: 'Orbitron', sans-serif; background: ${currentCosmetics.finish === f ? '#00d8ff' : 'rgba(255,255,255,0.1)'}; color: ${currentCosmetics.finish === f ? '#0a0e17' : '#fff'}; border: none; border-radius: 3px; cursor: pointer; text-transform: uppercase;">
          ${f}
        </button>
      `).join('');

      finishContainer.querySelectorAll('.ws-opt-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const fin = e.currentTarget.getAttribute('data-finish');
          currentCosmetics.finish = fin;
          if (window.SaveManager) window.SaveManager.setCosmetics(car.id, { finish: fin });
          if (this.previewCarModel) this.previewCarModel.setCustomization({ finish: fin });
          this.buildCosmeticOptions();
        });
      });
    }

    // 3. Rim Finishes
    const rimContainer = document.getElementById('ws-rim-options');
    if (rimContainer) {
      const rims = [
        { id: 'silver_chrome', label: 'Silver' },
        { id: 'gloss_black', label: 'Black' },
        { id: 'forged_gold', label: 'Gold' },
        { id: 'satin_bronze', label: 'Bronze' },
        { id: 'gunmetal', label: 'Gunmetal' }
      ];
      rimContainer.innerHTML = rims.map(r => `
        <button class="ws-rim-btn" data-rim="${r.id}" style="padding: 4px 8px; font-size: 9px; font-family: 'Orbitron', sans-serif; background: ${currentCosmetics.rimFinish === r.id ? '#00d8ff' : 'rgba(255,255,255,0.1)'}; color: ${currentCosmetics.rimFinish === r.id ? '#0a0e17' : '#fff'}; border: none; border-radius: 3px; cursor: pointer;">
          ${r.label}
        </button>
      `).join('');

      rimContainer.querySelectorAll('.ws-rim-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const rim = e.currentTarget.getAttribute('data-rim');
          currentCosmetics.rimFinish = rim;
          if (window.SaveManager) window.SaveManager.setCosmetics(car.id, { rimFinish: rim });
          if (this.previewCarModel) this.previewCarModel.setCustomization({ rimFinish: rim });
          this.buildCosmeticOptions();
        });
      });
    }

    // 4. Underglow Swatches
    const underglowContainer = document.getElementById('ws-underglow-swatches');
    if (underglowContainer) {
      const underglows = ['#00d8ff', '#ff0055', '#00ff88', '#ffaa00', '#9900ff', '#ffffff'];
      underglowContainer.innerHTML = underglows.map(c => `
        <div class="ws-glow-dot" data-glow="${c}" style="width: 22px; height: 22px; border-radius: 50%; background: ${c}; cursor: pointer; box-shadow: 0 0 8px ${c}; border: 2px solid ${currentCosmetics.underglowColor === c ? '#fff' : 'transparent'};"></div>
      `).join('');

      underglowContainer.querySelectorAll('.ws-glow-dot').forEach(dot => {
        dot.addEventListener('click', (e) => {
          const glow = e.currentTarget.getAttribute('data-glow');
          currentCosmetics.underglowColor = glow;
          if (window.SaveManager) window.SaveManager.setCosmetics(car.id, { underglowColor: glow });
          if (this.previewCarModel) this.previewCarModel.setCustomization({ underglowColor: glow });
          this.buildCosmeticOptions();
        });
      });
    }

    // 5. Nitro Flame Swatches
    const flameContainer = document.getElementById('ws-flame-swatches');
    if (flameContainer) {
      const flames = ['#00f0ff', '#ff5500', '#00ff88', '#cc00ff', '#ff0066'];
      flameContainer.innerHTML = flames.map(c => `
        <div class="ws-flame-dot" data-flame="${c}" style="width: 22px; height: 22px; border-radius: 50%; background: ${c}; cursor: pointer; box-shadow: 0 0 8px ${c}; border: 2px solid ${currentCosmetics.nitroFlameColor === c ? '#fff' : 'transparent'};"></div>
      `).join('');

      flameContainer.querySelectorAll('.ws-flame-dot').forEach(dot => {
        dot.addEventListener('click', (e) => {
          const fl = e.currentTarget.getAttribute('data-flame');
          currentCosmetics.nitroFlameColor = fl;
          if (window.SaveManager) window.SaveManager.setCosmetics(car.id, { nitroFlameColor: fl });
          if (this.previewCarModel) this.previewCarModel.setCustomization({ nitroFlameColor: fl });
          this.buildCosmeticOptions();
        });
      });
    }
  }

  updateButtons() {
    const car = this.allCars[this.carIndex];
    const btnSelect = document.getElementById('btn-select-car');
    const btnStart = document.getElementById('btn-start-race');
    const isUnlocked = window.SaveManager ? window.SaveManager.isCarUnlocked(car.id) : true;

    if (btnSelect && btnStart) {
      if (!isUnlocked) {
        // Locked vehicle - offer purchase
        btnSelect.textContent = `PURCHASE ₡${car.price.toLocaleString()}`;
        btnSelect.disabled = false;
        btnSelect.style.opacity = '1';
        btnSelect.style.background = '#ffd700';
        btnSelect.style.color = '#0a0e17';
        btnStart.classList.add('hidden');
      } else if (this.selectedCarId === car.id) {
        // Already selected
        btnSelect.textContent = 'SELECTED ✓';
        btnSelect.disabled = true;
        btnSelect.style.opacity = '0.6';
        btnSelect.style.background = '#00d8ff';
        btnSelect.style.color = '#0a0e17';
        btnStart.classList.remove('hidden');
      } else {
        // Unlocked and ready to select
        btnSelect.textContent = 'SELECT CAR';
        btnSelect.disabled = false;
        btnSelect.style.opacity = '1';
        btnSelect.style.background = '#00d8ff';
        btnSelect.style.color = '#0a0e17';
        btnStart.classList.add('hidden');
      }
    }
  }

  spawnPreviewCar(carId) {
    if (this.previewCarModel) {
      this.game.scene.remove(this.previewCarModel.group);
    }
    const car = window.getCarById(carId);
    this.previewCarModel = new window.CarModel(car.colorHex, false, carId, 0); // High-detail LOD 0
    this.previewCarModel.group.position.set(0, 0.22, 0);

    // Apply saved customizations if available
    if (window.SaveManager) {
      const profile = window.SaveManager.getProfile();
      if (profile.cosmetics && profile.cosmetics[carId]) {
        this.previewCarModel.setCustomization(profile.cosmetics[carId]);
      }
    }

    this.game.scene.add(this.previewCarModel.group);
  }

  update(dt) {
    // Smooth door animation update
    if (Math.abs(this.doorProgress - this.targetDoorProgress) > 0.001) {
      this.doorProgress = THREE.MathUtils.damp(this.doorProgress, this.targetDoorProgress, 6.0, dt);
      if (this.previewCarModel) {
        this.previewCarModel.setDoorOpenProgress(this.doorProgress);
      }
    }

    // Smooth active aero animation update
    if (Math.abs(this.aeroProgress - this.targetAeroProgress) > 0.001) {
      this.aeroProgress = THREE.MathUtils.damp(this.aeroProgress, this.targetAeroProgress, 6.0, dt);
      if (this.previewCarModel) {
        this.previewCarModel.setActiveAeroProgress(this.aeroProgress);
      }
    }

    // Turntable auto rotation when not dragging and in ORBIT mode
    if (!this.isDragging && this.cameraPreset === 'ORBIT' && this.previewCarModel) {
      this.turntableRotation += 0.30 * dt;
    }

    if (this.previewCarModel) {
      this.previewCarModel.group.rotation.y = this.turntableRotation;
    }
    if (this.platform) {
      this.platform.rotation.y = this.turntableRotation;
    }

    // Camera positioning based on preset
    if (this.cameraPreset === 'MANUAL') {
      return;
    }

    if (this.cameraPreset === 'COCKPIT' && this.previewCarModel) {
      // Driver seat inspection view inside the cockpit
      const car = this.allCars[this.carIndex];
      const anchor = (car.anchors && car.anchors.driverCamera) || { x: -0.36, y: 1.05, z: -0.05 };
      const eyePos = new THREE.Vector3(anchor.x, anchor.y + 0.35, anchor.z);
      eyePos.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.turntableRotation);
      this.game.camera.position.set(eyePos.x, eyePos.y + 0.22, eyePos.z);

      const lookAhead = new THREE.Vector3(anchor.x * 0.5, anchor.y + 0.28, anchor.z + 5.0);
      lookAhead.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.turntableRotation);
      this.game.camera.lookAt(lookAhead.x, lookAhead.y + 0.22, lookAhead.z);
    } else {
      // Orbit showroom view
      const camAngle = 0.52;
      const camX = Math.sin(camAngle) * this.cameraDistance;
      const camZ = Math.cos(camAngle) * this.cameraDistance;
      const camY = 1.30 + (this.cameraDistance * 0.12);

      this.game.camera.position.set(camX, camY, camZ);
      this.game.camera.lookAt(0, 0.45, 0);
    }
  }
}

window.WorkshopManager = WorkshopManager;
