/**
 * Turbo Rush - Map Database
 * Defines three flagship racing maps with unique track layouts,
 * environments, lighting, weather, and visual identities.
 */

const initialMaps = (typeof window !== 'undefined' && window.EmeraldHighwayData) ? [window.EmeraldHighwayData] : [];

window.MapDatabase = [
  ...initialMaps,
  // ─────────────────────────────────────────────
  // 1. HELIOS RIFT (High Speed Desert Canyon & Solar Megastructure)
  // ─────────────────────────────────────────────
  {
    id: 'helios_rift',
    name: 'Helios Rift',
    subtitle: 'The sun remembers everything.',
    description: 'A desert canyon concealing the ruins of an ancient solar civilization. Extreme vertical drops, 90° canyon wall rides, and an inverted ceiling run through the Underforge.',
    difficulty: 'Medium',
    size: 'Large',
    tags: ['Anti-Gravity', 'Vertical Drop', 'Wall Ride', 'Chasm Jump'],
    recommendedStyle: 'High speed magnetic commitment and mid-air alignment',
    cardImage: 'assets/maps/helios_rift.jpg',

    accent: {
      primary: '#f0a030',     // Amber
      secondary: '#1a1a2e',   // Obsidian
      glow: 'rgba(240, 160, 48, 0.5)',
      energy: '#00c8ff'       // Blue energy
    },

    environment: {
      bgColor: 0xd4a060,
      fogColor: 0xc89050,
      fogDensity: 0.0018,
      groundColor: 0xc2a060,

      hemiSkyColor: 0xffeedd,
      hemiGroundColor: 0x8b6914,
      hemiIntensity: 0.8,

      dirColor: 0xfffaed,
      dirIntensity: 2.2,
      dirPosition: [80, 140, 60],

      ambientParticle: 'sand'
    },

    roadColor: 0x2e271c,
    roadWidth: 11.5,
    glowColor: 0x00f0ff,
    centerlineColor: 0xffaa00,
    curbColors: [0xf0a030, 0x222222],
    railColor: 0x00d8ff,

    // 3D Spline Coordinates [X, Y, Z] with genuine elevation, canyon dives, and twists
    splinePoints: [
      [0, 5, 0],         // Start / Finish straight
      [80, 12, 10],      // High speed uphill approach
      [150, 35, 45],     // Cresting the solar dune ridge
      [190, 55, 110],    // High cliff edge
      [175, 15, 185],    // Plunging steep vertical canyon dive
      [120, -10, 230],   // Canyon floor high-speed curve
      [40, 10, 250],     // Wall-riding turn (left wall 75°)
      [-40, 35, 230],    // Rising toward the Rift Bridge
      [-100, 48, 175],   // High-altitude launch ramp (Jump gap)
      [-155, 28, 105],   // Magnetic landing zone across the abyss
      [-170, 42, 15],    // Entering the Underforge tunnel
      [-140, 58, -60],   // Inverted ceiling run (180° inverted anti-gravity)
      [-80, 30, -85],    // Diving out of the underforge
      [-30, 12, -45]     // Final sweeping turn leveling onto start grid
    ],

    // Bank angle profile (radians around tangent):
    // 0 = flat ground, Math.PI/2 = 90° right wall, -Math.PI/2 = 90° left wall, Math.PI = 180° ceiling
    bankProfile: [
      { u: 0.00, bank: 0.0 },
      { u: 0.15, bank: 0.25 },
      { u: 0.28, bank: 0.45 },
      { u: 0.42, bank: 1.25 },   // 72° steep wall-ride
      { u: 0.52, bank: 0.10 },
      { u: 0.60, bank: 0.0 },    // Jump launcher
      { u: 0.68, bank: 0.2 },    // Landing zone
      { u: 0.78, bank: Math.PI }, // Inverted ceiling section!
      { u: 0.88, bank: Math.PI * 0.5 }, // Corkscrewing down
      { u: 1.00, bank: 0.0 }
    ],

    // Jump zones [uStart, uEnd] where track has intentional aerial gaps
    jumps: [
      { uStart: 0.58, uEnd: 0.64, label: 'Rift Chasm Launch' }
    ],

    // Boost pad locations along u [0.0 - 1.0]
    boostPads: [0.05, 0.38, 0.72],

    landmarks: [
      { type: 'sun_gate', label: 'Sun Gate', uPosition: 0.0, description: 'Massive stone gateway straddling the start/finish straight' },
      { type: 'solar_basilica', label: 'Solar Basilica', uPosition: 0.25, description: 'Circular arena beneath a damaged dome' },
      { type: 'canyon_walls', label: 'Glass Dunes', uPosition: 0.42, description: '75° vertical wall-ride along mirror canyon cliffs' },
      { type: 'rift_bridge', label: 'The Rift Leap', uPosition: 0.60, description: 'Supersonic jump launcher over the bottomless canyon' },
      { type: 'underforge_tunnel', label: 'The Underforge', uPosition: 0.80, description: '180° inverted ceiling mag-track with glowing energy conduits' }
    ]
  },

  // ─────────────────────────────────────────────
  // 2. DROWNED MERIDIAN (Flooded Cyber City & Skyscraper Wall-Rides)
  // ─────────────────────────────────────────────
  {
    id: 'drowned_meridian',
    name: 'Drowned Meridian',
    subtitle: 'The city went under. The power stayed on.',
    description: 'A flooded industrial metropolis during an electrical storm. Features high-speed highway flyovers, 90° skyscraper wall racing, and a double-corkscrew transit tube.',
    difficulty: 'High',
    size: 'Medium-Large',
    tags: ['Skyscraper Wall', 'Wet Track', 'Storm Hazards', 'Double Corkscrew'],
    recommendedStyle: 'Sharp cornering and aggressive anti-gravity transitions',
    cardImage: 'assets/maps/drowned_meridian.jpg',

    accent: {
      primary: '#00d4d4',     // Teal
      secondary: '#8b3a00',   // Rust orange
      glow: 'rgba(0, 212, 212, 0.5)',
      energy: '#ff3333'       // Emergency red
    },

    environment: {
      bgColor: 0x08121a,
      fogColor: 0x0a1622,
      fogDensity: 0.0035,
      groundColor: 0x11161d,

      hemiSkyColor: 0x335577,
      hemiGroundColor: 0x050a0f,
      hemiIntensity: 0.45,

      dirColor: 0x88ccff,
      dirIntensity: 1.1,
      dirPosition: [40, 120, 30],

      ambientParticle: 'rain'
    },

    roadColor: 0x161b22,
    roadWidth: 11.0,
    glowColor: 0x00f0ff,
    centerlineColor: 0x00ffff,
    curbColors: [0x00aaaa, 0x1f242c],
    railColor: 0x00ffff,

    splinePoints: [
      [0, 8, 0],
      [65, 14, 10],
      [115, 32, 45],
      [135, 60, 105],   // Climbing skyscraper highway
      [110, 75, 150],   // 90° vertical wall ride along skyscraper glass
      [55, 45, 175],    // Diving off the tower
      [0, 10, 155],     // Low flooded street run
      [-55, -2, 120],   // Water splash highway
      [-100, 20, 70],   // Corkscrew entrance
      [-120, 50, 5],    // Elevated rail loop
      [-95, 35, -55],   // Jump launch over ruined monorail
      [-45, 18, -45]    // Landing straight into final chicane
    ],

    bankProfile: [
      { u: 0.00, bank: 0.0 },
      { u: 0.20, bank: 0.35 },
      { u: 0.35, bank: Math.PI * 0.5 },  // 90° skyscraper wall ride!
      { u: 0.48, bank: 0.2 },
      { u: 0.62, bank: -0.4 },
      { u: 0.75, bank: Math.PI * 0.9 }, // High bank twist
      { u: 0.88, bank: 0.0 },           // Monorail jump
      { u: 1.00, bank: 0.0 }
    ],

    jumps: [
      { uStart: 0.82, uEnd: 0.88, label: 'Monorail Gap Leap' }
    ],

    boostPads: [0.08, 0.42, 0.78],

    landmarks: [
      { type: 'flooded_terminal', label: 'Flooded Terminal', uPosition: 0.0, description: 'Ruined central transportation hub at start/finish' },
      { type: 'meridian_market', label: 'Meridian Market', uPosition: 0.22, description: 'Neon reflections and flooded speedways' },
      { type: 'reactor_spine', label: 'Apex Tower Wall', uPosition: 0.38, description: '90° vertical glass wall ride high above the floodwaters' },
      { type: 'stormwall_avenue', label: 'Stormwall Avenue', uPosition: 0.65, description: 'Electrical substations with dynamic lightning arcs' },
      { type: 'lower_meridian', label: 'Monorail Overpass Jump', uPosition: 0.84, description: 'High velocity jump across severed skyway tracks' }
    ]
  },

  // ─────────────────────────────────────────────
  // 3. THORNWILD CROWN (Bioluminescent Megastructure Rainforest)
  // ─────────────────────────────────────────────
  {
    id: 'thornwild_crown',
    name: 'Thornwild Crown',
    subtitle: 'The forest was here first.',
    description: 'A colossal bioluminescent rainforest entwined through ancient alien spire ruins. Features a vertical 360° roller-coaster loop, canopy ceiling rides, and gravity-defying root corkscrews.',
    difficulty: 'Expert',
    size: 'Large',
    tags: ['Vertical Loop', 'Canopy Run', 'Extreme G-Force', 'Root Tunnels'],
    recommendedStyle: 'Precision line management through high G-force inversions',
    cardImage: 'assets/maps/thornwild_crown.jpg',

    accent: {
      primary: '#22cc88',     // Emerald
      secondary: '#c89030',   // Amber
      glow: 'rgba(34, 204, 136, 0.5)',
      energy: '#00e8ff'       // Cyan bioluminescence
    },

    environment: {
      bgColor: 0x061408,
      fogColor: 0x091c0e,
      fogDensity: 0.0028,
      groundColor: 0x142818,

      hemiSkyColor: 0x99ddaa,
      hemiGroundColor: 0x081c0c,
      hemiIntensity: 0.6,

      dirColor: 0xddffcc,
      dirIntensity: 1.6,
      dirPosition: [60, 180, 40],

      ambientParticle: 'spores'
    },

    roadColor: 0x1a261c,
    roadWidth: 11.0,
    glowColor: 0x00ff88,
    centerlineColor: 0x00ff88,
    curbColors: [0x22cc88, 0x112214],
    railColor: 0x00ffaa,

    splinePoints: [
      [0, 6, 0],
      [90, 18, 15],
      [160, 45, 55],
      [190, 85, 130],   // Climbing high into the giant canopy
      [180, 110, 195],  // Top of the canopy apex
      [135, 70, 245],   // Vertical dive into the Hollow Root
      [65, 30, 270],    // 360° corkscrew loop entrance
      [-15, 55, 260],   // Looping upside-down through the ancient spire
      [-85, 20, 210],   // Exiting loop into root canyon
      [-145, 12, 135],  // Super-fast root straight
      [-165, 38, 45],   // Emberroot Ravine jump launcher
      [-125, 22, -35],  // Bioluminescent landing pads
      [-55, 10, -55]    // Sweeping curve back to start
    ],

    bankProfile: [
      { u: 0.00, bank: 0.0 },
      { u: 0.20, bank: 0.4 },
      { u: 0.35, bank: 0.8 },
      { u: 0.50, bank: Math.PI },       // 180° inverted canopy run
      { u: 0.62, bank: Math.PI * 1.5 }, // Corkscrew rotation
      { u: 0.72, bank: 0.3 },
      { u: 0.85, bank: 0.0 },           // Ravine jump
      { u: 1.00, bank: 0.0 }
    ],

    jumps: [
      { uStart: 0.80, uEnd: 0.86, label: 'Emberroot Chasm Launch' }
    ],

    boostPads: [0.06, 0.40, 0.75],

    landmarks: [
      { type: 'root_cathedral', label: 'Root Cathedral', uPosition: 0.0, description: 'Interlocking bioluminescent tree roots around the start grid' },
      { type: 'moonwell_basin', label: 'Moonwell Basin', uPosition: 0.22, description: 'Reflective glowing pools and floating spore clouds' },
      { type: 'canopy_crown', label: 'Canopy Crown Inversion', uPosition: 0.48, description: '180° inverted ceiling track high in the colossal tree branches' },
      { type: 'titan_nest', label: 'Spire Corkscrew Loop', uPosition: 0.62, description: 'G-force roller-coaster spiral twisting through alien spire ruins' },
      { type: 'emberroot_ravine', label: 'Emberroot Chasm Launch', uPosition: 0.82, description: 'Aerial leap over fiery volcanic plant vents' }
    ]
  }
];

window.getMapById = function(id) {
  return window.MapDatabase.find(m => m.id === id) || window.MapDatabase[0];
};
