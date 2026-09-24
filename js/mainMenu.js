/**
 * FreeRacer - Title screen & main menu
 * ---------------------------------------------------------------------------
 * TITLE → MAIN_MENU → (Free Roam | Garage | Circuit Events | Settings | Credits)
 * The open world is built while the title screen is up and used as a live
 * cinematic backdrop for the menu.
 */
(function () {
  const GAME_VERSION = 'v0.6.1 — Neon Coast complete';
  window.FREERACER_VERSION = 'v0.6.1';

  class MainMenuManager {
    constructor(game) {
      this.game = game;
      const $ = (id) => document.getElementById(id);
      this.title = $('title-screen');
      this.menu = $('main-menu');
      this.credits = $('credits-modal');
      this.titleHint = $('title-hint');
      this.titleStatus = $('title-status');
      this.profileCard = $('mm-profile');
      this.version = $('mm-version');
      this.worldReady = false;
      this.titleActive = false;
      this.menuActive = false;
      this.orbitAngle = 0;
      this.orbitTarget = new THREE.Vector3(0, 30, 0);
      this.onTitleKey = this.onTitleKey.bind(this);
      this.onMenuKey = this.onMenuKey.bind(this);
      if (this.version) this.version.textContent = GAME_VERSION;
      this.bind();
    }

    bind() {
      const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
      on('btn-mm-drive', () => this.startFreeRoam());
      on('btn-mm-garage', () => this.openGarage());
      on('btn-mm-circuits', () => this.openCircuits());
      on('btn-mm-settings', () => this.game.openSettings());
      on('btn-mm-credits', () => this.showCredits(true));
      on('btn-credits-close', () => this.showCredits(false));
      on('btn-mm-reset-save', () => this.confirmResetSave());
      if (this.title) {
        this.title.addEventListener('click', () => this.leaveTitle());
        this.title.addEventListener('touchend', () => this.leaveTitle());
      }
    }

    // ── Title ─────────────────────────────────────────────────────────────
    showTitle() {
      this.game.gameState = 'TITLE';
      this.titleActive = true;
      if (this.title) { this.title.classList.remove('hidden'); this.title.style.display = 'flex'; }
      if (this.menu) this.menu.classList.add('hidden');
      if (this.titleHint) this.titleHint.textContent = 'BUILDING NEON COAST…';
      if (this.titleStatus) this.titleStatus.textContent = '';
      window.addEventListener('keydown', this.onTitleKey);
      // Build the world after the title has painted once
      setTimeout(() => this.prepareWorld(), 60);
    }

    prepareWorld() {
      if (this.worldReady) return;
      try {
        this.game.openWorld.prepare();
        this.game.openWorld.attach();
        this.game.openWorld.applyLighting();
        this.game.camera.far = 3400;
        this.game.camera.updateProjectionMatrix();
        this.worldReady = true;
        const ms = this.game.openWorld.buildMs || 0;
        if (this.titleStatus) this.titleStatus.textContent = `Apex Downtown ready in ${(ms / 1000).toFixed(1)} s`;
      } catch (err) {
        console.error('[MainMenu] world build failed', err);
        if (this.titleStatus) this.titleStatus.textContent = 'World build failed — see console. Circuit events still available.';
      }
      if (this.titleHint) this.titleHint.textContent = 'PRESS ANY KEY OR CLICK TO START';
      this.titleReadyTime = performance.now();
    }

    onTitleKey(e) {
      if (e.repeat) return;
      this.leaveTitle();
    }

    leaveTitle() {
      if (!this.titleActive) return;
      if (!this.worldReady && this.titleHint && this.titleHint.textContent.indexOf('BUILDING') === 0) return;
      this.titleActive = false;
      window.removeEventListener('keydown', this.onTitleKey);
      if (window.SoundEngine && window.SoundEngine.ensureContext) window.SoundEngine.ensureContext();
      if (this.title) { this.title.classList.add('hidden'); setTimeout(() => { if (this.title) this.title.style.display = 'none'; }, 350); }
      this.showMenu();
    }

    // ── Menu ─────────────────────────────────────────────────────────────
    showMenu() {
      this.game.gameState = 'MAIN_MENU';
      this.menuActive = true;
      if (this.menu) { this.menu.classList.remove('hidden'); this.menu.style.display = 'flex'; }
      this.refreshProfile();
      window.addEventListener('keydown', this.onMenuKey);
      if (this.worldReady) {
        this.game.openWorld.attach();
        this.game.openWorld.applyLighting();
        this.game.camera.far = 3400;
        this.game.camera.updateProjectionMatrix();
      }
      const hud = document.getElementById('hud');
      if (hud) hud.style.display = 'none';
      if (window.SaveManager && window.SaveManager.migratedFromLegacy) {
        window.SaveManager.migratedFromLegacy = false;
        this.flash('Turbo Rush save imported — credits, cars and upgrades carried over.');
      }
    }

    hideMenu() {
      this.menuActive = false;
      window.removeEventListener('keydown', this.onMenuKey);
      if (this.menu) { this.menu.classList.add('hidden'); this.menu.style.display = 'none'; }
      this.showCredits(false);
    }

    onMenuKey(e) {
      if (this.game.gameState !== 'MAIN_MENU') return;
      const settings = document.getElementById('settings-modal');
      if (settings && settings.style.display === 'flex') return;
      if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); this.startFreeRoam(); }
      if (e.code === 'KeyG') this.openGarage();
      if (e.code === 'Escape') this.showCredits(false);
    }

    refreshProfile() {
      if (!this.profileCard || !window.SaveManager) return;
      const sm = window.SaveManager;
      const info = sm.getLevelInfo();
      const prog = sm.getProfile().progress;
      const car = window.getCarById ? window.getCarById(sm.getSelectedCarId()) : null;
      const totals = window.DistrictRegistry ? window.DistrictRegistry.totals() : {
        districts: 1,
        events: window.DistrictApexDowntownEvents ? window.DistrictApexDowntownEvents.length : 0,
        discoveries: window.DistrictApexDowntown ? window.DistrictApexDowntown.discoveries.length : 0
      };
      const events = totals.events;
      const discoveries = totals.discoveries;
      const unlockedDistricts = window.DistrictRegistry ? window.DistrictRegistry.unlocked().length : 1;
      const lastDistrict = prog.lastDistrict && window.DistrictRegistry && window.DistrictRegistry.get(prog.lastDistrict)
        ? window.DistrictRegistry.get(prog.lastDistrict).name : 'Apex Downtown';
      this.profileCard.innerHTML = `
        <div class="mm-profile-row big"><span>₡ ${sm.getCash().toLocaleString()}</span><span>LV ${info.level} · ${info.title}</span></div>
        <div class="mm-rep-bar"><div class="mm-rep-fill" style="width:${Math.round(info.progress * 100)}%"></div></div>
        <div class="mm-profile-row"><span>Reputation</span><span>${info.reputation}${info.nextRep ? ` / ${info.nextRep}` : ' (max)'}</span></div>
        <div class="mm-profile-row"><span>Current car</span><span>${car ? car.name : '—'}</span></div>
        <div class="mm-profile-row"><span>Districts</span><span>${unlockedDistricts} / ${totals.districts} unlocked</span></div>
        <div class="mm-profile-row"><span>Events cleared</span><span>${Object.keys(prog.eventRecords).length} / ${events}</span></div>
        <div class="mm-profile-row"><span>Discoveries</span><span>${prog.discoveries.length} / ${discoveries}</span></div>
        <div class="mm-profile-row"><span>Distance driven</span><span>${(prog.distanceKm || 0).toFixed(1)} km</span></div>
      `;
      const drive = document.getElementById('btn-mm-drive');
      if (drive) drive.disabled = !this.worldReady;
      const driveSub = document.getElementById('btn-mm-drive-sub');
      if (driveSub) driveSub.textContent = prog.lastPosition ? `Continue in ${lastDistrict}` : `Free roam · ${lastDistrict}`;
    }

    flash(text) {
      const el = document.getElementById('mm-flash');
      if (!el) return;
      el.textContent = text;
      el.classList.remove('hidden');
      clearTimeout(this._flashT);
      this._flashT = setTimeout(() => el.classList.add('hidden'), 6000);
    }

    showCredits(v) {
      if (this.credits) this.credits.classList.toggle('hidden', !v);
    }

    confirmResetSave() {
      if (!window.SaveManager) return;
      const ok = window.confirm('Reset your FreeRacer profile? Credits, cars, upgrades, reputation and records will be erased.');
      if (!ok) return;
      window.SaveManager.resetProfile();
      this.refreshProfile();
      this.flash('Profile reset. Fresh start!');
    }

    // ── Actions ───────────────────────────────────────────────────────────
    startFreeRoam() {
      if (!this.worldReady) { this.flash('World is still building…'); return; }
      this.hideMenu();
      this.game.enterFreeRoam({ spawn: 'last' });
    }

    openGarage() {
      this.hideMenu();
      this.game.enterGarageFromMenu();
    }

    openCircuits() {
      this.hideMenu();
      const carId = window.SaveManager ? window.SaveManager.getSelectedCarId() : 'v01_kairo_pulse_s';
      if (this.game.openWorld) this.game.openWorld.detach();
      this.game.camera.far = 1200;
      this.game.camera.updateProjectionMatrix();
      this.game.openMapSelect(carId);
    }

    // ── Cinematic backdrop ────────────────────────────────────────────────
    update(dt) {
      if (!this.worldReady) return;
      this.orbitAngle += dt * 0.045;
      const r = 260;
      const cam = this.game.camera;
      const cx = Math.sin(this.orbitAngle) * r;
      const cz = Math.cos(this.orbitAngle) * r;
      const y = 95 + Math.sin(this.orbitAngle * 0.7) * 25;
      cam.position.set(cx, y, cz);
      this.orbitTarget.set(Math.sin(this.orbitAngle + 1.2) * 60, 24, Math.cos(this.orbitAngle + 1.2) * 60);
      cam.up.set(0, 1, 0);
      cam.lookAt(this.orbitTarget);
      if (Math.abs(cam.fov - 60) > 0.01) { cam.fov = 60; cam.updateProjectionMatrix(); }
      const ow = this.game.openWorld;
      if (ow && ow.traffic === null && ow.built && this.menuActive && !this.menuTraffic) {
        // light ambient traffic for the menu backdrop
        this.menuTraffic = new window.TrafficSystem(this.game.scene, ow.network, ow.world, 'light');
      }
      if (this.menuTraffic) {
        this.menuTraffic.update(dt, { position: this.orbitTarget, velocity: new THREE.Vector3(), speed: 0, yaw: 0, halfLength: 0 }, [], []);
      }
    }

    disposeMenuTraffic() {
      if (this.menuTraffic) { this.menuTraffic.dispose(); this.menuTraffic = null; }
    }
  }

  window.MainMenuManager = MainMenuManager;
})();
