/**
 * Turbo Rush - Declarative Vehicle Specification for Bujji
 * Conforms strictly to the project's schema.
 */

(function() {
  const BujjiVehicleData = {
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
      topSpeed: 80,       // Max 150 km/h (standard across all cars)
      acceleration: 96,  // 9.6/10 (Instant dual electric motor launch + TT V6)
      handling: 85,      // 8.5/10 (Planted long-wheelbase aero)
      braking: 95,       // 9.5/10 (Massive carbon-ceramics)
      grip: 94,          // 9.4/10 (355mm rear contact patch)
      stability: 95      // 9.5/10 (1,850 kg armored center of gravity)
    },

    // Authoritative Physics Tuning
    physics: {
      maxSpeed: 41.67,        // Strict 150.0 km/h hard cap
      acceleration: 28.5,     // Instant torque assist
      brakeDecel: 42.0,       // Heavyweight stopping power
      maxSteerAngle: 0.58,    // Responsive planted turn-in
      highSpeedSteer: 0.21,
      driftMultiplier: 1.02,  // Balanced controllable power slide
      nitroCapacity: 115.0,
      lateralAgility: 22.0,
      downforceCoeff: 0.0058  // High aerodynamic suction
    }
  };

  window.BujjiVehicleData = BujjiVehicleData;

  // Auto-register to CarDatabase if already initialized
  if (window.CarDatabase && Array.isArray(window.CarDatabase)) {
    if (!window.CarDatabase.find(c => c.id === 'bujji')) {
      window.CarDatabase.push(BujjiVehicleData);
      console.log('🏎️ Bujji vehicle data appended to CarDatabase dynamically');
    }
  }
})();
