/**
 * FreeRacer - UpgradeSystem
 * ---------------------------------------------------------------------------
 * Part-based upgrades (8 categories × 5 stages, with trade-offs) + per-car
 * tuning sliders. Produces one modifier vector that both vehicle controllers
 * (circuit `ArcadeCarPhysics` and open-world `FreeVehiclePhysics`) apply via
 * `applyModifiers()`, and the 0–100 display stats / PR shown in the garage.
 *
 * Persistence: SaveManager profile.parts[carId] = { engine: 0..5, … }
 *              SaveManager profile.tuning[carId] = { brakeBias: -1..1, … }
 * Legacy 7-stat levels (profile.upgrades) are migrated once into stages.
 */
(function () {
  const IDENTITY = () => ({
    power: 1, topSpeed: 1, grip: 1, brake: 1, handling: 1, stability: 1,
    mass: 1, drag: 1, driftability: 1, rough: 1,
    nitroCapacity: 1, nitroEfficiency: 1, nitroPower: 1
  });

  class UpgradeSystem {
    constructor() {
      this.catalog = window.PartsCatalog;
      this.sliders = window.TuningSliders;
      this.presets = window.TuningPresets;
    }

    get save() { return window.SaveManager; }

    // ── Storage helpers ───────────────────────────────────────────────────
    ensureProfile() {
      const p = this.save && this.save.getProfile();
      if (!p) return null;
      if (!p.parts || typeof p.parts !== 'object') p.parts = {};
      if (!p.tuning || typeof p.tuning !== 'object') p.tuning = {};
      if (!p.partsMigrated) { this.migrateLegacy(p); p.partsMigrated = true; this.save.save(); }
      return p;
    }

    /** One-time migration: old 0–10 stat levels → part stages (0–5). */
    migrateLegacy(profile) {
      const map = { acceleration: 'engine', handling: 'suspension', braking: 'brakes', tireGrip: 'tires', antiGravityGrip: 'tires', landingStability: 'aero', nitroCapacity: 'nitro', nitroEfficiency: 'nitro', maxSpeed: 'drivetrain' };
      Object.keys(profile.upgrades || {}).forEach((carId) => {
        const levels = profile.upgrades[carId] || {};
        const parts = profile.parts[carId] || {};
        Object.keys(levels).forEach((stat) => {
          const cat = map[stat];
          if (!cat) return;
          const stage = Math.min(5, Math.round((levels[stat] || 0) / 2));
          if (stage > (parts[cat] || 0)) parts[cat] = stage;
        });
        if (Object.keys(parts).length) profile.parts[carId] = parts;
      });
    }

    getParts(carId) {
      const p = this.ensureProfile();
      const parts = (p && p.parts[carId]) || {};
      const out = {};
      this.catalog.categories.forEach((c) => { out[c.id] = Math.max(0, Math.min(5, parts[c.id] || 0)); });
      return out;
    }

    getTuning(carId) {
      const p = this.ensureProfile();
      const t = (p && p.tuning[carId]) || {};
      const out = {};
      this.sliders.forEach((s) => { const v = typeof t[s.id] === 'number' ? t[s.id] : s.def; out[s.id] = Math.max(s.min, Math.min(s.max, v)); });
      return out;
    }

    setTuning(carId, values, persist = true) {
      const p = this.ensureProfile();
      if (!p) return;
      p.tuning[carId] = { ...this.getTuning(carId), ...values };
      if (persist) this.save.save();
    }

    applyPreset(carId, presetId) {
      const preset = this.presets.find((x) => x.id === presetId);
      if (!preset) return false;
      this.setTuning(carId, { ...preset.values });
      return true;
    }

    activePresetId(carId) {
      const t = this.getTuning(carId);
      const hit = this.presets.find((pr) => this.sliders.every((s) => Math.abs((pr.values[s.id] || 0) - t[s.id]) < 0.01));
      return hit ? hit.id : null;
    }

    // ── Costs & purchasing ────────────────────────────────────────────────
    static tierFactor(car) {
      const price = car ? (car.price || 0) : 0;
      if (price <= 0) return 0.6;
      if (price < 20000) return 0.8;
      if (price < 40000) return 1.0;
      return 1.3;
    }

    getCategory(catId) { return this.catalog.categories.find((c) => c.id === catId); }

    /** Cost of the NEXT stage for a category (null when maxed). */
    getNextStageCost(carId, catId) {
      const cat = this.getCategory(catId);
      const stage = this.getParts(carId)[catId];
      if (!cat || stage >= cat.stages.length) return null;
      const car = window.getCarById ? window.getCarById(carId) : null;
      return Math.round(this.catalog.stageBaseCost[stage] * cat.costWeight * UpgradeSystem.tierFactor(car) / 10) * 10;
    }

    getNextStage(carId, catId) {
      const cat = this.getCategory(catId);
      const stage = this.getParts(carId)[catId];
      if (!cat || stage >= cat.stages.length) return null;
      return { index: stage + 1, ...cat.stages[stage] };
    }

    /** @returns {'ok'|'maxed'|'no_cash'|'error'} */
    install(carId, catId) {
      const p = this.ensureProfile();
      const cost = this.getNextStageCost(carId, catId);
      if (!p) return 'error';
      if (cost === null) return 'maxed';
      if (!this.save.spendCash(cost, `${catId} stage for ${carId}`)) return 'no_cash';
      if (!p.parts[carId]) p.parts[carId] = {};
      p.parts[carId][catId] = (p.parts[carId][catId] || 0) + 1;
      this.save.save();
      return 'ok';
    }

    totalInvested(carId) {
      const parts = this.getParts(carId);
      const car = window.getCarById ? window.getCarById(carId) : null;
      let sum = 0;
      this.catalog.categories.forEach((c) => {
        for (let s = 0; s < parts[c.id]; s++) sum += Math.round(this.catalog.stageBaseCost[s] * c.costWeight * UpgradeSystem.tierFactor(car) / 10) * 10;
      });
      return sum;
    }

    // ── Modifier vector ───────────────────────────────────────────────────
    /**
     * @param {string} carId
     * @param {object} [opts] { previewCategory: 'engine' } → include the next stage of that category
     *                        { tuning: {...} } → override tuning values (live slider preview)
     */
    getModifiers(carId, opts = {}) {
      const mods = IDENTITY();
      const parts = this.getParts(carId);
      this.catalog.categories.forEach((c) => {
        let stage = parts[c.id];
        if (opts.previewCategory === c.id && stage < c.stages.length) stage += 1;
        if (stage <= 0) return;
        const eff = c.stages[stage - 1].effects;
        Object.keys(eff).forEach((k) => { if (mods[k] !== undefined) mods[k] *= eff[k]; });
      });
      const t = { ...this.getTuning(carId), ...(opts.tuning || {}) };
      UpgradeSystem.applyTuningToModifiers(mods, t);
      return mods;
    }

    static applyTuningToModifiers(m, t) {
      // brake bias: rear (−) → shorter stops but less composure; front (+) → calmer, slightly longer
      const bb = t.brakeBias || 0;
      m.brake *= 1 + (bb < 0 ? -bb * 0.03 : -bb * 0.04);
      m.stability *= 1 + bb * 0.08;
      m.driftability *= 1 - bb * 0.10;
      // downforce
      const df = t.downforce || 0;
      m.grip *= 1 + df * 0.06;
      m.stability *= 1 + df * 0.06;
      m.drag *= 1 + df * 0.08;
      // final drive: short (+) → power up, top speed down
      const fd = t.finalDrive || 0;
      m.power *= 1 + fd * 0.09;
      m.topSpeed *= 1 - fd * 0.07;
      // steering agility vs stability
      const st = t.steering || 0;
      m.handling *= 1 + st * 0.10;
      m.stability *= 1 - st * 0.09;
      m.driftability *= 1 + st * 0.06;
      // ride height: low (−) sharper on asphalt, high (+) keeps grip off the tarmac
      const rh = t.rideHeight || 0;
      m.handling *= 1 - rh * 0.05;
      m.grip *= 1 - Math.max(0, rh) * 0.02;
      m.rough *= 1 + rh * 0.18;
      m.stability *= 1 + Math.max(0, rh) * 0.02;
      return m;
    }

    // ── Display stats (0–100) & PR ────────────────────────────────────────
    static statsFromModifiers(base, m) {
      const clamp = (v) => Math.max(1, Math.min(100, Math.round(v)));
      return {
        topSpeed: clamp(base.topSpeed * m.topSpeed / Math.pow(m.drag, 0.33)),
        acceleration: clamp(base.acceleration * m.power / m.mass),
        handling: clamp(base.handling * m.handling / Math.pow(m.mass, 0.3)),
        braking: clamp(base.braking * m.brake / Math.pow(m.mass, 0.5)),
        grip: clamp(base.grip * m.grip),
        stability: clamp(base.stability * m.stability)
      };
    }

    getBaseStats(carId) {
      const car = window.getCarById ? window.getCarById(carId) : null;
      const s = (car && car.stats) || {};
      return { topSpeed: s.topSpeed || 60, acceleration: s.acceleration || 60, handling: s.handling || 60, braking: s.braking || 60, grip: s.grip || 60, stability: s.stability || 60 };
    }

    getDisplayStats(carId, opts = {}) {
      return UpgradeSystem.statsFromModifiers(this.getBaseStats(carId), this.getModifiers(carId, opts));
    }

    calculatePR(carId, opts = {}) {
      const s = this.getDisplayStats(carId, opts);
      return Math.round((s.topSpeed * 1.5 + s.acceleration * 1.4 + s.handling * 1.2 + s.braking * 1.0 + s.grip * 1.1 + s.stability * 1.0) * 0.75
        + this.stageCount(carId) * 12);
    }

    stageCount(carId) {
      const parts = this.getParts(carId);
      return Object.values(parts).reduce((a, b) => a + b, 0);
    }

    /** Human-readable effect summary for a stage: [{label, value:'+12%', good:true}] */
    static describeEffects(effects) {
      const labels = { power: 'Power', topSpeed: 'Top speed', grip: 'Grip', brake: 'Braking', handling: 'Handling', stability: 'Stability', mass: 'Weight', drag: 'Drag', driftability: 'Slide', rough: 'Kerb/dirt grip', nitroCapacity: 'Nitro tank', nitroEfficiency: 'Nitro burn', nitroPower: 'Nitro punch' };
      const lowerIsBetter = { mass: true, drag: true };
      return Object.keys(effects).map((k) => {
        const pct = Math.round((effects[k] - 1) * 100);
        const good = lowerIsBetter[k] ? pct < 0 : pct > 0;
        return { key: k, label: labels[k] || k, value: `${pct > 0 ? '+' : ''}${pct}%`, good };
      });
    }
  }

  window.UpgradeSystem = new UpgradeSystem();
})();
