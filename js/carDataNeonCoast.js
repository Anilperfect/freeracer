/**
 * FreeRacer - Neon Coast roster expansion (Phase 2)
 * ---------------------------------------------------------------------------
 * Adds five fictional cars from Neon Coast manufacturers to window.CarDatabase.
 * Each entry names a `bodyStyle` ('hatch' | 'track' | 'gt' | 'hyper') that
 * CarModel maps to one of its procedural exterior builders, and inherits the
 * wheel/anchor layout of a template car so lights, exhausts and cameras line up.
 */
(function () {
  const db = window.CarDatabase;
  if (!db) return;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const template = (id) => db.find((c) => c.id === id);

  const cars = [
    {
      template: 'v01_kairo_pulse_s', bodyStyle: 'hatch',
      id: 'radian_sprint_4', name: 'Radian Sprint 4', manufacturer: 'Radian Motors', manufacturerId: 'radian',
      carClass: 'Rally Hatch', archetype: 'rally',
      description: 'Radian\'s all-wheel-drive rally hatch. Unflappable on kerbs, boardwalk and dirt, and it launches like a slingshot.',
      colorHex: 0xff7a1a, price: 9000, tier: 2, accentColor: 0xffffff, spokeCount: 6,
      engine: { type: '2.3L Turbocharged Inline-4', displacement: '2.3L', redline: 7000, transmission: '6-Speed Sequential', gearCount: 6, audioProfile: 'i4_turbo', exhaustLayout: 'dual_split', peakPowerKw: 265, peakTorqueNm: 450, drivetrain: 'AWD' },
      dimensions: { length: 4.25, width: 1.84, height: 1.46, wheelbase: 2.64, groundClearance: 0.165, curbWeightKg: 1420 },
      stats: { topSpeed: 68, acceleration: 82, handling: 82, braking: 80, grip: 84, stability: 91 },
      physics: { maxSpeed: 66.7, acceleration: 24.5, brakeDecel: 38.5, maxSteerAngle: 0.60, highSpeedSteer: 0.14, driftMultiplier: 1.0, nitroCapacity: 90.0, lateralAgility: 22.5, cdA: 0.70, clA: -0.10, downforceCoeff: 0.0025 }
    },
    {
      template: 'veloce_v8_gt', bodyStyle: 'gt',
      id: 'veyra_corsair', name: 'Veyra Corsair', manufacturer: 'Veyra Automotive', manufacturerId: 'veyra',
      carClass: 'Drift Coupe', archetype: 'drift',
      description: 'A rear-drive coupe built to live sideways. Long wheelbase, quick rack, and a rear end that steps out on request.',
      colorHex: 0xb02aff, price: 12000, tier: 2, accentColor: 0xff3cac, spokeCount: 5,
      engine: { type: '3.0L Twin-Turbo Inline-6', displacement: '3.0L', redline: 7400, transmission: '6-Speed Manual', gearCount: 6, audioProfile: 'v8_turbo', exhaustLayout: 'dual_center', peakPowerKw: 300, peakTorqueNm: 520, drivetrain: 'RWD' },
      dimensions: { length: 4.62, width: 1.88, height: 1.30, wheelbase: 2.72, groundClearance: 0.115, curbWeightKg: 1440 },
      stats: { topSpeed: 78, acceleration: 84, handling: 80, braking: 78, grip: 72, stability: 70 },
      physics: { maxSpeed: 75.0, acceleration: 30.0, brakeDecel: 38.0, maxSteerAngle: 0.60, highSpeedSteer: 0.12, driftMultiplier: 1.45, nitroCapacity: 95.0, lateralAgility: 24.0, cdA: 0.66, clA: 0.6, downforceCoeff: 0.0030 }
    },
    {
      template: 'veloce_v8_gt', bodyStyle: 'gt',
      id: 'monarch_sovereign', name: 'Monarch Sovereign GT', manufacturer: 'Monarch Motorworks', manufacturerId: 'monarch',
      carClass: 'Muscle GT', archetype: 'muscle',
      description: 'Old-school muscle with a modern chassis: a thunderous 6.4L V8, huge straight-line pace, and a nose that needs persuading into corners.',
      colorHex: 0x8b0f1f, price: 22000, tier: 3, accentColor: 0xffc93c, spokeCount: 8,
      engine: { type: '6.4L Supercharged V8', displacement: '6.4L', redline: 7000, transmission: '8-Speed Automatic', gearCount: 8, audioProfile: 'v8_turbo', exhaustLayout: 'quad_outer', peakPowerKw: 480, peakTorqueNm: 780, drivetrain: 'RWD' },
      dimensions: { length: 4.95, width: 1.98, height: 1.36, wheelbase: 2.95, groundClearance: 0.120, curbWeightKg: 1780 },
      stats: { topSpeed: 92, acceleration: 90, handling: 70, braking: 80, grip: 78, stability: 84 },
      physics: { maxSpeed: 91.7, acceleration: 36.0, brakeDecel: 41.0, maxSteerAngle: 0.52, highSpeedSteer: 0.10, driftMultiplier: 1.25, nitroCapacity: 110.0, lateralAgility: 20.0, cdA: 0.72, clA: 1.2, downforceCoeff: 0.0032 }
    },
    {
      template: 'veloce_v10_corsa', bodyStyle: 'track',
      id: 'voltrix_ion', name: 'Voltrix Ion', manufacturer: 'Voltrix Dynamics', manufacturerId: 'voltrix',
      carClass: 'Electric Sport', archetype: 'electric',
      description: 'Silent, savage torque from twin motors. The heaviest car in the garage — and the quickest off the line.',
      colorHex: 0x2af5c8, price: 28000, tier: 3, accentColor: 0x2af5c8, spokeCount: 10,
      engine: { type: 'Dual Permanent-Magnet Motors', displacement: '—', redline: 16000, transmission: 'Single-Speed', gearCount: 2, audioProfile: 'v6_hybrid', exhaustLayout: 'none', peakPowerKw: 560, peakTorqueNm: 1000, drivetrain: 'AWD' },
      dimensions: { length: 4.70, width: 1.96, height: 1.40, wheelbase: 2.90, groundClearance: 0.130, curbWeightKg: 2050 },
      stats: { topSpeed: 82, acceleration: 96, handling: 84, braking: 86, grip: 86, stability: 90 },
      physics: { maxSpeed: 80.6, acceleration: 38.0, brakeDecel: 44.0, maxSteerAngle: 0.55, highSpeedSteer: 0.12, driftMultiplier: 0.95, nitroCapacity: 100.0, lateralAgility: 23.0, cdA: 0.62, clA: 0.4, downforceCoeff: 0.0030 }
    },
    {
      template: 'veloce_v12_stradale', bodyStyle: 'hyper',
      id: 'apexforge_halo', name: 'Apex Forge Halo', manufacturer: 'Apex Forge', manufacturerId: 'apexforge',
      carClass: 'Hypercar', archetype: 'hyper',
      description: 'Apex Forge\'s flagship: a 9,200 rpm V12 hybrid, all-wheel drive and active aero. The car every crew on the coast wants to beat.',
      colorHex: 0xe8f4ff, price: 80000, tier: 5, accentColor: 0x00f0ff, spokeCount: 7,
      engine: { type: '4.0L V12 Hybrid', displacement: '4.0L', redline: 9200, transmission: '7-Speed Dual-Clutch', gearCount: 7, audioProfile: 'v12_na', exhaustLayout: 'quad_center', peakPowerKw: 800, peakTorqueNm: 900, drivetrain: 'AWD' },
      dimensions: { length: 4.72, width: 2.04, height: 1.14, wheelbase: 2.78, groundClearance: 0.100, curbWeightKg: 1520 },
      stats: { topSpeed: 98, acceleration: 97, handling: 90, braking: 94, grip: 92, stability: 88 },
      physics: { maxSpeed: 100.0, acceleration: 40.0, brakeDecel: 46.0, maxSteerAngle: 0.50, highSpeedSteer: 0.10, driftMultiplier: 1.05, nitroCapacity: 125.0, lateralAgility: 24.5, cdA: 0.70, clA: 2.0, downforceCoeff: 0.0055 }
    }
  ];

  cars.forEach((def) => {
    if (db.find((c) => c.id === def.id)) return;
    const base = template(def.template) || db[0];
    const car = {
      ...def,
      isDefault: false,
      wheels: clone(base.wheels),
      bodyConfig: clone(base.bodyConfig),
      anchors: clone(base.anchors)
    };
    delete car.template;
    // scale template anchors to the new body length so lights/exhausts sit on the bumpers
    const scaleZ = car.dimensions.length / base.dimensions.length;
    ['exhausts', 'headlights', 'brakeLights'].forEach((k) => {
      (car.anchors[k] || []).forEach((a) => { a.z *= scaleZ; });
    });
    db.push(car);
  });

  // Body-style lookup for cars that predate the field
  const LEGACY_STYLE = { v01_kairo_pulse_s: 'hatch', veloce_v10_corsa: 'track', veloce_v8_gt: 'gt', veloce_v12_stradale: 'hyper' };
  db.forEach((c) => { if (!c.bodyStyle && LEGACY_STYLE[c.id]) c.bodyStyle = LEGACY_STYLE[c.id]; });
})();
