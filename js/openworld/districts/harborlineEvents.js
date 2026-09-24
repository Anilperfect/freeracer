/**
 * FreeRacer - Harborline event roster (data only).
 * ---------------------------------------------------------------------------
 * types: sprint (A→B vs rivals) · drift (route + drift-score medals) · circuit
 * Node grid: n{ix}_{iz}; ix 0..4 → x −400..400, iz 0..4 → z −400..400.
 */
(function () {
  window.DistrictHarborlineEvents = [
    {
      id: 'harbor_container_sprint',
      name: 'Container Sprint',
      type: 'sprint',
      tier: 2,
      crew: 'harbor_kings',
      tagline: 'Thread the basin, then flat-out along Dockside Boulevard.',
      route: ['n2_2', 'n4_2', 'n4_4', 'n1_4', 'n1_1', 'n2_1'],
      opponents: 3,
      aiSkill: 0.84,
      rivalCars: ['monarch_sovereign', 'veyra_corsair', 'veloce_v8_gt'],
      rewards: { credits: [2800, 1800, 1100, 500], reputation: [460, 290, 180, 80] },
      unlockRep: 1500
    },
    {
      id: 'harbor_drift_basin',
      name: 'Drift Basin',
      type: 'drift',
      tier: 2,
      crew: 'harbor_kings',
      tagline: 'Slide the whole dock ring. Style is the timing sheet here.',
      route: ['n0_0', 'n4_0', 'n4_4', 'n0_4'],
      opponents: 0,
      driftTargets: { gold: 1200, silver: 700, bronze: 350 },
      rewards: { credits: { gold: 2600, silver: 1700, bronze: 1000, none: 350 }, reputation: { gold: 420, silver: 260, bronze: 150, none: 40 } },
      unlockRep: 2000
    },
    {
      id: 'harbor_night_run',
      name: 'Night Haul',
      type: 'sprint',
      tier: 3,
      crew: 'harbor_kings',
      tagline: 'Crane Avenue end to end, then the ferry terminal sprint. Big Sal is watching.',
      route: ['n2_0', 'n2_4', 'n0_4', 'n0_0', 'n4_0'],
      opponents: 3,
      aiSkill: 0.88,
      rivalCars: ['monarch_sovereign', 'veloce_v12_stradale', 'veyra_corsair'],
      rewards: { credits: [3800, 2400, 1500, 650], reputation: [620, 380, 230, 100] },
      unlockRep: 2800
    }
  ];
})();
