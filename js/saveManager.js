/**
 * Turbo Rush - Centralized Save & Progression Manager.
 * Persists vehicle upgrades, cosmetic choices, unlocked tracks,
 * personal-best times, control preferences, and audio/graphics settings.
 * Synchronizes with local storage and backend API (/api/profile).
 */
(function() {
  const STORAGE_KEY = 'turbo_rush_save_v2';

  const defaultProfile = {
    userId: 'pilot_' + Math.random().toString(36).substring(2, 8),
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
      v01_kairo_pulse_s: { acceleration: 0, handling: 0, braking: 0, nitroCapacity: 0, nitroEfficiency: 0, tireGrip: 0, landingStability: 0 },
      veloce_v10_corsa: { acceleration: 0, handling: 0, braking: 0, nitroCapacity: 0, nitroEfficiency: 0, tireGrip: 0, landingStability: 0 },
      veloce_v8_gt: { acceleration: 0, handling: 0, braking: 0, nitroCapacity: 0, nitroEfficiency: 0, tireGrip: 0, landingStability: 0 },
      veloce_v12_stradale: { acceleration: 0, handling: 0, braking: 0, nitroCapacity: 0, nitroEfficiency: 0, tireGrip: 0, landingStability: 0 },
      falcon_s1: { acceleration: 0, handling: 0, braking: 0, nitroCapacity: 0, nitroEfficiency: 0, tireGrip: 0, landingStability: 0 },
      vortex_r: { acceleration: 0, handling: 0, braking: 0, nitroCapacity: 0, nitroEfficiency: 0, tireGrip: 0, landingStability: 0 },
      titan_xr: { acceleration: 0, handling: 0, braking: 0, nitroCapacity: 0, nitroEfficiency: 0, tireGrip: 0, landingStability: 0 },
      phantom_gt: { acceleration: 0, handling: 0, braking: 0, nitroCapacity: 0, nitroEfficiency: 0, tireGrip: 0, landingStability: 0 },
      nova_x: { acceleration: 0, handling: 0, braking: 0, nitroCapacity: 0, nitroEfficiency: 0, tireGrip: 0, landingStability: 0 }
    },
    cosmetics: {
      v01_kairo_pulse_s: { color: '#00d2be', finish: 'metallic', rimFinish: 'gloss_black', underglowColor: '#00f0ff', nitroFlameColor: '#00f0ff' },
      veloce_v10_corsa: { color: '#e61a2b', finish: 'metallic', rimFinish: 'silver_chrome', underglowColor: '#00f0ff', nitroFlameColor: '#00f0ff' },
      veloce_v8_gt: { color: '#1a56e6', finish: 'metallic', rimFinish: 'gloss_black', underglowColor: '#0088ff', nitroFlameColor: '#ff5500' },
      veloce_v12_stradale: { color: '#d4dae0', finish: 'chrome', rimFinish: 'forged_gold', underglowColor: '#ffaa00', nitroFlameColor: '#cc00ff' },
      falcon_s1: { color: '#e61a2b', finish: 'metallic', rimFinish: 'silver_chrome', underglowColor: '#00f0ff', nitroFlameColor: '#00f0ff' }
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
      racingLineOpacity: 0.7
    }
  };

  class SaveManager {
    constructor() {
      this.profile = this.loadFromStorage();
      this.syncWithServer();
    }

    loadFromStorage() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          // Deep merge with defaults
          return {
            ...defaultProfile,
            ...parsed,
            upgrades: { ...defaultProfile.upgrades, ...(parsed.upgrades || {}) },
            cosmetics: { ...defaultProfile.cosmetics, ...(parsed.cosmetics || {}) },
            settings: { ...defaultProfile.settings, ...(parsed.settings || {}) }
          };
        }
      } catch (e) {
        console.warn('Could not read saved profile from localStorage', e);
      }
      return JSON.parse(JSON.stringify(defaultProfile));
    }

    save() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.profile));
      } catch (e) {
        console.warn('Could not write profile to localStorage', e);
      }
      this.syncWithServer();
    }

    getProfile() {
      return this.profile;
    }

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

    getUpgrades(carId) {
      return this.profile.upgrades[carId] || { acceleration: 0, handling: 0, braking: 0, nitroCapacity: 0, nitroEfficiency: 0, tireGrip: 0, landingStability: 0 };
    }

    // ── Cash Economy ──
    getCash() {
      return this.profile.cash || 0;
    }

    addCash(amount) {
      if (amount <= 0) return;
      this.profile.cash = (this.profile.cash || 0) + amount;
      this.profile.totalEarnings = (this.profile.totalEarnings || 0) + amount;
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

    // ── 10-Level Upgrade System with Cash Costs ──
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

    syncWithServer() {
      if (typeof fetch === 'undefined') return;
      fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: this.profile.userId,
          updates: {
            upgrades: this.profile.upgrades,
            cosmetics: this.profile.cosmetics,
            bestTimes: this.profile.bestTimes,
            selectedCarId: this.profile.selectedCarId
          }
        })
      }).catch(err => {
        // Offline or local server without backend API running
      });
    }
  }

  window.SaveManager = new SaveManager();
})();
