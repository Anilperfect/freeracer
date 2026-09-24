/**
 * FreeRacer - District: HARBORLINE (Neon Coast)
 * ---------------------------------------------------------------------------
 * Data-only definition consumed by RoadNetwork + WorldBuilder.
 *
 * Layout: a 5×5 industrial grid (200 m blocks) ringed by the six-lane
 * \"Harbor Loop\". Two axes — Crane Avenue (N-S) and Dockside Boulevard (E-W)
 * — cross at the Container Basin, an open logistics yard that holds the
 * district garage. The south edge is a working waterfront (boardwalk +
 * seawall + harbour cranes across the water). Buildings are low warehouses
 * and gantry cranes (see `theme` + `containers` landmarks).
 */
(function () {
  const G = [-400, -200, 0, 200, 400];
  const nodeId = (ix, iz) => `n${ix}_${iz}`;

  const nodes = {};
  for (let ix = 0; ix < G.length; ix++) {
    for (let iz = 0; iz < G.length; iz++) {
      nodes[nodeId(ix, iz)] = [G[ix], G[iz]];
    }
  }

  // Narrow service lanes between the warehouses (superblock shortcuts).
  const alleySegments = new Set([
    '1,2-1,3', '3,1-3,2'
  ]);

  // Container Basin swallows the central-south block entirely.
  const removedSegments = new Set([
    '2,3-3,3'
  ]);

  const edges = [];
  const addEdge = (ix0, iz0, ix1, iz1) => {
    const key = `${ix0},${iz0}-${ix1},${iz1}`;
    if (removedSegments.has(key)) return;
    const last = G.length - 1;
    const isRing = (ix0 === 0 && ix1 === 0) || (ix0 === last && ix1 === last) || (iz0 === 0 && iz1 === 0) || (iz0 === last && iz1 === last);
    const isAxis = (ix0 === 2 && ix1 === 2) || (iz0 === 2 && iz1 === 2);
    const isAlley = alleySegments.has(key);
    let type = 'street';
    let lanes = 2;
    let width;
    let name = null;
    if (isAlley) { type = 'alley'; lanes = 1; width = 7.5; }
    else if (isRing) { type = 'avenue'; lanes = 3; name = 'Harbor Loop'; }
    else if (isAxis) { type = 'avenue'; lanes = 3; name = (ix0 === 2) ? 'Crane Avenue' : 'Dockside Boulevard'; }
    edges.push({ a: nodeId(ix0, iz0), b: nodeId(ix1, iz1), type, lanes, width, name, noTraffic: isAlley });
  };

  for (let ix = 0; ix < G.length; ix++) {
    for (let iz = 0; iz < G.length; iz++) {
      if (ix < G.length - 1) addEdge(ix, iz, ix + 1, iz);
      if (iz < G.length - 1) addEdge(ix, iz, ix, iz + 1);
    }
  }

  window.DistrictHarborline = {
    id: 'harborline',
    name: 'Harborline',
    tagline: 'Diesel, salt and floodlights.',
    lightingProfile: 'neon_dusk',
    bounds: { minX: -540, maxX: 540, minZ: -540, maxZ: 500 },
    gridLines: G,
    nodes,
    edges,

    // Open logistics yard — paved, no procedural buildings.
    plaza: { minX: -120, maxX: 120, minZ: -40, maxZ: 200 },
    plazaName: 'Container Basin',

    garage: {
      name: 'Basin Garage',
      sign: 'BASIN GARAGE',
      building: { x: -60, z: 90, width: 70, depth: 52, height: 14, yaw: 0 },
      entry: { x: -60, z: 134, radius: 9 },
      spawn: { x: -36, z: 150, yaw: Math.PI * 0.5 }
    },

    spawn: { x: 20, z: 24, yaw: Math.PI * 0.5 },

    discoveries: [
      { id: 'container_basin', name: 'Container Basin', x: 40, z: 120, radius: 45, credits: 400, rep: 80 },
      { id: 'crane_row', name: 'Crane Row', x: -300, z: -300, radius: 40, credits: 500, rep: 100 },
      { id: 'dry_dock', name: 'Dry Dock Gate', x: 300, z: -100, radius: 35, credits: 500, rep: 100 },
      { id: 'fog_horn_point', name: 'Fog Horn Point', x: 0, z: 470, radius: 40, credits: 400, rep: 80 },
      { id: 'old_ferry', name: 'Old Ferry Terminal', x: -400, z: 300, radius: 35, credits: 600, rep: 120 },
      { id: 'night_gate', name: 'Night Gate', x: 0, z: -400, radius: 35, credits: 400, rep: 80 }
    ],

    landmarks: [
      { type: 'tower', name: 'Harbor Control', x: 300, z: 300, width: 40, depth: 40, height: 120, style: 'office' },
      { type: 'containers', x: 60, z: -160, cols: 6, rows: 3, gap: 16 },
      { type: 'containers', x: -260, z: 120, cols: 4, rows: 3, gap: 16 },
      { type: 'planters', area: { minX: -110, maxX: 110, minZ: -30, maxZ: 190 } }
    ],

    ramps: [
      { x: 0, z: -60, yaw: Math.PI, length: 24, width: 9, height: 3.6, name: 'Dock Kicker' }
    ],

    // Neon caches (collectibles): small pickups worth credits.
    caches: [
      { id: 'hl_cache_1', name: 'Yard Cache', x: 100, z: -20, credits: 500 },
      { id: 'hl_cache_2', name: 'Crane Cache', x: -320, z: -200, credits: 500 },
      { id: 'hl_cache_3', name: 'Ferry Cache', x: -400, z: 380, credits: 750 },
      { id: 'hl_cache_4', name: 'Basin Cache', x: 80, z: 240, credits: 500 },
      { id: 'hl_cache_5', name: 'Gate Cache', x: 200, z: -380, credits: 750 },
      { id: 'hl_cache_6', name: 'Pier Cache', x: 380, z: 430, credits: 750 }
    ],

    trafficDensity: 0.8,
    waterfront: { z: 500, boardwalkFrom: 471 },

    // Builder hints: low warehouses, sparse signage, industrial ground.
    theme: {
      ground: 0x191a1e,
      maxHeight: 60,
      density: 0.85,
      signage: 0.35,
      industrial: true
    },

    // Free-roam weather weights for this district.
    climate: { clear: 0.45, fog: 0.35, rain: 0.2 }
  };
})();
