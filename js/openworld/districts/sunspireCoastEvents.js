/**
 * FreeRacer - Sunspire Coast event roster (data only).
 * ---------------------------------------------------------------------------
 * Node grid: n{ix}_{iz}; ix 0..5 → x −450..450, iz 0..5 → z −450..450.
 */
(function () {
  window.DistrictSunspireCoastEvents = [
    {
      id: 'sunspire_coast_sprint',
      name: 'Coast Highway Sprint',
      type: 'sprint',
      tier: 3,
      crew: 'neon_circuit',
      tagline: 'Full-send down the Coast Highway, then the beachfront run to the Dune Overlook.',
      route: ['n0_2', 'n5_2', 'n5_5', 'n2_5'],
      opponents: 3,
      aiSkill: 0.88,
      rivalCars: ['apexforge_halo', 'voltrix_ion', 'veloce_v10_corsa'],
      rewards: { credits: [4200, 2600, 1600, 700], reputation: [680, 420, 260, 110] },
      unlockRep: 3500
    },
    {
      id: 'sunspire_tunnel_dash',
      name: 'Palm Tunnel Dash',
      type: 'timetrial',
      tier: 3,
      tagline: 'Solo attack from the North Arch to the plaza. The Circuit holds every record here.',
      route: ['n3_0', 'n3_2', 'n5_2', 'n5_4', 'n2_4', 'n2_2'],
      opponents: 0,
      medalSpeeds: { gold: 27, silver: 22, bronze: 17 },
      rewards: { credits: { gold: 3200, silver: 2100, bronze: 1300, none: 400 }, reputation: { gold: 520, silver: 330, bronze: 190, none: 50 } },
      unlockRep: 4000
    },
    {
      id: 'sunspire_drift_point',
      name: 'Breakwater Drift',
      type: 'drift',
      tier: 4,
      crew: 'neon_circuit',
      tagline: 'Link the whole west side sideways, Arch to Breakwater. Lumen Park\'s home turf.',
      route: ['n3_5', 'n0_5', 'n0_0', 'n3_0'],
      opponents: 0,
      driftTargets: { gold: 1500, silver: 900, bronze: 450 },
      rewards: { credits: { gold: 3600, silver: 2300, bronze: 1400, none: 450 }, reputation: { gold: 580, silver: 360, bronze: 210, none: 55 } },
      unlockRep: 4500
    }
  ];
})();
