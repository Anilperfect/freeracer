/**
 * FreeRacer - District: SUNSPIRE COAST (Neon Coast)
 * ---------------------------------------------------------------------------
 * Data-only definition consumed by RoadNetwork + WorldBuilder.
 *
 * Layout: a 6×6 resort grid (180 m blocks) ringed by the \"Sunset Loop\". The
 * east-west Coast Highway is the fastest road on the coast; Palm Avenue runs
 * north-south through Sunset Plaza. The south edge is a sandy beach meeting
 * the water (low-grip `sand` surface), with palms and hotels along the front.
 */
(function () {
  const G = [-450, -270, -90, 90, 270, 450];
  const nodeId = (ix, iz) => `n${ix}_${iz}`;

  const nodes = {};
  for (let ix = 0; ix < G.length; ix++) {
    for (let iz = 0; iz < G.length; iz++) {
      nodes[nodeId(ix, iz)] = [G[ix], G[iz]];
    }
  }

  // Beachfront service lanes behind the hotels.
  const alleySegments = new Set([
    '2,4-2,5', '3,4-3,5'
  ]);

  const removedSegments = new Set([
    '0,1-0,2' // Sunspire Resort gardens occupy the merged west block
  ]);

  const edges = [];
  const addEdge = (ix0, iz0, ix1, iz1) => {
    const key = `${ix0},${iz0}-${ix1},${iz1}`;
    if (removedSegments.has(key)) return;
    const last = G.length - 1;
    const isRing = (ix0 === 0 && ix1 === 0) || (ix0 === last && ix1 === last) || (iz0 === 0 && iz1 === 0) || (iz0 === last && iz1 === last);
    const isAxisEW = (iz0 === 2 && iz1 === 2 && ix0 !== ix1); // Coast Highway (full row)
    const isAxisNS = (ix0 === 3 && ix1 === 3 && iz0 !== iz1); // Palm Avenue (full column)
    const isAlley = alleySegments.has(key);
    let type = 'street';
    let lanes = 2;
    let width;
    let name = null;
    if (isAlley) { type = 'alley'; lanes = 1; width = 7.5; }
    else if (isRing) { type = 'avenue'; lanes = 3; name = 'Sunset Loop'; }
    else if (isAxisEW) { type = 'avenue'; lanes = 3; name = 'Coast Highway'; }
    else if (isAxisNS) { type = 'avenue'; lanes = 3; name = 'Palm Avenue'; }
    edges.push({ a: nodeId(ix0, iz0), b: nodeId(ix1, iz1), type, lanes, width, name, noTraffic: isAlley });
  };

  for (let ix = 0; ix < G.length; ix++) {
    for (let iz = 0; iz < G.length; iz++) {
      if (ix < G.length - 1) addEdge(ix, iz, ix + 1, iz);
      if (iz < G.length - 1) addEdge(ix, iz, ix, iz + 1);
    }
  }

  window.DistrictSunspireCoast = {
    id: 'sunspire_coast',
    name: 'Sunspire Coast',
    tagline: 'Salt air and redline sunsets.',
    lightingProfile: 'neon_dusk',
    bounds: { minX: -590, maxX: 590, minZ: -590, maxZ: 520 },
    gridLines: G,
    nodes,
    edges,

    plaza: { minX: -90, maxX: 90, minZ: -90, maxZ: 90 },
    plazaName: 'Sunset Plaza',

    garage: {
      name: 'Breakwater Garage',
      sign: 'BREAKWATER GARAGE',
      building: { x: -150, z: -20, width: 70, depth: 52, height: 14, yaw: 0 },
      entry: { x: -150, z: 24, radius: 9 },
      spawn: { x: -126, z: 40, yaw: Math.PI * 0.5 }
    },

    spawn: { x: -40, z: 70, yaw: Math.PI * 0.5 },

    discoveries: [
      { id: 'sunset_plaza', name: 'Sunset Plaza', x: 40, z: -40, radius: 40, credits: 400, rep: 80 },
      { id: 'sunspire_hotel', name: 'Sunspire Grand Hotel', x: 270, z: -270, radius: 40, credits: 500, rep: 100 },
      { id: 'breakwater', name: 'Breakwater Point', x: -450, z: 430, radius: 40, credits: 600, rep: 120 },
      { id: 'palm_row', name: 'Palm Row', x: 90, z: 270, radius: 35, credits: 400, rep: 80 },
      { id: 'dune_overlook', name: 'Dune Overlook', x: 450, z: 430, radius: 40, credits: 600, rep: 120 },
      { id: 'north_arch', name: 'North Arch', x: 0, z: -450, radius: 35, credits: 400, rep: 80 }
    ],

    landmarks: [
      { type: 'tower', name: 'Sunspire Grand Hotel', x: 270, z: -270, width: 44, depth: 44, height: 150, style: 'glass' },
      { type: 'fountain', x: 40, z: -40, radius: 12 },
      { type: 'planters', area: { minX: -80, maxX: 80, minZ: -80, maxZ: 80 } }
    ],

    ramps: [
      { x: 180, z: 180, yaw: Math.PI * 0.75, length: 22, width: 8, height: 3.2, name: 'Dune Kicker' }
    ],

    caches: [
      { id: 'sc_cache_1', name: 'Plaza Cache', x: -60, z: 60, credits: 600 },
      { id: 'sc_cache_2', name: 'Hotel Cache', x: 340, z: -270, credits: 750 },
      { id: 'sc_cache_3', name: 'Breakwater Cache', x: -430, z: 380, credits: 900 },
      { id: 'sc_cache_4', name: 'Dune Cache', x: 450, z: 400, credits: 900 },
      { id: 'sc_cache_5', name: 'Arch Cache', x: -90, z: -430, credits: 600 },
      { id: 'sc_cache_6', name: 'Palm Cache', x: 160, z: 270, credits: 600 }
    ],

    trafficDensity: 0.9,
    waterfront: { z: 520, boardwalkFrom: 491 },

    // Sandy beach strip south of `beach.from` (low-grip sand surface).
    beach: { from: 400 },

    theme: {
      ground: 0x1c1e16,
      maxHeight: 80,
      density: 0.75,
      signage: 0.5,
      coastal: true
    },

    climate: { clear: 0.7, fog: 0.15, rain: 0.15 }
  };
})();
