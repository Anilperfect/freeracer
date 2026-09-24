/**
 * FreeRacer - Centralized Save & Progression Manager.
 * Persists credits, reputation, vehicle upgrades, cosmetics, event records,
 * discoveries, personal-best times and settings in localStorage.
 *
 * Schema is versioned (schemaVersion). Older "Turbo Rush" saves are migrated
 * automatically; unreadable saves are backed up and reset instead of crashing.
 */
(function() {
  const STORAGE_KEY = 'freeracer_save_v3';
  const LEGACY_KEYS = ['turbo_rush_save_v2'];
  const BACKUP_KEY = 'freeracer_save_corrupt_backup';
  const SCHEMA_VERSION = 3;

  const REP_LEVELS = [
    { rep: 0, title: 'Rookie' },
    { rep: 400, title: 'Street Regular' },
    { rep: 1000, title: 'Local Name' },
    { rep: 1800, title: 'Contender' },
    { rep: 2800, title: 'Crew Leader' },
    { rep: 4000, title: 'Neon Racer' },
    { rep: 5500, title: 'Apex Challenger' },
    { rep: 7500, title: 'District Champion' },
    { rep: 10000, title: 'Coast Legend' },
    { rep: 13000, title: 'FreeRacer' }
  ];

  const emptyUpgrades = () => ({ acceleration: 0, handling: 0, braking: 0, nitroCapacity: 0, nitroEfficiency: 0, tireGrip: 0, landingStability: 0 });

  const defaultProfile = {
    schemaVersion: SCHEMA_VERSION,
    userId: 'pilot_' + Math.random().toString(36).substring(2, 8),
    createdAt: Date.now(),
    selectedCarId: 'v01_kairo_pulse_s',
    unlockedCars: ['v01_kairo_pulse_s', 'veloce_v10_corsa'],
    unlockedTracks: ['emerald_highway', 'helios_rift', 'drowned_meridian', 'thornwild_crown'],
    tutorialCompleted: false,
    cash: 5000,
    totalEarnings: 0,
    totalSpent: 0,
    bestTimes: {
      emerald_highway: null,
      helios_rift: null,
      drowned_meridian: null,
      thornwild_crown: null
    },
    ghostLaps: {},
    upgrades: {
      v01_kairo_pulse_s: emptyUpgrades(),
      veloce_v10_corsa: emptyUpgrades(),
      veloce_v8_gt: emptyUpgrades(),
      veloce_v12_stradale: emptyUpgrades(),
      falcon_s1: emptyUpgrades(),
      vortex_r: emptyUpgrades(),
      titan_xr: emptyUpgrades(),
      phantom_gt: emptyUpgrades(),
      nova_x: emptyUpgrades()
    },
    cosmetics: {
      v01_kairo_pulse_s: { color: '#00d2be', finish: 'metallic', rimFinish: 'gloss_black', underglowColor: '#00f0ff', nitroFlameColor: '#00f0ff' },
      veloce_v10_corsa: { color: '#e61a2b', finish: 'metallic', rimFinish: 'silver_chrome', underglowColor: '#00f0ff', nitroFlameColor: '#00f0ff' },
      veloce_v8_gt: { color: '#1a56e6', finish: 'metallic', rimFinish: 'gloss_black', underglowColor: '#0088ff', nitroFlameColor: '#ff5500' },
      veloce_v12_stradale: { color: '#d4dae0', finish: 'chrome', rimFinish: 'forged_gold', underglowColor: '#ffaa00', nitroFlameColor: '#cc00ff' },
      falcon_s1: { color: '#e61a2b', finish: 'metallic', rimFinish: 'silver_chrome', underglowColor: '#00f0ff', nitroFlameColor: '#00f0ff' }
    },
    // Part-based upgrades & tuning (Phase 2) — carId → { engine: stage, … } / { brakeBias, … }
    parts: {},
    tuning: {},
    partsMigrated: false,
    // Open-world progression (FreeRacer)
    progress: {
      reputation: 0,
      eventRecords: {},      // eventId → { bestTime, bestPosition, medal, plays, wins }
      discoveries: [],       // discovery ids found in the world
      caches: [],            // neon cache (collectible) ids found in the world
      championship: {},      // champId → { points, positions: {eventId: pos}, completed }
      distanceKm: 0,
      driftPoints: 0,
      eventsPlayed: 0,
      eventsWon: 0,
      playtimeSec: 0,
      assistLevel: 'standard',
      lastDistrict: 'apex_downtown',
      lastPosition: null,    // { x, z, yaw }
      introSeen: false
    },
    settings: {
      cameraMode: 'CHASE',
      fov: 64,
      enableShake: true,
      graphicsPreset: 'HIGH', // LOW, MED, HIGH, ULTRA
      masterVol: 0.8,
      musicVol: 0.7,
      sfxVol: 0.85,
      voiceVol: 0.9,
      racingLine: true,
      racingLineOpacity: 0.7,
      trafficDensity: 'normal',
      minimapRotate: true,
      dayNightCycle: true,
      freeRoamWeather: true,
      keyBindings: null,     // filled by FreeRacerControls on first rebind
      accessibility: null,   // filled by Accessibility on first change
      mapFilters: { events: true, garage: true, discoveries: true, caches: true }
    }
  };

  const clone = (o) => JSON.parse(JSON.stringify(o));

  class SaveManager {
    constructor() {
      this.recoveredFromCorruption = false;
      this.migratedFromLegacy = false;
      this.profile = this.loadFromStorage();
      this.lastSaveTime = 0;
    }

    get storageKey() { return STORAGE_KEY; }
    get schemaVersion() { return SCHEMA_VERSION; }

    // ── Loading / validation ───────────────────────────────────────────────
    isValidProfile(p) {
      return !!p && typeof p === 'object' && !Array.isArray(p) && typeof p.cash === 'number' && !Number.isNaN(p.cash);
    }

    mergeWithDefaults(parsed) {
      const d = defaultProfile;
      const merged = {
        ...clone(d),
        ...parsed,
        schemaVersion: SCHEMA_VERSION,
        upgrades: { ...clone(d.upgrades), ...(parsed.upgrades || {}) },
        cosmetics: { ...clone(d.cosmetics), ...(parsed.cosmetics || {}) },
        bestTimes: { ...clone(d.bestTimes), ...(parsed.bestTimes || {}) },
        parts: { ...(parsed.parts || {}) },
        tuning: { ...(parsed.tuning || {}) },
        progress: { ...clone(d.progress), ...(parsed.progress || {}) },
        settings: { ...clone(d.settings), ...(parsed.settings || {}) }
      };
      if (!Array.isArray(merged.unlockedCars) || merged.unlockedCars.length === 0) merged.unlockedCars = clone(d.unlockedCars);
      if (!Array.isArray(merged.progress.discoveries)) merged.progress.discoveries = [];
      if (!merged.progress.eventRecords || typeof merged.progress.eventRecords !== 'object') merged.progress.eventRecords = {};
      if (typeof merged.progress.reputation !== 'number' || Number.isNaN(merged.progress.reputation)) merged.progress.reputation = 0;
      return merged;
    }

    loadFromStorage() {
      if (typeof localStorage === 'undefined') return clone(defaultProfile);
      let raw = null;
      let key = STORAGE_KEY;
      try {
        raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
          for (const legacy of LEGACY_KEYS) {
            const legacyRaw = localStorage.getItem(legacy);
            if (legacyRaw) { raw = legacyRaw; key = legacy; this.migratedFromLegacy = true; break; }
          }
        }
      } catch (e) {
        console.warn('[SaveManager] localStorage unavailable', e);
        return clone(defaultProfile);
      }
      if (!raw) return clone(defaultProfile);

      try {
        const parsed = JSON.parse(raw);
        if (!this.isValidProfile(parsed)) throw new Error('profile failed validation');
        const merged = this.mergeWithDefaults(parsed);
        if (key !== STORAGE_KEY) {
          // Persist migrated copy under the new key; keep the legacy copy untouched
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(merged)); } catch (e) { /* ignore */ }
          console.info('[SaveManager] Migrated legacy save from', key);
        }
        return merged;
      } catch (e) {
        console.warn('[SaveManager] Save data unreadable — backing up and resetting.', e);
        try { localStorage.setItem(BACKUP_KEY, raw); } catch (e2) { /* ignore */ }
        this.recoveredFromCorruption = true;
        return clone(defaultProfile);
      }
    }

    save() {
      this.profile.schemaVersion = SCHEMA_VERSION;
      this.profile.updatedAt = Date.now();
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.profile));
        this.lastSaveTime = Date.now();
      } catch (e) {
        console.warn('[SaveManager] Could not write profile to localStorage', e);
      }
      this.syncWithServer();
    }

    resetProfile() {
      this.profile = clone(defaultProfile);
      this.save();
    }

    exportJSON() { return JSON.stringify(this.profile, null, 2); }

    importJSON(text) {
      const parsed = JSON.parse(text);
      if (!this.isValidProfile(parsed)) throw new Error('Invalid FreeRacer save file');
      this.profile = this.mergeWithDefaults(parsed);
      this.save();
      return true;
    }

    getProfile() {
      return this.profile;
    }

    // ── Cars ──
    isCarUnlocked(carId) {
      if (!carId || carId === 'veloce_v10_corsa' || carId === 'falcon_s1') return true;
      if (!this.profile.unlockedCars) this.profile.unlockedCars = ['veloce_v10_corsa'];
      return this.profile.unlockedCars.includes(carId);
    }

    unlockCar(carId) {
      if (!this.profile.unlockedCars) this.profile.unlockedCars = ['veloce_v10_corsa'];
      if (!this.profile.unlockedCars.includes(carId)) {
        this.profile.unlockedCars.push(carId);
        this.save();
      }
      return true;
    }

    /**
     * Remove a car from the player's garage (Auto Exchange sale).
     * Permanently-granted starter cars cannot be removed.
     * @returns {boolean} true when the car was actually removed
     */
    removeCar(carId) {
      if (!carId || carId === 'veloce_v10_corsa' || carId === 'falcon_s1') return false;
      if (!this.profile.unlockedCars) return false;
      const i = this.profile.unlockedCars.indexOf(carId);
      if (i < 0) return false;
      this.profile.unlockedCars.splice(i, 1);
      this.save();
      return true;
    }

    getSelectedCarId() {
      const id = this.profile.selectedCarId;
      if (id && window.getCarById && window.getCarById(id) && this.isCarUnlocked(id)) return id;
      return 'v01_kairo_pulse_s';
    }

    setSelectedCarId(carId) {
      if (!carId) return;
      this.profile.selectedCarId = carId;
      this.save();
    }

    getUpgrades(carId) {
      return this.profile.upgrades[carId] || emptyUpgrades();
    }

    // ── Credits (₡) ──
    getCash() {
      return this.profile.cash || 0;
    }

    addCash(amount) {
      if (!(amount > 0)) return;
      this.profile.cash = (this.profile.cash || 0) + Math.round(amount);
      this.profile.totalEarnings = (this.profile.totalEarnings || 0) + Math.round(amount);
      this.save();
    }

    spendCash(amount, reason = '') {
      if (amount <= 0) return false;
      if ((this.profile.cash || 0) < amount) return false;
      this.profile.cash -= amount;
      this.profile.totalSpent = (this.profile.totalSpent || 0) + amount;
      this.save();
      return true;
    }

    // ── 10-Level Upgrade System with Credit Costs ──
    static UPGRADE_COSTS = [500, 750, 1000, 1500, 2000, 2500, 3000, 3750, 4500, 5000];

    getUpgradeCost(carId, statKey) {
      const upgrades = this.getUpgrades(carId);
      const currentLevel = upgrades[statKey] || 0;
      if (currentLevel >= 10) return null; // Max level
      return SaveManager.UPGRADE_COSTS[currentLevel] || 5000;
    }

    upgradeStat(carId, statKey) {
      if (!this.profile.upgrades[carId]) {
        this.profile.upgrades[carId] = { acceleration: 0, maxSpeed: 0, handling: 0, braking: 0, nitroCapacity: 0, nitroEfficiency: 0, antiGravityGrip: 0, landingStability: 0 };
      }
      const currentLevel = this.profile.upgrades[carId][statKey] || 0;
      if (currentLevel >= 10) return currentLevel; // Max level cap

      const cost = SaveManager.UPGRADE_COSTS[currentLevel] || 5000;
      if ((this.profile.cash || 0) < cost) return -1; // Insufficient funds

      this.profile.cash -= cost;
      this.profile.totalSpent = (this.profile.totalSpent || 0) + cost;
      this.profile.upgrades[carId][statKey] = currentLevel + 1;
      this.save();
      return this.profile.upgrades[carId][statKey];
    }

    setCosmetics(carId, cosmetics) {
      if (!this.profile.cosmetics[carId]) {
        this.profile.cosmetics[carId] = {};
      }
      this.profile.cosmetics[carId] = { ...this.profile.cosmetics[carId], ...cosmetics };
      this.save();
    }

    recordBestTime(trackId, timeMs, ghostSplits = null) {
      const currentBest = this.profile.bestTimes[trackId];
      let isNewRecord = false;
      if (!currentBest || timeMs < currentBest) {
        this.profile.bestTimes[trackId] = timeMs;
        if (ghostSplits) {
          this.profile.ghostLaps[trackId] = ghostSplits;
        }
        isNewRecord = true;
        this.save();
      }
      return isNewRecord;
    }

    calculatePR(carId) {
      if (window.UpgradeSystem) return window.UpgradeSystem.calculatePR(carId);
      const baseCar = window.getCarById(carId);
      if (!baseCar) return 500;
      const upgrades = this.getUpgrades(carId);

      let baseScore = (baseCar.stats.topSpeed * 1.5) +
                      (baseCar.stats.acceleration * 1.4) +
                      (baseCar.stats.handling * 1.2) +
                      (baseCar.stats.braking * 1.0) +
                      (baseCar.stats.grip * 1.1) +
                      (baseCar.stats.stability * 1.0);

      // Add upgrade levels (each level gives ~8 PR points, 10 levels per stat)
      let upgradeSum = 0;
      Object.values(upgrades).forEach(lvl => {
        upgradeSum += (lvl || 0) * 8;
      });

      return Math.round(baseScore * 0.75 + upgradeSum);
    }

    // ── Reputation & levels ───────────────────────────────────────────────
    getReputation() { return this.profile.progress.reputation || 0; }

    addReputation(amount) {
      if (!(amount > 0)) return this.getLevelInfo();
      const before = this.getLevelInfo().level;
      this.profile.progress.reputation = (this.profile.progress.reputation || 0) + Math.round(amount);
      this.save();
      const info = this.getLevelInfo();
      info.leveledUp = info.level > before;
      return info;
    }

    getLevelInfo() {
      const rep = this.getReputation();
      let idx = 0;
      for (let i = 0; i < REP_LEVELS.length; i++) if (rep >= REP_LEVELS[i].rep) idx = i;
      const cur = REP_LEVELS[idx];
      const next = REP_LEVELS[idx + 1] || null;
      const span = next ? next.rep - cur.rep : 1;
      return {
        level: idx + 1,
        title: cur.title,
        reputation: rep,
        current: rep - cur.rep,
        needed: next ? next.rep - cur.rep : 0,
        nextRep: next ? next.rep : null,
        progress: next ? Math.min(1, (rep - cur.rep) / span) : 1,
        isMax: !next
      };
    }

    static get REP_LEVELS() { return REP_LEVELS; }

    // ── Event records ─────────────────────────────────────────────────────
    getEventRecord(eventId) { return this.profile.progress.eventRecords[eventId] || null; }

    /**
     * @returns {{ newBest: boolean, firstClear: boolean, record: object }}
     */
    recordEventResult(eventId, result) {
      const recs = this.profile.progress.eventRecords;
      const prev = recs[eventId];
      const firstClear = !prev;
      const medalRank = { none: 0, bronze: 1, silver: 2, gold: 3 };
      const rec = prev ? { ...prev } : { bestTime: null, bestPosition: null, medal: 'none', plays: 0, wins: 0 };
      rec.plays += 1;
      if (result.position === 1) rec.wins += 1;
      let newBest = false;
      if (typeof result.time === 'number' && (rec.bestTime === null || result.time < rec.bestTime)) { rec.bestTime = result.time; newBest = true; }
      if (typeof result.position === 'number' && (rec.bestPosition === null || result.position < rec.bestPosition)) rec.bestPosition = result.position;
      if (result.medal && medalRank[result.medal] > medalRank[rec.medal || 'none']) rec.medal = result.medal;
      rec.lastPlayed = Date.now();
      recs[eventId] = rec;
      this.profile.progress.eventsPlayed = (this.profile.progress.eventsPlayed || 0) + 1;
      if (result.position === 1) this.profile.progress.eventsWon = (this.profile.progress.eventsWon || 0) + 1;
      this.save();
      return { newBest, firstClear, record: rec };
    }

    // ── Discoveries ───────────────────────────────────────────────────────
    hasDiscovery(id) { return this.profile.progress.discoveries.includes(id); }

    addDiscovery(id) {
      if (this.hasDiscovery(id)) return false;
      this.profile.progress.discoveries.push(id);
      this.save();
      return true;
    }

    // ── Neon caches (collectibles) ──────────────────────────────────────────
    hasCache(id) { return (this.profile.progress.caches || []).includes(id); }

    addCache(id) {
      if (!Array.isArray(this.profile.progress.caches)) this.profile.progress.caches = [];
      if (this.hasCache(id)) return false;
      this.profile.progress.caches.push(id);
      this.save();
      return true;
    }

    // ── Championships ─────────────────────────────────────────────────────
    getChampionship(champId) {
      if (!this.profile.progress.championship) this.profile.progress.championship = {};
      return this.profile.progress.championship[champId] || null;
    }

    /**
     * Record one championship round result.
     * @returns {{ points: number, completed: boolean, isChampion: boolean, entry: object }}
     */
    recordChampionshipResult(champDef, eventId, position) {
      if (!this.profile.progress.championship) this.profile.progress.championship = {};
      const table = champDef.points || [10, 7, 5, 3, 2, 1];
      const pts = table[Math.min(Math.max(1, position), table.length) - 1] || 0;
      let entry = this.profile.progress.championship[champDef.id];
      if (!entry) entry = this.profile.progress.championship[champDef.id] = { points: 0, positions: {}, completed: false };
      if (!entry.positions) entry.positions = {};
      // Re-running a round keeps the best position (points recomputed from bests)
      if (!entry.positions[eventId] || position < entry.positions[eventId]) entry.positions[eventId] = position;
      entry.points = Object.values(entry.positions).reduce((s, p) => s + (table[Math.min(Math.max(1, p), table.length) - 1] || 0), 0);
      const wasCompleted = !!entry.completed;
      entry.completed = champDef.events.every((e) => entry.positions[e] !== undefined);
      // Champion = completed with the maximum possible score (won every round)
      const maxScore = champDef.events.length * (table[0] || 10);
      const isChampion = entry.completed && entry.points >= maxScore;
      if (entry.completed && !wasCompleted) {
        // one-time completion bonus handled by the caller via champDef.championBonus
      }
      this.save();
      return { points: entry.points, completed: entry.completed, isChampion, entry, roundPoints: pts, firstCompletion: entry.completed && !wasCompleted };
    }

    // ── Misc progress ─────────────────────────────────────────────────────
    addStat(key, amount) {
      if (!(amount > 0)) return;
      this.profile.progress[key] = (this.profile.progress[key] || 0) + amount;
      // stats are flushed with the next explicit save() to avoid spamming storage
    }

    setLastPosition(district, x, z, yaw) {
      this.profile.progress.lastDistrict = district;
      this.profile.progress.lastPosition = { x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, yaw: Math.round(yaw * 1000) / 1000 };
    }

    getAssistLevel() { return this.profile.progress.assistLevel || 'standard'; }
    setAssistLevel(level) { this.profile.progress.assistLevel = level; this.save(); }

    getSetting(key, fallback) {
      const v = this.profile.settings ? this.profile.settings[key] : undefined;
      return v === undefined ? fallback : v;
    }

    setSetting(key, value) {
      if (!this.profile.settings) this.profile.settings = {};
      this.profile.settings[key] = value;
      this.save();
    }

    // Optional remote sync — only when a backend URL is explicitly configured.
    syncWithServer() {
      const url = window.FREERACER_API_URL;
      if (!url || typeof fetch === 'undefined') return;
      fetch(url + '/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: this.profile.userId, profile: this.profile })
      }).catch(() => { /* offline */ });
    }
  }

  window.SaveManager = new SaveManager();
})();
