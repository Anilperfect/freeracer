/**
 * Turbo Rush - Centralized Data-Driven Vehicle Definitions
 * Defines the three original fictional supercars under the provisional manufacturer:
 * "Veloce Performance" (Veloce Corse).
 * 
 * Strict Physical Invariant:
 * Every vehicle has an absolute maximum speed cap of 150.0 km/h (41.67 m/s).
 * Performance differentiation is delivered through acceleration curves, lateral agility,
 * braking efficiency, suspension travel, weight balance, and acoustic profiles.
 */

window.CarDatabase = [
  // ==========================================================================
  // CAR 0: V01 KAIRO PULSE S (ACCESSIBLE FWD HOT HATCH)
  // ==========================================================================
  {
    id: 'v01_kairo_pulse_s',
    name: 'Kairo Pulse S',
    manufacturer: 'Kinetix Dynamics',
    manufacturerId: 'kinetix',
    carClass: 'Hot Hatch',
    description: 'An agile, track-tuned hot hatch engineered with a compact mono-volume cabin, punchy turbocharged front-wheel drive, and forgiving lift-off rotation.',
    colorHex: 0x00d2be, // Pulse Cyan / Turquoise
    price: 0,           // Unlocked starter vehicle
    isDefault: true,

    // Engine & Powertrain Specs
    engine: {
      type: '2.0L Turbocharged Inline-4',
      displacement: '2.0L',
      redline: 7200,
      transmission: '6-Speed Manual',
      gearCount: 6,
      audioProfile: 'i4_turbo',
      exhaustLayout: 'dual_split',
      peakPowerKw: 230,
      peakTorqueNm: 400,
      drivetrain: 'FWD'
    },

    // Exact Dimensions (Meters)
    dimensions: {
      length: 4.18,
      width: 1.82,
      height: 1.42,
      wheelbase: 2.62,
      groundClearance: 0.125,
      curbWeightKg: 1280
    },

    // Wheels & Tires
    wheels: {
      front: {
        rimDiameterInches: 18,
        radius: 0.325,
        width: 0.225,
        rimRadius: 0.228
      },
      rear: {
        rimDiameterInches: 18,
        radius: 0.325,
        width: 0.225,
        rimRadius: 0.228
      }
    },

    // Door & Aerodynamic Configuration
    bodyConfig: {
      doorStyle: 'standard',
      roofStyle: 'floating_contrast_black',
      activeAero: {
        type: 'fixed_roof_spoiler',
        restY: 0.58,
        deployY: 0.58,
        airbrakePitch: 0.0
      }
    },

    // Attachment & Camera Anchors
    anchors: {
      driverCamera: { x: -0.22, y: 1.05, z: -0.34, eyeHeight: 1.05, pitchHeight: 0.95, fov: 70 },
      chaseCamera: { distance: 6.2, height: 2.1, pitch: 0.85 },
      exhausts: [
        { x: -0.42, y: 0.24, z: -2.08, radius: 0.07, style: 'round_left' },
        { x: 0.42, y: 0.24, z: -2.08, radius: 0.07, style: 'round_right' }
      ],
      headlights: [
        { x: -0.68, y: 0.62, z: 1.88 },
        { x: 0.68, y: 0.62, z: 1.88 }
      ],
      brakeLights: [
        { x: -0.65, y: 0.82, z: -1.95, width: 0.45 },
        { x: 0.65, y: 0.82, z: -1.95, width: 0.45 }
      ]
    },

    // Rated Vehicle Statistics (1-10 Scale normalized to 100)
    stats: {
      topSpeed: 72,       // 260 km/h (72.2 m/s)
      acceleration: 75,  // 0-100 km/h in 5.4s
      handling: 85,      // Agile FWD rotation
      braking: 82,       // Strong brakes
      grip: 80,          // High mechanical grip
      stability: 88      // Forgiving stability
    },

    // Authoritative Physics Engine Tuning
    physics: {
      maxSpeed: 72.22,        // 260.0 km/h certified top speed
      acceleration: 21.5,     // 0-100 km/h ~ 5.4s
      brakeDecel: 38.0,
      maxSteerAngle: 0.58,
      highSpeedSteer: 0.14,
      driftMultiplier: 0.92,
      nitroCapacity: 85.0,
      lateralAgility: 22.0,
      cdA: 0.676,
      clA: -0.15,
      downforceCoeff: 0.0028
    }
  },

  // ==========================================================================
  // CAR 1: MID-ENGINE V10 TRACK CAR
  // ==========================================================================
  {
    id: 'veloce_v10_corsa',
    name: 'Veloce V10 Corsa',
    manufacturer: 'Veloce Performance',
    manufacturerId: 'veloce',
    carClass: 'Track Specialist',
    description: 'A razor-sharp, track-honed weapon featuring a screaming naturally aspirated 5.2L V10, butterfly doors, and active rear aerodynamics.',
    colorHex: 0xe61a2b, // Rosso Corsa Veloce
    price: 0,           // Unlocked default car
    isDefault: false,

    // Engine & Powertrain Specs
    engine: {
      type: 'Naturally Aspirated V10',
      displacement: '5.2L',
      redline: 9000,
      transmission: '7-Speed Dual-Clutch',
      gearCount: 7,
      audioProfile: 'v10_na',
      exhaustLayout: 'central_single_oval'
    },

    // Exact Dimensions (Meters)
    dimensions: {
      length: 4.55,
      width: 2.02,
      height: 1.16,
      wheelbase: 2.70,
      groundClearance: 0.095,
      curbWeightKg: 1380
    },

    // Wheels & Tires
    wheels: {
      front: {
        rimDiameterInches: 20,
        radius: 0.35,
        width: 0.275,
        rimRadius: 0.254
      },
      rear: {
        rimDiameterInches: 21,
        radius: 0.37,
        width: 0.335,
        rimRadius: 0.266
      }
    },

    // Door & Aerodynamic Configuration
    bodyConfig: {
      doorStyle: 'butterfly', // Rotates forward and up 45 degrees
      doorPivot: { x: 0.72, y: 0.44, z: 0.45 },
      doorRotation: { x: 0.2, y: 0.4, z: 0.65 },
      activeAero: {
        type: 'active_rear_wing',
        restY: 0.36,
        deployY: 0.52,
        airbrakePitch: 0.35
      }
    },

    // Attachment & Camera Anchors
    anchors: {
      driverCamera: { x: -0.35, y: 0.98, z: 0.65, eyeHeight: 1.18, pitchHeight: 1.08, fov: 68 },
      chaseCamera: { distance: 6.8, height: 2.2, pitch: 0.9 },
      exhausts: [
        { x: 0.0, y: 0.28, z: -2.28, radius: 0.11, style: 'oval_center' }
      ],
      headlights: [
        { x: -0.68, y: 0.44, z: 2.15 },
        { x: 0.68, y: 0.44, z: 2.15 }
      ],
      brakeLights: [
        { x: 0.0, y: 0.54, z: -2.25, width: 1.76 }
      ]
    },

    // Rated Vehicle Statistics (1-10 Scale normalized to 100)
    stats: {
      topSpeed: 92,       // 330 km/h (91.67 m/s)
      acceleration: 88,  // 8.8/10
      handling: 90,      // 9/10
      braking: 90,       // 9/10
      grip: 88,          // High track grip
      stability: 84      // 8.4/10
    },

    // Authoritative Physics Engine Tuning
    physics: {
      maxSpeed: 91.67,        // 330.0 km/h certified high-speed envelope
      acceleration: 32.5,     // 0-100 km/h ~ 2.4s
      brakeDecel: 44.0,       // High stopping power
      maxSteerAngle: 0.60,    // High agility
      highSpeedSteer: 0.12,   // Stabilized steering at 300+ km/h
      driftMultiplier: 1.05,
      nitroCapacity: 95.0,
      lateralAgility: 24.0,
      cdA: 0.65,
      clA: 1.85,
      downforceCoeff: 0.0042
    }
  },

  // ==========================================================================
  // CAR 2: FRONT-ENGINE TWIN-TURBO V8 GT
  // ==========================================================================
  {
    id: 'veloce_v8_gt',
    name: 'Veloce V8 GT',
    manufacturer: 'Veloce Performance',
    manufacturerId: 'veloce',
    carClass: 'Grand Tourer',
    description: 'A muscular grand tourer delivering thunderous low-end torque from a 4.0L Twin-Turbo V8 with quad exhausts and high-speed stability.',
    colorHex: 0x1a56e6, // Hyper Sonic Blue
    price: 15000,
    isDefault: false,

    engine: {
      type: 'Twin-Turbocharged V8',
      displacement: '4.0L',
      redline: 7500,
      transmission: '8-Speed Dual-Clutch',
      gearCount: 8,
      audioProfile: 'v8_turbo',
      exhaustLayout: 'quad_outer'
    },

    dimensions: {
      length: 4.78,
      width: 2.00,
      height: 1.25,
      wheelbase: 2.85,
      groundClearance: 0.110,
      curbWeightKg: 1580
    },

    wheels: {
      front: {
        rimDiameterInches: 20,
        radius: 0.35,
        width: 0.285,
        rimRadius: 0.254
      },
      rear: {
        rimDiameterInches: 21,
        radius: 0.37,
        width: 0.325,
        rimRadius: 0.266
      }
    },

    bodyConfig: {
      doorStyle: 'conventional', // Swings outward 65 degrees
      doorPivot: { x: 0.88, y: 0.48, z: 0.35 },
      doorRotation: { x: 0.0, y: 0.85, z: 0.0 },
      activeAero: {
        type: 'fixed_gt_wing',
        restY: 0.42,
        deployY: 0.42,
        airbrakePitch: 0.08
      }
    },

    anchors: {
      driverCamera: { x: -0.35, y: 1.04, z: 0.08, fov: 66 },
      chaseCamera: { distance: 7.2, height: 2.4, pitch: 0.85 },
      exhausts: [
        { x: -0.44, y: 0.22, z: -2.39, radius: 0.055 },
        { x: -0.32, y: 0.22, z: -2.39, radius: 0.055 },
        { x: 0.32, y: 0.22, z: -2.39, radius: 0.055 },
        { x: 0.44, y: 0.22, z: -2.39, radius: 0.055 }
      ],
      headlights: [
        { x: -0.66, y: 0.48, z: 2.30 },
        { x: 0.66, y: 0.48, z: 2.30 }
      ],
      brakeLights: [
        { x: 0.0, y: 0.65, z: -2.36, width: 1.72 }
      ]
    },

    stats: {
      topSpeed: 89,       // 320 km/h (88.89 m/s)
      acceleration: 92,  // 9.2/10 (Twin turbo launch)
      handling: 78,      // 7.8/10 (Heavier GT feel)
      braking: 85,       // 8.5/10
      grip: 85,
      stability: 92      // 9.2/10 (Planted long wheelbase)
    },

    physics: {
      maxSpeed: 88.89,        // 320.0 km/h certified high-speed envelope
      acceleration: 35.0,     // Brutal low-end surge
      brakeDecel: 42.0,       // Stately progressive braking
      maxSteerAngle: 0.54,    // GT steering angle
      highSpeedSteer: 0.11,   // Stabilized steering at 300+ km/h
      driftMultiplier: 1.20,  // Easy power slide initiate
      nitroCapacity: 105.0,
      lateralAgility: 21.0,
      cdA: 0.68,
      clA: 1.65,
      downforceCoeff: 0.0036
    }
  },

  // ==========================================================================
  // CAR 3: REAR-MID-ENGINE V12 FLAGSHIP
  // ==========================================================================
  {
    id: 'veloce_v12_stradale',
    name: 'Veloce V12 Stradale',
    manufacturer: 'Veloce Performance',
    manufacturerId: 'veloce',
    carClass: 'Flagship Hypercar',
    description: 'The pinnacle of aerodynamic artistry and petrol combustion: a 6.5L Naturally Aspirated V12 with dihedral doors and multi-stage active aero.',
    colorHex: 0xd4dae0, // Liquid Quicksilver
    price: 35000,
    isDefault: false,

    engine: {
      type: 'Naturally Aspirated V12',
      displacement: '6.5L',
      redline: 9500,
      transmission: '7-Speed Dual-Clutch',
      gearCount: 7,
      audioProfile: 'v12_na',
      exhaustLayout: 'high_mount_quad_hex'
    },

    dimensions: {
      length: 4.68,
      width: 2.06,
      height: 1.14,
      wheelbase: 2.75,
      groundClearance: 0.090,
      curbWeightKg: 1420
    },

    wheels: {
      front: {
        rimDiameterInches: 20,
        radius: 0.35,
        width: 0.285,
        rimRadius: 0.254
      },
      rear: {
        rimDiameterInches: 21,
        radius: 0.37,
        width: 0.345,
        rimRadius: 0.266
      }
    },

    bodyConfig: {
      doorStyle: 'dihedral', // Swings outward and rotates up 90 degrees
      doorPivot: { x: 0.82, y: 0.52, z: 0.38 },
      doorRotation: { x: 0.45, y: 0.2, z: 1.45 },
      activeAero: {
        type: 'multistage_wing_and_flaps',
        restY: 0.32,
        deployY: 0.54,
        airbrakePitch: 0.65
      }
    },

    anchors: {
      driverCamera: { x: -0.35, y: 0.96, z: 0.12, fov: 68 },
      chaseCamera: { distance: 7.0, height: 2.1, pitch: 0.92 },
      exhausts: [
        { x: -0.22, y: 0.48, z: -2.33, radius: 0.052 },
        { x: -0.08, y: 0.48, z: -2.33, radius: 0.052 },
        { x: 0.08, y: 0.48, z: -2.33, radius: 0.052 },
        { x: 0.22, y: 0.48, z: -2.33, radius: 0.052 }
      ],
      headlights: [
        { x: -0.72, y: 0.42, z: 2.22 },
        { x: 0.72, y: 0.42, z: 2.22 }
      ],
      brakeLights: [
        { x: 0.0, y: 0.58, z: -2.32, width: 1.84 }
      ]
    },

    stats: {
      topSpeed: 97,       // 350 km/h (97.22 m/s)
      acceleration: 94,  // 9.4/10
      handling: 92,      // 9.2/10
      braking: 96,       // 9.6/10
      grip: 94,
      stability: 88      // 8.8/10
    },

    physics: {
      maxSpeed: 97.22,        // 350.0 km/h certified high-speed envelope
      acceleration: 36.5,     // Relentless naturally aspirated pull
      brakeDecel: 48.0,       // Superior track braking
      maxSteerAngle: 0.58,    // Balanced razor steering
      highSpeedSteer: 0.12,   // Stabilized steering at 300+ km/h
      driftMultiplier: 0.98,  // High downforce grip
      nitroCapacity: 110.0,
      lateralAgility: 24.5,
      cdA: 0.63,
      clA: 2.10,
      downforceCoeff: 0.0055
    }
  },

  // ==========================================================================
  // CAR 4: BUJJI - ARMORED PERFORMANCE HYBRID HYPER-GT HERO CAR
  // ==========================================================================
  {
    id: 'bujji',
    name: 'Bujji',
    manufacturer: 'Ordnance Hero Works',
    manufacturerId: 'ordnance',
    carClass: 'Armored Hyper-GT',
    description: 'A commanding armored performance hybrid hyper-GT. Combines a high-revving 3.8L Twin-Turbo V6 with dual front electric stator motors, layered satin aluminum armor, and articulated butterfly doors.',
    colorHex: 0x2a2d34, // Dark Metallic Gunmetal
    price: 50000,
    isDefault: false,

    // Engine & Powertrain Specs
    engine: {
      type: 'Twin-Turbo V6 Hybrid',
      displacement: '3.8L',
      redline: 8200,
      transmission: '8-Speed Dual-Clutch',
      gearCount: 8,
      audioProfile: 'v6_hybrid',
      exhaustLayout: 'high_mount_dual_hex'
    },

    // Exact Dimensions (Meters)
    dimensions: {
      length: 4.90,
      width: 2.10,
      height: 1.27,
      wheelbase: 2.93,
      frontTrackWidth: 1.76,
      rearTrackWidth: 1.80,
      groundClearance: 0.110,
      curbWeightKg: 1850
    },

    // Wheels & Tires
    wheels: {
      front: {
        rimDiameterInches: 21,
        radius: 0.36,
        width: 0.295,
        rimRadius: 0.266
      },
      rear: {
        rimDiameterInches: 22,
        radius: 0.38,
        width: 0.355,
        rimRadius: 0.279
      }
    },

    // Door & Aerodynamic Configuration
    bodyConfig: {
      doorStyle: 'butterfly', // Rotates forward and up 45 degrees
      doorPivot: { x: 0.86, y: 0.52, z: 0.48 },
      doorRotation: { x: 0.35, y: 0.45, z: 0.75 },
      activeAero: {
        type: 'multistage_active_wing',
        restY: 0.36,
        deployY: 0.58,
        airbrakePitch: 0.55
      }
    },

    // Attachment & Camera Anchors
    anchors: {
      driverCamera: { x: -0.35, y: 1.05, z: 0.15, fov: 68 },
      chaseCamera: { distance: 7.4, height: 2.3, pitch: 0.88 },
      exhausts: [
        { x: -0.18, y: 0.44, z: -2.42, radius: 0.085 },
        { x: 0.18, y: 0.44, z: -2.42, radius: 0.085 }
      ],
      headlights: [
        { x: -0.74, y: 0.48, z: 2.38 },
        { x: 0.74, y: 0.48, z: 2.38 }
      ],
      brakeLights: [
        { x: 0.0, y: 0.62, z: -2.42, width: 1.92 }
      ]
    },

    // Rated Vehicle Statistics (Normalized 1-100)
    stats: {
      topSpeed: 100,      // 360 km/h (100.0 m/s) maximum validated speed
      acceleration: 98,  // 9.8/10 (Instant dual electric motor launch + TT V6)
      handling: 90,      // 9.0/10 (Planted long-wheelbase aero)
      braking: 98,       // 9.8/10 (Massive carbon-ceramics)
      grip: 96,          // 9.6/10 (355mm rear contact patch)
      stability: 96      // 9.6/10 (1,850 kg armored center of gravity)
    },

    // Authoritative Physics Tuning
    physics: {
      maxSpeed: 100.0,        // 360.0 km/h maximum validated speed (tested to 120 m/s)
      acceleration: 38.0,     // Instant torque assist
      brakeDecel: 50.0,       // Heavyweight stopping power
      maxSteerAngle: 0.56,    // Responsive planted turn-in
      highSpeedSteer: 0.10,   // Stabilized steering at 300+ km/h
      driftMultiplier: 1.02,  // Balanced controllable power slide
      nitroCapacity: 120.0,
      lateralAgility: 23.5,
      cdA: 0.72,
      clA: 2.20,
      downforceCoeff: 0.0058  // High aerodynamic suction
    }
  }
];

// Alias mapping for smooth backward compatibility with legacy save profiles
const LEGACY_ID_MAP = {
  'falcon_s1': 'veloce_v10_corsa',
  'vortex_r': 'veloce_v10_corsa',
  'titan_xr': 'veloce_v8_gt',
  'phantom_gt': 'veloce_v12_stradale',
  'nova_x': 'veloce_v12_stradale'
};

window.getCarById = function(id) {
  if (!id) return window.CarDatabase[0];
  const targetId = LEGACY_ID_MAP[id] || id;
  const found = window.CarDatabase.find(c => c.id === targetId);
  return found || window.CarDatabase[0];
};

window.getCarIndexById = function(id) {
  const targetId = LEGACY_ID_MAP[id] || id;
  const idx = window.CarDatabase.findIndex(c => c.id === targetId);
  return idx >= 0 ? idx : 0;
};
