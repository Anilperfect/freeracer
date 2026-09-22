/**
 * FreeRacer - District: APEX DOWNTOWN (Neon Coast)
 * ---------------------------------------------------------------------------
 * Data-only definition consumed by RoadNetwork + WorldBuilder.
 *
 * Layout: a 7×7 avenue/street grid (160 m blocks) ringed by the six-lane
 * "Apex Loop". Two six-lane axes (Apex Avenue N-S, Meridian Boulevard E-W)
 * cross at Apex Plaza — an open civic square that holds the player's garage.
 * A few interior streets are demoted to narrow service alleys, creating
 * superblocks with shortcut alleys. The south edge is the Harborline
 * waterfront (boardwalk + seawall), the other edges are construction
 * hoardings with a distant skyline behind them.
 */
(function () {
  const G = [-480, -320, -160, 0, 160, 320, 480];
  const nodeId = (ix, iz) => `n${ix}_${iz}`;

  const nodes = {};
  for (let ix = 0; ix < G.length; ix++) {
    for (let iz = 0; iz < G.length; iz++) {
      nodes[nodeId(ix, iz)] = [G[ix], G[iz]];
    }
  }

  // Interior segments that become alleys (superblock shortcuts). Keyed by
  // "ix,iz-ix,iz" for horizontal (same iz) or vertical (same ix) segments.
  const alleySegments = new Set([
    // Convention superblock (east side): drop x=160 line between z=160..480
    '4,4-4,5', '4,5-4,6',
    // Financial superblock (north-east): drop z=-320 between x=160..480
    '4,1-5,1', '5,1-6,1',
    // Old town (south-west): drop x=-320 between z=160..480
    '1,4-1,5', '1,5-1,6'
  ]);

  // Segments removed entirely (block merges into a superblock without a road).
  const removedSegments = new Set([
    '0,2-1,2' // Apex Arena occupies the merged west block
  ]);

  const edges = [];
  const addEdge = (ix0, iz0, ix1, iz1) => {
    const key = `${ix0},${iz0}-${ix1},${iz1}`;
    if (removedSegments.has(key)) return;
    const isRing = (ix0 === 0 && ix1 === 0) || (ix0 === 6 && ix1 === 6) || (iz0 === 0 && iz1 === 0) || (iz0 === 6 && iz1 === 6);
    const isAxis = (ix0 === 3 && ix1 === 3) || (iz0 === 3 && iz1 === 3);
    const isAlley = alleySegments.has(key);
    let type = 'street';
    let lanes = 2;
    let width;
    let name = null;
    if (isAlley) { type = 'alley'; lanes = 1; width = 7.5; }
    else if (isRing) { type = 'avenue'; lanes = 3; name = 'Apex Loop'; }
    else if (isAxis) { type = 'avenue'; lanes = 3; name = (ix0 === 3) ? 'Apex Avenue' : 'Meridian Boulevard'; }
    edges.push({ a: nodeId(ix0, iz0), b: nodeId(ix1, iz1), type, lanes, width, name, noTraffic: isAlley });
  };

  for (let ix = 0; ix < G.length; ix++) {
    for (let iz = 0; iz < G.length; iz++) {
      if (ix < G.length - 1) addEdge(ix, iz, ix + 1, iz);
      if (iz < G.length - 1) addEdge(ix, iz, ix, iz + 1);
    }
  }

  window.DistrictApexDowntown = {
    id: 'apex_downtown',
    name: 'Apex Downtown',
    tagline: 'Where the neon never sleeps.',
    lightingProfile: 'neon_dusk',
    bounds: { minX: -600, maxX: 600, minZ: -600, maxZ: 520 },
    gridLines: G,
    nodes,
    edges,

    // Open civic square around the central crossing — no buildings, paved.
    plaza: { minX: -160, maxX: 160, minZ: -160, maxZ: 160 },

    // Player garage — building footprint + entry trigger.
    garage: {
      name: 'Apex Plaza Garage',
      building: { x: 84, z: -84, width: 70, depth: 52, height: 14, yaw: 0 },
      entry: { x: 84, z: -40, radius: 9 },
      spawn: { x: 60, z: -22, yaw: Math.PI * 0.5 } // facing +X along Meridian Blvd
    },

    // Where the player appears on first entry (and reset fallback).
    spawn: { x: 40, z: 22, yaw: Math.PI * 0.5 },

    // Points of interest (first visit grants credits + reputation).
    discoveries: [
      { id: 'apex_plaza', name: 'Apex Plaza', x: -60, z: 60, radius: 45, credits: 300, rep: 60 },
      { id: 'skyline_tower', name: 'Skyline Tower', x: -240, z: -240, radius: 40, credits: 400, rep: 80 },
      { id: 'harbor_overlook', name: 'Harborline Overlook', x: 0, z: 500, radius: 40, credits: 400, rep: 80 },
      { id: 'north_gate', name: 'North Gate', x: 0, z: -480, radius: 35, credits: 300, rep: 60 },
      { id: 'convention_alley', name: 'Convention Alleys', x: 160, z: 320, radius: 30, credits: 500, rep: 100 },
      { id: 'apex_arena', name: 'Apex Arena', x: -320, z: -160, radius: 30, credits: 500, rep: 100 },
      { id: 'old_town', name: 'Old Town Alleys', x: -320, z: 320, radius: 30, credits: 500, rep: 100 },
      { id: 'financial_row', name: 'Financial Row', x: 320, z: -320, radius: 30, credits: 500, rep: 100 }
    ],

    // Landmark structures placed by the builder (in addition to procedural blocks).
    landmarks: [
      { type: 'tower', name: 'Skyline Tower', x: -240, z: -240, width: 48, depth: 48, height: 260, style: 'glass' },
      { type: 'tower', name: 'Meridian Spire', x: 240, z: 240, width: 40, depth: 40, height: 220, style: 'glass' },
      { type: 'stadium', name: 'Apex Arena', x: -400, z: -160, rx: 58, rz: 128, height: 34 },
      { type: 'fountain', x: -60, z: 60, radius: 14 },
      { type: 'planters', area: { minX: -150, maxX: 150, minZ: -150, maxZ: 150 } }
    ],

    // Stunt ramps (drivable inclines) — start at (x,z), climb along yaw.
    ramps: [
      { x: -60, z: -110, yaw: 0, length: 22, width: 8, height: 3.2, name: 'Plaza Kicker' },
      { x: 60, z: 110, yaw: Math.PI, length: 22, width: 8, height: 3.2, name: 'Plaza Kicker South' }
    ],

    trafficDensity: 1.0,
    waterfront: { z: 520, boardwalkFrom: 491 }
  };
})();
