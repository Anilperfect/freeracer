/**
 * Turbo Rush - Emerald Highway Run Declarative Map Definition
 * Features:
 * - 4.8 km Two-Way Countryside Expressway
 * - 4 Lanes total (2 Outbound, 2 Return) with Left-Hand Traffic Rules
 * - 8-12m Central Grass Median with Controlled Crossovers
 * - Continuous Outer Concrete Safety Barriers
 * - Rock-Cut Forest Tunnel & 270° Cloverleaf Turnaround Interchange
 * - Two Strategic Route-Choice Zones with Exactly 3 Speed-Boost Pads
 */

(function() {
  const EmeraldHighwayData = {
    id: 'emerald_highway',
    name: 'Emerald Highway Run',
    subtitle: 'Two-Way Countryside Expressway',
    description: 'A professional 4.8 km two-way countryside highway course with four lanes, left-hand civilian traffic, a rock-cut forest tunnel, a cloverleaf turnaround interchange, and high-risk shortcut branches.',
    difficulty: 'Challenging',
    size: 'Long (4.8 km)',
    tags: ['Two-Way Highway', 'Left-Hand Traffic', 'Rock-Cut Tunnel', 'Cloverleaf Turnaround', 'Route Choice'],
    recommendedStyle: 'High-speed line discipline, highway drafting, and sharp shortcut execution',
    cardImage: 'assets/maps/emerald_highway.jpg',

    accent: {
      primary: '#10b981',     // Emerald Green
      secondary: '#0f172a',   // Deep Slate
      glow: 'rgba(16, 185, 129, 0.45)',
      energy: '#00f0ff'
    },

    environment: {
      bgColor: 0x87ceeb,      // Crisp Countryside Sky
      fogColor: 0xcbe4f7,     // Soft atmospheric haze
      fogDensity: 0.00045,    // Open highway long draw distance
      groundColor: 0x3d7038,  // Verdant emerald pasture

      hemiSkyColor: 0xf4f9ff,
      hemiGroundColor: 0x2e5c2b,
      hemiIntensity: 0.88,

      dirColor: 0xfffbee,     // Warm natural sunlight
      dirIntensity: 2.1,
      dirPosition: [120, 220, 80],

      ambientParticle: 'leaf'
    },

    roadColor: 0x1f232b,      // Modern high-grade asphalt
    roadWidth: 11.2,          // 2 lanes (7.3m) + outer shoulder (2.5m) + inner shoulder (1.4m)
    glowColor: 0x10b981,
    centerlineColor: 0xffffff, // White dashed lane divider (Left-hand traffic standard)
    curbColors: [0x1f232b, 0x14171d],
    railColor: 0x94a3b8,      // Galvanized steel & concrete barrier reflector
    hideRacingLine: true,     // Road-arrow navigation used instead of floating ribbons

    // Gentle realistic highway elevation and broad curves (~4.8 km route)
    splinePoints: [
      // Sector 1: Starting Highway (Outbound Carriageway)
      [0, 8, 0],
      [20, 9, 130],
      [60, 11, 280],

      // Sector 2: Open Countryside
      [120, 14, 460],
      [200, 17, 680],
      [290, 20, 910],

      // Sector 3: First Route-Choice Zone (Agricultural Valley & Service Road)
      [380, 21, 1120],
      [450, 19, 1320],

      // Sector 4: Forest Ridge Approach & Rock-Cut Tunnel
      [510, 24, 1510],
      [560, 28, 1710], // Tunnel entrance (Portal West)
      [595, 29, 1900], // Tunnel interior
      [615, 26, 2090], // Tunnel exit (Portal East)

      // Sector 5: Cloverleaf Interchange Turnaround (Outbound to Return)
      [640, 22, 2280], // Deceleration ramp entry
      [715, 24, 2410], // 270-degree sweeping loop right
      [755, 28, 2330], // Bridge overpass crossing above highway
      [715, 26, 2200], // Merging down into return carriageway
      [635, 22, 2150], // Return carriageway alignment

      // Sector 6: Return Carriageway (Northbound parallel heading across 10m median)
      [585, 25, 1900],
      [535, 23, 1640],
      [475, 20, 1380],
      [405, 18, 1120],

      // Sector 7: Second Route-Choice Zone (Maintenance Bypass & Opposing Lane)
      [315, 20, 860],
      [220, 16, 610],
      [135, 14, 380],

      // Sector 8: Final Highway Approach & Home Straight
      [70, 11, 190],
      [20, 9, 65],
      [-5, 8, 12]
    ],

    // Civil engineering drainage banking (all gentle: -2.5° to +3.5°)
    bankProfile: [
      { u: 0.00, bank: 0.00 },
      { u: 0.12, bank: 0.03 },
      { u: 0.25, bank: 0.04 },
      { u: 0.38, bank: -0.03 },
      { u: 0.50, bank: 0.05 },  // Cloverleaf turn entry
      { u: 0.54, bank: 0.06 },  // Cloverleaf loop
      { u: 0.58, bank: 0.02 },  // Return alignment
      { u: 0.72, bank: -0.04 },
      { u: 0.88, bank: 0.03 },
      { u: 1.00, bank: 0.00 }
    ],

    // No impossible aerial stunt jumps: continuous road surface throughout
    jumps: [],

    // EXACTLY THREE SPEED-BOOST PADS (Exclusively inside risky shortcuts)
    // 1. Sector 3 Service-Road Shortcut
    // 2. Sector 7 Tunnel-Maintenance Bypass
    // 3. Sector 7 Controlled Opposing-Lane Shortcut
    boostPads: [0.275, 0.735, 0.845],

    // Major Geographic & Engineering Landmarks
    landmarks: [
      { type: 'start_gantry', label: 'Emerald Gateway Gantry', uPosition: 0.0, description: '4-lane highway gantry with digital countdown lighting' },
      { type: 'farmland_valley', label: 'Willow Creek Valley', uPosition: 0.20, description: 'Sweeping countryside highway with instanced oaks and pastures' },
      { type: 'service_shortcut', label: 'Valley Service Road (Booster 1)', uPosition: 0.275, description: 'Narrow service access bypass with Booster 1' },
      { type: 'rock_tunnel', label: 'Blackwood Rock-Cut Tunnel', uPosition: 0.38, description: 'Twin-bore mountain tunnel through the granite ridge' },
      { type: 'cloverleaf_interchange', label: 'Cloverleaf Turnaround', uPosition: 0.52, description: '270° grade-separated highway interchange reversal' },
      { type: 'maintenance_bypass', label: 'Ridge Maintenance Road (Booster 2)', uPosition: 0.735, description: 'Technical twisty access route with Booster 2' },
      { type: 'opposing_crossover', label: 'Controlled Opposing Expressway (Booster 3)', uPosition: 0.845, description: 'High-risk median crossover shortcut with Booster 3' },
      { type: 'finish_gantry', label: 'Grand Expressway Finish', uPosition: 0.98, description: 'Final high-speed approach to the home straight' }
    ]
  };

  window.EmeraldHighwayData = EmeraldHighwayData;

  // Insert as the primary (first) flagship map in MapDatabase
  if (window.MapDatabase && Array.isArray(window.MapDatabase)) {
    if (!window.MapDatabase.find(m => m.id === 'emerald_highway')) {
      window.MapDatabase.unshift(EmeraldHighwayData); // Set as index 0 (primary)
      console.log('🛣️ Emerald Highway Run registered as the primary racing course!');
    }
  }
})();
