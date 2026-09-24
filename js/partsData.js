/**
 * FreeRacer - Parts catalog & tuning definitions (data only)
 * ---------------------------------------------------------------------------
 * Eight part categories, five stages each. Every stage lists what it improves
 * AND what it costs you (trade-offs), expressed as multipliers on the vehicle
 * modifier vector consumed by UpgradeSystem.getModifiers():
 *
 *   power        engine output → acceleration
 *   topSpeed     speed limiter / gearing
 *   grip         tyre grip (all surfaces)
 *   brake        braking force
 *   handling     steering response + cornering stiffness
 *   stability    yaw damping / composure
 *   mass         vehicle mass (lower is better for accel/brake/handling)
 *   drag         aerodynamic drag (higher = lower top speed)
 *   driftability rear-grip release / ease of sliding
 *   rough        grip retained on sidewalks / dirt (lower = worse)
 *   nitroCapacity, nitroEfficiency, nitroPower
 *
 * Multipliers stack multiplicatively across stages (each stage's numbers are
 * relative to STOCK, not to the previous stage — installing Stage 3 replaces
 * Stage 2). No real-money purchases: everything is bought with in-game credits.
 */
(function () {
  const STAGE_BASE_COST = [1200, 2400, 4200, 6800, 10500];

  const PartsCatalog = {
    stageBaseCost: STAGE_BASE_COST,
    categories: [
      {
        id: 'engine', name: 'Engine', icon: '⚙', costWeight: 1.3,
        blurb: 'More power everywhere. Big turbos and forged internals add a little weight.',
        stages: [
          { name: 'ECU Remap', effects: { power: 1.05, topSpeed: 1.01 } },
          { name: 'Intake & Exhaust', effects: { power: 1.10, topSpeed: 1.02 } },
          { name: 'Hybrid Turbo', effects: { power: 1.16, topSpeed: 1.03, mass: 1.01 } },
          { name: 'Forged Bottom End', effects: { power: 1.23, topSpeed: 1.04, mass: 1.02 } },
          { name: 'Race Engine', effects: { power: 1.30, topSpeed: 1.05, mass: 1.03 } }
        ]
      },
      {
        id: 'drivetrain', name: 'Drivetrain', icon: '⛓', costWeight: 0.9,
        blurb: 'Less loss between engine and road, better traction out of corners.',
        stages: [
          { name: 'Sport Clutch', effects: { power: 1.02 } },
          { name: 'Short-Shift Kit', effects: { power: 1.04, handling: 1.01 } },
          { name: 'Limited-Slip Diff', effects: { power: 1.05, handling: 1.03, driftability: 1.05 } },
          { name: 'Carbon Driveshaft', effects: { power: 1.07, handling: 1.04, mass: 0.99 } },
          { name: 'Sequential Gearbox', effects: { power: 1.09, handling: 1.05, topSpeed: 1.01, mass: 0.99 } }
        ]
      },
      {
        id: 'tires', name: 'Tyres', icon: '◎', costWeight: 0.8,
        blurb: 'Stickier compounds grip harder but roll slower and resist sliding.',
        stages: [
          { name: 'Sport Compound', effects: { grip: 1.06, topSpeed: 0.995, driftability: 0.97 } },
          { name: 'Semi-Slicks', effects: { grip: 1.12, topSpeed: 0.99, driftability: 0.94 } },
          { name: 'Track Slicks', effects: { grip: 1.18, topSpeed: 0.985, driftability: 0.91, rough: 0.96 } },
          { name: 'Race Compound', effects: { grip: 1.24, topSpeed: 0.98, driftability: 0.88, rough: 0.93 } },
          { name: 'Adaptive Compound', effects: { grip: 1.30, topSpeed: 0.98, driftability: 0.86, rough: 0.96 } }
        ]
      },
      {
        id: 'brakes', name: 'Brakes', icon: '◉', costWeight: 0.7,
        blurb: 'Shorter stopping distances and steadier braking. Big discs add unsprung weight.',
        stages: [
          { name: 'Performance Pads', effects: { brake: 1.08, stability: 1.01 } },
          { name: 'Slotted Discs', effects: { brake: 1.16, stability: 1.02 } },
          { name: 'Big Brake Kit', effects: { brake: 1.24, stability: 1.03, mass: 1.01 } },
          { name: 'Carbon-Ceramic', effects: { brake: 1.32, stability: 1.04 } },
          { name: 'Race ABS Module', effects: { brake: 1.40, stability: 1.05 } }
        ]
      },
      {
        id: 'suspension', name: 'Suspension', icon: '⇅', costWeight: 0.9,
        blurb: 'Sharper turn-in and less body roll — stiffer setups hate kerbs and dirt.',
        stages: [
          { name: 'Lowering Springs', effects: { handling: 1.06, stability: 1.02, rough: 0.98 } },
          { name: 'Sport Dampers', effects: { handling: 1.12, stability: 1.04, rough: 0.96 } },
          { name: 'Coilovers', effects: { handling: 1.18, stability: 1.05, rough: 0.93 } },
          { name: 'Anti-Roll Kit', effects: { handling: 1.24, stability: 1.07, rough: 0.90 } },
          { name: 'Race Suspension', effects: { handling: 1.30, stability: 1.08, rough: 0.88 } }
        ]
      },
      {
        id: 'aero', name: 'Aero', icon: '▲', costWeight: 0.8,
        blurb: 'Downforce plants the car at speed — at the price of drag and top speed.',
        stages: [
          { name: 'Front Splitter', effects: { grip: 1.03, stability: 1.03, drag: 1.02 } },
          { name: 'Rear Spoiler', effects: { grip: 1.06, stability: 1.06, drag: 1.04 } },
          { name: 'Flat Underbody', effects: { grip: 1.09, stability: 1.08, drag: 1.05 } },
          { name: 'GT Wing', effects: { grip: 1.12, stability: 1.10, drag: 1.08 } },
          { name: 'Active Aero Kit', effects: { grip: 1.15, stability: 1.12, drag: 1.09 } }
        ]
      },
      {
        id: 'weight', name: 'Weight Reduction', icon: '▽', costWeight: 1.0,
        blurb: 'Lighter is faster in every direction — but a stripped car is twitchier.',
        stages: [
          { name: 'Lightweight Wheels', effects: { mass: 0.97, stability: 0.99 } },
          { name: 'Carbon Panels', effects: { mass: 0.94, stability: 0.98 } },
          { name: 'Interior Delete', effects: { mass: 0.91, stability: 0.96 } },
          { name: 'Polycarbonate Glass', effects: { mass: 0.88, stability: 0.94 } },
          { name: 'Carbon Tub', effects: { mass: 0.85, stability: 0.92 } }
        ]
      },
      {
        id: 'nitro', name: 'Nitro', icon: '⚡', costWeight: 0.9,
        blurb: 'Bigger tanks, cleaner burn, harder hit.',
        stages: [
          { name: 'Wet Kit', effects: { nitroCapacity: 1.10, nitroEfficiency: 1.05 } },
          { name: 'Twin Bottles', effects: { nitroCapacity: 1.20, nitroEfficiency: 1.10, nitroPower: 1.02 } },
          { name: 'Direct Port', effects: { nitroCapacity: 1.30, nitroEfficiency: 1.15, nitroPower: 1.04 } },
          { name: 'Progressive Controller', effects: { nitroCapacity: 1.40, nitroEfficiency: 1.20, nitroPower: 1.07 } },
          { name: 'Overdrive Cell', effects: { nitroCapacity: 1.50, nitroEfficiency: 1.25, nitroPower: 1.10 } }
        ]
      }
    ]
  };

  /** Tuning sliders: value range −1…1 (0 = stock) except where noted. */
  const TuningSliders = [
    { id: 'brakeBias', name: 'Brake Bias', min: -1, max: 1, def: 0, left: 'Rear', right: 'Front',
      hint: 'Rear bias rotates the car under braking (drift-friendly, less stable). Front bias is calmer but stops a touch longer.' },
    { id: 'downforce', name: 'Downforce', min: -1, max: 1, def: 0, left: 'Low', right: 'High',
      hint: 'More wing = more grip and stability, less top speed.' },
    { id: 'finalDrive', name: 'Final Drive', min: -1, max: 1, def: 0, left: 'Long', right: 'Short',
      hint: 'Short gearing accelerates harder; long gearing raises top speed.' },
    { id: 'steering', name: 'Steering', min: -1, max: 1, def: 0, left: 'Stable', right: 'Agile',
      hint: 'Agile steering turns in faster but is easier to over-rotate.' },
    { id: 'rideHeight', name: 'Ride Height', min: -1, max: 1, def: 0, left: 'Low', right: 'High',
      hint: 'Low = sharper on asphalt. High = keeps grip on kerbs, boardwalk and dirt.' }
  ];

  const TuningPresets = [
    { id: 'balanced', name: 'Balanced', values: { brakeBias: 0, downforce: 0, finalDrive: 0, steering: 0, rideHeight: 0 } },
    { id: 'grip', name: 'Grip', values: { brakeBias: 0.2, downforce: 0.8, finalDrive: 0.1, steering: -0.2, rideHeight: -0.4 } },
    { id: 'drift', name: 'Drift', values: { brakeBias: -0.6, downforce: -0.4, finalDrive: 0.5, steering: 0.6, rideHeight: 0 } },
    { id: 'sprint', name: 'Sprint', values: { brakeBias: 0.1, downforce: -0.6, finalDrive: -0.7, steering: -0.1, rideHeight: -0.2 } },
    { id: 'offroad', name: 'Off-Road', values: { brakeBias: 0.3, downforce: -0.2, finalDrive: 0.3, steering: -0.3, rideHeight: 0.9 } }
  ];

  window.PartsCatalog = PartsCatalog;
  window.TuningSliders = TuningSliders;
  window.TuningPresets = TuningPresets;
})();
